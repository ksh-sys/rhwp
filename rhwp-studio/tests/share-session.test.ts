import test from 'node:test';
import assert from 'node:assert/strict';
import { ShareSession, lockExpired, roleFor, HEARTBEAT_MS, LOCK_TTL_MS, type SessionState } from '../src/share/share-session.ts';
import { ShareConflictError, ShareGoneError, type ShareMeta, type ShareProvider } from '../src/share/provider.ts';

const TOK = '0123456789abcdef0123456789abcdef';
const ME = '나#aaaaaa';
const OTHER = '남#bbbbbb';
const MIN = 60_000;

function meta(over: Partial<ShareMeta> = {}): ShareMeta {
  return { token: TOK, name: 'a.hwpx', access: 'edit', expiresAt: null, revoked: false, version: 1, byteSize: 3, lock: null, ...over };
}

function fake(initial: ShareMeta) {
  let m = initial;
  const calls: string[] = [];
  let watcher: ((meta: ShareMeta) => void) | null = null;
  const ctl = {
    lockResult: true,
    heartbeatResult: true,
    saveImpl: (async (base: number) => ({ version: base + 1 })) as (base: number) => Promise<{ version: number }>,
  };
  const provider: ShareProvider = {
    async create() { return { token: TOK, adminKey: 'k' }; },
    async open() { calls.push('open'); return { meta: m, bytes: new Uint8Array([m.version]) }; },
    async save(_t, _b, base) { calls.push(`save:${base}`); return ctl.saveImpl(base); },
    watch(_t, cb) { calls.push('watch'); watcher = cb; return () => { calls.push('unwatch'); watcher = null; }; },
    async lock(_t, by) { calls.push(`lock:${by}`); return ctl.lockResult; },
    async heartbeat() { calls.push('heartbeat'); return ctl.heartbeatResult; },
    async unlock() { calls.push('unlock'); },
    async updateSettings() {},
    async revoke() {},
    async listVersions() { return []; },
    async openVersion() { return new Uint8Array(); },
    async canCreate() { return { ok: true as const, by: 'x' }; },
  };
  return {
    provider, calls, ctl,
    setMeta(next: ShareMeta) { m = next; },
    emit(next: ShareMeta) { m = next; watcher?.(next); },
  };
}

function harness(initial: ShareMeta, now0 = 10_000_000) {
  const f = fake(initial);
  let now = now0;
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let nextId = 1;
  const states: SessionState[] = [];
  const newVersions: number[] = [];
  const session = new ShareSession({
    provider: f.provider,
    now: () => now,
    setInterval: (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms }); return id; },
    clearInterval: (h) => { timers.delete(h as number); },
    by: ME,
    onState: (s) => states.push(s),
    onNewVersion: (_bytes, m) => newVersions.push(m.version),
  });
  const flush = () => new Promise((r) => setImmediate(r));
  const tick = async () => { for (const t of [...timers.values()]) t.fn(); await flush(); };
  return {
    f, session, states, newVersions, timers, tick, flush,
    advance: (ms: number) => { now += ms; },
    get now() { return now; },
  };
}

type OpenState = Extract<SessionState, { kind: 'open' }>;
const open = (s: SessionState): OpenState => { assert.equal(s.kind, 'open'); return s as OpenState; };
const count = (calls: string[], name: string) => calls.filter((c) => c === name).length;

test('lockExpired / roleFor', () => {
  const now = 100 * MIN;
  assert.equal(lockExpired(null, now), true);
  assert.equal(lockExpired({ by: OTHER, since: 0, heartbeatAt: now - 5 * MIN }, now), false);
  assert.equal(lockExpired({ by: OTHER, since: 0, heartbeatAt: now - 31 * MIN }, now), true);
  assert.equal(LOCK_TTL_MS, 30 * MIN);
  assert.equal(HEARTBEAT_MS, MIN);
  assert.equal(roleFor(meta(), ME, now), 'editor');
  assert.equal(roleFor(meta({ access: 'view' }), ME, now), 'viewer');
  assert.equal(roleFor(meta({ lock: { by: OTHER, since: 0, heartbeatAt: now - 5 * MIN } }), ME, now), 'viewer');
  assert.equal(roleFor(meta({ lock: { by: ME, since: 0, heartbeatAt: now - 5 * MIN } }), ME, now), 'editor');
  assert.equal(roleFor(meta({ lock: { by: OTHER, since: 0, heartbeatAt: now - 31 * MIN } }), ME, now), 'editor');
});

