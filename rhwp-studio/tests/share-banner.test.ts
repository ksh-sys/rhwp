import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { bannerModel, BANNER_KEYS } from '../src/share/share-banner.ts';
import type { SessionState } from '../src/share/share-session.ts';
import type { ShareMeta } from '../src/share/provider.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(here, '..', rel), 'utf8');

const TOK = '0123456789abcdef0123456789abcdef';
const MIN = 60_000;
const NOW = 100 * MIN;
const t = (key: string, p?: Record<string, unknown>) => (p ? `${key}|${Object.entries(p).map(([k, v]) => `${k}=${v}`).join(',')}` : key);

function meta(over: Partial<ShareMeta> = {}): ShareMeta {
  return { token: TOK, name: 'a.hwpx', access: 'edit', expiresAt: null, revoked: false, version: 1, byteSize: 3, lock: null, ...over };
}
function openState(over: Partial<Extract<SessionState, { kind: 'open' }>> = {}): SessionState {
  return { kind: 'open', token: TOK, meta: meta(), role: 'editor', lockHeld: true, baseVersion: 1, dirty: false, by: '나#a', adminKey: null, ...over };
}

test('띠 없음 — 대기·여는 중·내가 편집 중', () => {
  assert.equal(bannerModel({ kind: 'idle' }, NOW, t), null);
  assert.equal(bannerModel({ kind: 'opening', token: TOK }, NOW, t), null);
  assert.equal(bannerModel(openState(), NOW, t), null);
});

test('보기 권한 — 보기 전용 안내 + 내려받기', () => {
  const m = bannerModel(openState({ role: 'viewer', lockHeld: false, meta: meta({ access: 'view' }) }), NOW, t)!;
  assert.equal(m.text, 'share.banner.viewOnly');
  assert.deepEqual(m.actions.map((a) => a.kind), ['download']);
  assert.equal(m.fullscreen, false);
});

test('남이 편집 중 — 이름(탭ID 제외)과 몇 분 전부터인지', () => {
  const lock = { by: '김팀장#bbbbbb', since: NOW - 12 * MIN, heartbeatAt: NOW - MIN };
  const m = bannerModel(openState({ role: 'viewer', lockHeld: false, meta: meta({ lock }), lockedBy: lock.by, lockedSince: lock.since }), NOW, t)!;
  assert.equal(m.text, 'share.banner.lockedBy|p1=김팀장,p2=12');
  assert.deepEqual(m.actions, []);
});

test('남의 잠금이 30분 넘게 조용함 — 이어서 편집', () => {
  const lock = { by: '김팀장#bbbbbb', since: NOW - 90 * MIN, heartbeatAt: NOW - 31 * MIN };
  const m = bannerModel(openState({ role: 'viewer', lockHeld: false, meta: meta({ lock }), lockedBy: lock.by, lockedSince: lock.since }), NOW, t)!;
  assert.equal(m.text, 'share.banner.lockStale|p1=김팀장');
  assert.deepEqual(m.actions.map((a) => a.kind), ['takeover']);
});

test('편집 권한인데 잠금 확인 중(주인 미상)', () => {
  const m = bannerModel(openState({ role: 'viewer', lockHeld: false }), NOW, t)!;
  assert.equal(m.text, 'share.banner.checking');
});

test('수정 중에 남이 새 버전 저장 / 저장 충돌 — 내려받기 + 최신본 열기', () => {
  const p = bannerModel(openState({ dirty: true, pendingVersion: 3 }), NOW, t)!;
  assert.equal(p.text, 'share.banner.newVersion|p1=3');
  assert.deepEqual(p.actions.map((a) => a.kind), ['download', 'reload']);
  const c = bannerModel({ kind: 'conflict', token: TOK, meta: meta(), serverVersion: 5, adminKey: null }, NOW, t)!;
  assert.equal(c.text, 'share.banner.newVersion|p1=5');
  assert.deepEqual(c.actions.map((a) => a.kind), ['download', 'reload']);
});

test('끝난 공유 — 전체 화면 안내', () => {
  const g = bannerModel({ kind: 'gone', token: TOK }, NOW, t)!;
  assert.equal(g.text, 'share.banner.gone');
  assert.equal(g.fullscreen, true);
});

test('띠 문구·버튼 키가 ko/en 에 모두 있다', () => {
  for (const loc of ['ko', 'en']) {
    const src = read(`src/i18n/locales/${loc}.ts`);
    for (const key of BANNER_KEYS) assert.ok(src.includes(`"${key}"`), `${loc}: ${key}`);
  }
});