test('열기 — 편집 권한·잠금 없음이면 편집자: 잠금 1회, 심장박동 등록, 구독, 바이트 반환', async () => {
  const h = harness(meta());
  const bytes = await h.session.open(TOK, 'adm');
  assert.deepEqual(Array.from(bytes!), [1]);
  const s = open(h.session.state);
  assert.equal(s.role, 'editor');
  assert.equal(s.lockHeld, true);
  assert.equal(s.baseVersion, 1);
  assert.equal(s.adminKey, 'adm');
  assert.equal(h.f.calls.filter((c) => c.startsWith('lock:')).length, 1);
  assert.ok(h.f.calls.includes('watch'));
  assert.equal(h.timers.size, 1);
  assert.equal([...h.timers.values()][0].ms, HEARTBEAT_MS);
});

test('열기 — 보기 권한이면 보는 사람, 잠금 시도 없음', async () => {
  const h = harness(meta({ access: 'view' }));
  await h.session.open(TOK, null);
  assert.equal(open(h.session.state).role, 'viewer');
  assert.equal(h.f.calls.some((c) => c.startsWith('lock:')), false);
  assert.equal(h.timers.size, 0);
});

test('열기 — 남이 5분 전까지 편집 중이면 보는 사람(lockedBy 표시), 31분 전이면 이어받아 편집자', async () => {
  const now0 = 10_000_000;
  const h1 = harness(meta({ lock: { by: OTHER, since: now0 - 20 * MIN, heartbeatAt: now0 - 5 * MIN } }), now0);
  await h1.session.open(TOK, null);
  const s1 = open(h1.session.state);
  assert.equal(s1.role, 'viewer');
  assert.equal(s1.lockedBy, OTHER);
  assert.equal(s1.lockedSince, now0 - 20 * MIN);
  const h2 = harness(meta({ lock: { by: OTHER, since: 0, heartbeatAt: now0 - 31 * MIN } }), now0);
  await h2.session.open(TOK, null);
  assert.equal(open(h2.session.state).role, 'editor');
  assert.equal(open(h2.session.state).lockHeld, true);
});

test('열기 — 잠금 경쟁에서 지면 보는 사람', async () => {
  const h = harness(meta());
  h.f.ctl.lockResult = false;
  await h.session.open(TOK, null);
  const s = open(h.session.state);
  assert.equal(s.role, 'viewer');
  assert.equal(s.lockHeld, false);
  assert.equal(h.timers.size, 0);
});

test('열기 — 끝난 공유(회수·만료·없음)는 gone, 바이트 null', async () => {
  const h1 = harness(meta({ revoked: true }));
  assert.equal(await h1.session.open(TOK, null), null);
  assert.equal(h1.session.state.kind, 'gone');
  const h2 = harness(meta({ expiresAt: 5 }));
  assert.equal(await h2.session.open(TOK, null), null);
  assert.equal(h2.session.state.kind, 'gone');
  const h3 = harness(meta());
  h3.f.provider.open = async () => { throw new ShareGoneError(); };
  assert.equal(await h3.session.open(TOK, null), null);
  assert.equal(h3.session.state.kind, 'gone');
});

test('심장박동 — 틱마다 보내고, 마지막 활동 30분 뒤엔 멈췄다가 활동하면 즉시 다시 확인', async () => {
  const h = harness(meta());
  await h.session.open(TOK, null);
  await h.tick();
  assert.equal(count(h.f.calls, 'heartbeat'), 1);
  h.advance(31 * MIN);
  await h.tick();
  assert.equal(count(h.f.calls, 'heartbeat'), 1, '자리 비움 — 보내지 않음');
  h.session.noteActivity();
  await h.flush();
  assert.equal(count(h.f.calls, 'heartbeat'), 2, '돌아오면 바로 확인');
  assert.equal(open(h.session.state).lockHeld, true);
  h.session.noteActivity();
  await h.flush();
  assert.equal(count(h.f.calls, 'heartbeat'), 2, '활동 중에는 틱에서만 보낸다');
});

test('자리 비운 사이 남이 잠금을 가져갔으면 돌아왔을 때 보는 사람으로 바뀌고 저장은 거부', async () => {
  const h = harness(meta());
  await h.session.open(TOK, null);
  h.advance(31 * MIN);
  await h.tick();
  h.f.ctl.heartbeatResult = false;
  h.session.noteActivity();
  await h.flush();
  const s = open(h.session.state);
  assert.equal(s.role, 'viewer');
  assert.equal(s.lockHeld, false);
  assert.equal(h.timers.size, 0);
  assert.equal(await h.session.save(new Uint8Array([9])), 'failed');
  assert.equal(h.f.calls.some((c) => c.startsWith('save:')), false);
});

test('구독 — 새 버전 & 수정 없음이면 최신본을 받아 onNewVersion, 수정 중이면 상태만(pendingVersion)', async () => {
  const h = harness(meta({ access: 'view' }));
  await h.session.open(TOK, null);
  h.f.emit(meta({ access: 'view', version: 2 }));
  await h.flush();
  assert.deepEqual(h.newVersions, [2]);
  assert.equal(open(h.session.state).baseVersion, 2);

  const e = harness(meta());
  await e.session.open(TOK, null);
  e.session.setDirty(true);
  e.f.emit(meta({ version: 3, lock: { by: ME, since: 0, heartbeatAt: e.now } }));
  await e.flush();
  assert.deepEqual(e.newVersions, []);
  assert.equal(open(e.session.state).pendingVersion, 3);
  assert.equal(open(e.session.state).baseVersion, 1);
});

test('구독 — 내가 방금 저장한 버전 알림은 다시 불러오지 않는다', async () => {
  const h = harness(meta());
  await h.session.open(TOK, null);
  await h.session.save(new Uint8Array([1]));
  h.f.emit(meta({ version: 2, lock: { by: ME, since: 0, heartbeatAt: h.now } }));
  await h.flush();
  assert.deepEqual(h.newVersions, []);
});

test('구독 — 회수되면 gone 으로 바뀌고 타이머·구독 정리', async () => {
  const h = harness(meta());
  await h.session.open(TOK, null);
  h.f.emit(meta({ revoked: true }));
  await h.flush();
  assert.equal(h.session.state.kind, 'gone');
  assert.equal(h.timers.size, 0);
  assert.ok(h.f.calls.includes('unwatch'));
});

test('구독 — 남의 잠금이 풀리면 편집 권한일 때 자동으로 잠금을 잡는다, 권한이 보기로 바뀌면 놓는다', async () => {
  const now0 = 10_000_000;
  const h = harness(meta({ lock: { by: OTHER, since: now0, heartbeatAt: now0 } }), now0);
  await h.session.open(TOK, null);
  assert.equal(open(h.session.state).role, 'viewer');
  h.f.emit(meta({ lock: null }));
  await h.flush();
  assert.equal(open(h.session.state).role, 'editor');
  assert.equal(open(h.session.state).lockHeld, true);
  h.f.emit(meta({ access: 'view', lock: { by: ME, since: now0, heartbeatAt: now0 } }));
  await h.flush();
  assert.equal(open(h.session.state).role, 'viewer');
  assert.ok(h.f.calls.includes('unlock'));
  assert.equal(h.timers.size, 0);
});

test('구독 — 늦게 온 옛 알림이 남의 잠금을 보여도, 심장박동이 내 잠금을 확인하면 편집자를 유지한다', async () => {
  const h = harness(meta());
  await h.session.open(TOK, null);
  h.f.emit(meta({ lock: { by: OTHER, since: h.now, heartbeatAt: h.now } }));
  await h.flush();
  const s = open(h.session.state);
  assert.equal(s.role, 'editor');
  assert.equal(s.lockHeld, true);
  assert.ok(h.f.calls.includes('heartbeat'));
  assert.equal(h.timers.size, 1);
});

test('구독 — 내 잠금을 남이 가져가면(서버 기준, 심장박동 거부) 보는 사람으로', async () => {
  const h = harness(meta());
  await h.session.open(TOK, null);
  h.f.ctl.heartbeatResult = false;
  h.f.emit(meta({ lock: { by: OTHER, since: h.now, heartbeatAt: h.now } }));
  await h.flush();
  const s = open(h.session.state);
  assert.equal(s.role, 'viewer');
  assert.equal(s.lockHeld, false);
  assert.equal(s.lockedBy, OTHER);
  assert.equal(h.timers.size, 0);
});

test('저장 — 성공하면 baseVersion 갱신·dirty 해제, 기타 오류는 failed(상태 유지), 충돌이면 conflict', async () => {
  const h = harness(meta());
  await h.session.open(TOK, null);
  h.session.setDirty(true);
  assert.equal(await h.session.save(new Uint8Array([1])), 'saved');
  assert.equal(open(h.session.state).baseVersion, 2);
  assert.equal(open(h.session.state).dirty, false);
  assert.ok(h.f.calls.includes('save:1'));

  h.session.setDirty(true);
  h.f.ctl.saveImpl = async () => { throw new Error('network'); };
  assert.equal(await h.session.save(new Uint8Array([1])), 'failed');
  assert.equal(open(h.session.state).dirty, true);
  assert.equal(open(h.session.state).baseVersion, 2);

  h.f.ctl.saveImpl = async () => { throw new ShareConflictError(5); };
  assert.equal(await h.session.save(new Uint8Array([1])), 'conflict');
  const c = h.session.state;
  assert.equal(c.kind, 'conflict');
  assert.equal((c as Extract<SessionState, { kind: 'conflict' }>).serverVersion, 5);
});

test('저장 — 저장 중 회수되면(ShareGoneError) gone', async () => {
  const h = harness(meta());
  await h.session.open(TOK, null);
  h.f.ctl.saveImpl = async () => { throw new ShareGoneError(); };
  assert.equal(await h.session.save(new Uint8Array([1])), 'failed');
  assert.equal(h.session.state.kind, 'gone');
});

test('최신본 열기(reloadLatest) — 충돌 상태에서 최신본을 받아 열린 상태로 돌아온다', async () => {
  const h = harness(meta());
  await h.session.open(TOK, null);
  h.f.ctl.saveImpl = async () => { throw new ShareConflictError(4); };
  await h.session.save(new Uint8Array([1]));
  h.f.setMeta(meta({ version: 4, lock: { by: ME, since: 0, heartbeatAt: h.now } }));
  const bytes = await h.session.reloadLatest();
  assert.deepEqual(Array.from(bytes!), [4]);
  const s = open(h.session.state);
  assert.equal(s.baseVersion, 4);
  assert.equal(s.dirty, false);
  assert.equal(s.pendingVersion, undefined);
});

test('이어서 편집(takeOver) — 남의 잠금이 만료됐을 때만 잡는다', async () => {
  const now0 = 10_000_000;
  const h = harness(meta({ lock: { by: OTHER, since: now0, heartbeatAt: now0 } }), now0);
  await h.session.open(TOK, null);
  assert.equal(await h.session.takeOver(), false);
  h.advance(31 * MIN);
  assert.equal(await h.session.takeOver(), true);
  assert.equal(open(h.session.state).role, 'editor');
  assert.equal(h.timers.size, 1);
});

test('닫기 — 잠금 해제·구독 해제·타이머 정리 후 idle', async () => {
  const h = harness(meta());
  await h.session.open(TOK, null);
  await h.session.close();
  assert.ok(h.f.calls.includes('unlock'));
  assert.ok(h.f.calls.includes('unwatch'));
  assert.equal(h.timers.size, 0);
  assert.equal(h.session.state.kind, 'idle');
});

test('제공자는 별도 모듈 — 오류 이름(name)만 같아도 충돌·끝남으로 알아본다', async () => {
  const h = harness(meta());
  await h.session.open(TOK, null);
  h.f.ctl.saveImpl = async () => { throw Object.assign(new Error('x'), { name: 'ShareConflictError', serverVersion: 7 }); };
  assert.equal(await h.session.save(new Uint8Array([1])), 'conflict');
  assert.equal((h.session.state as Extract<SessionState, { kind: 'conflict' }>).serverVersion, 7);
  const g = harness(meta());
  g.f.provider.open = async () => { throw Object.assign(new Error('gone'), { name: 'ShareGoneError' }); };
  assert.equal(await g.session.open(TOK, null), null);
  assert.equal(g.session.state.kind, 'gone');
});
