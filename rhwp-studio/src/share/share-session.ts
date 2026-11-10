/**
 * 공유 세션 상태 기계 — 순수(제공자·시계·타이머 주입, DOM 없음).
 *
 * 한 문서에 편집자는 한 명(잠금). 편집자는 60초마다 심장박동을 보내고, 30분 동안 입력이 없으면
 * 보내지 않는다. 박동이 5분 끊긴 잠금은 비어 있는 것으로 본다 — 자리 비움은 약 35분, 창을 닫으면
 * 5분 뒤 다른 사람이 이어받는다. 저장은 baseVersion 이 서버 최신일 때만 받아들여지고(제공자 책임),
 * 아니면 충돌로 끝난다 — 자리 비운 사이 남이 저장한 문서를 덮어쓰지 않는다.
 *
 * 비동기 경로는 직렬화한다: 저장은 한 번에 하나(겹친 Ctrl+S 는 앞 저장 뒤 새 기준으로), 새 버전
 * 다시 열기도 한 번에 하나이며 열기가 끝난 뒤에만 기준 버전을 올린다.
 */
import { isShareConflictError, isShareGoneError } from './provider.ts';
import type { ShareLock, ShareMeta, ShareProvider } from './provider.ts';

export const HEARTBEAT_MS = 60_000;
/** 박동이 이만큼 끊기면 잠금은 비어 있다 */
export const LOCK_TTL_MS = 5 * 60_000;
/** 입력이 이만큼 없으면 박동을 멈춘다(잠금이 저절로 풀리게) */
export const IDLE_MS = 30 * 60_000;

export type SaveResult = 'saved' | 'conflict' | 'failed' | 'lost-lock';

export type ShareRole = 'editor' | 'viewer';

export type SessionState =
  | { kind: 'idle' }
  | { kind: 'opening'; token: string }
  | {
      kind: 'open';
      token: string;
      meta: ShareMeta;
      role: ShareRole;
      lockHeld: boolean;
      baseVersion: number;
      dirty: boolean;
      by: string;
      adminKey: string | null;
      /** 남이 잡고 있는 잠금의 주인(내 잠금이면 없음) */
      lockedBy?: string;
      lockedSince?: number;
      /** 수정 중에 남이 저장한 새 버전 번호 — 띠로 알리고 자동으로 덮어쓰지 않는다 */
      pendingVersion?: number;
    }
  | { kind: 'conflict'; token: string; meta: ShareMeta; serverVersion: number; adminKey: string | null }
  | { kind: 'gone'; token: string };

type OpenState = Extract<SessionState, { kind: 'open' }>;

export interface SessionDeps {
  provider: ShareProvider;
  now(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  /** 잠금 주인 식별자(이름#탭ID) */
  by: string;
  onState(state: SessionState): void;
  /** 내 수정이 없을 때 남이 저장한 새 버전 — 호출부가 다시 연다(실패하면 throw, 기준 버전 유지) */
  onNewVersion(bytes: Uint8Array, meta: ShareMeta): void | Promise<void>;
}

/** 잠금이 없거나 마지막 심장박동이 ttl 보다 오래됐으면 true(= 비어 있음) */
export function lockExpired(lock: ShareLock | null, now: number, ttlMs = LOCK_TTL_MS): boolean {
  return !lock || now - lock.heartbeatAt > ttlMs;
}

export function roleFor(meta: ShareMeta, by: string, now: number): ShareRole {
  if (meta.access !== 'edit') return 'viewer';
  return !meta.lock || meta.lock.by === by || lockExpired(meta.lock, now) ? 'editor' : 'viewer';
}

function isEnded(meta: ShareMeta, now: number): boolean {
  return meta.revoked || (meta.expiresAt != null && meta.expiresAt <= now);
}

export class ShareSession {
  private readonly deps: SessionDeps;
  private current: SessionState = { kind: 'idle' };
  private unwatch: (() => void) | null = null;
  private timer: unknown = null;
  private lastActivity = 0;
  private heartbeatPaused = false;
  private acquiring = false;
  private saveChain: Promise<unknown> = Promise.resolve();
  private reloadChain: Promise<unknown> = Promise.resolve();

  constructor(deps: SessionDeps) {
    this.deps = deps;
  }

  get state(): SessionState {
    return this.current;
  }

  /** 공유를 연다. 끝난 공유면 null(상태 gone), 아니면 문서 바이트. */
  async open(token: string, adminKey: string | null): Promise<Uint8Array | null> {
    if (this.current.kind !== 'idle') await this.close();
    this.set({ kind: 'opening', token });
    let res;
    try {
      res = await this.deps.provider.open(token);
    } catch (e) {
      if (isShareGoneError(e)) {
        this.toGone(token);
        return null;
      }
      this.set({ kind: 'idle' });
      throw e;
    }
    const now = this.deps.now();
    if (isEnded(res.meta, now)) {
      this.toGone(token);
      return null;
    }
    this.lastActivity = now;
    this.set({
      kind: 'open',
      token,
      meta: res.meta,
      role: 'viewer',
      lockHeld: false,
      baseVersion: res.meta.version,
      dirty: false,
      by: this.deps.by,
      adminKey,
      ...this.lockInfo(res.meta),
    });
    this.unwatch = this.deps.provider.watch(token, (m) => { void this.onMeta(m); });
    if (roleFor(res.meta, this.deps.by, now) === 'editor') await this.acquire();
    return res.bytes;
  }

  /** 사용자 입력이 있었다 — 자리 비움으로 멈춘 심장박동이면 바로 잠금을 다시 확인한다 */
  noteActivity(): void {
    this.lastActivity = this.deps.now();
    if (this.heartbeatPaused) {
      this.heartbeatPaused = false;
      void this.beat(true);
    }
  }

  setDirty(dirty: boolean): void {
    const s = this.openState();
    if (s && s.dirty !== dirty) this.set({ ...s, dirty });
  }

  /** 저장 — 한 번에 하나씩. 겹쳐 부르면 앞 저장이 끝난 뒤 그때의 기준 버전으로 보낸다. */
  save(bytes: Uint8Array): Promise<SaveResult> {
    const run = this.saveChain.then(() => this.saveNow(bytes));
    this.saveChain = run.catch(() => undefined);
    return run;
  }

  private async saveNow(bytes: Uint8Array): Promise<SaveResult> {
    const s = this.openState();
    if (!s || s.role !== 'editor' || !s.lockHeld) return 'failed';
    // 저장 직전에 잠금을 서버에 확인한다 — 자는 동안 남이 이어받았는데 알림이 아직 안 왔을 수 있다
    let stillMine = true;
    try {
      stillMine = await this.deps.provider.heartbeat(s.token, this.deps.by);
    } catch {
      stillMine = true; // 네트워크 오류면 저장 자체가 판가름한다
    }
    if (!stillMine) {
      this.loseLock();
      return 'lost-lock';
    }
    try {
      const { version } = await this.deps.provider.save(s.token, bytes, s.baseVersion, this.deps.by);
      const cur = this.openState();
      if (cur && cur.token === s.token) {
        this.set({ ...cur, baseVersion: version, dirty: false, pendingVersion: undefined, meta: { ...cur.meta, version } });
      }
      this.lastActivity = this.deps.now();
      return 'saved';
    } catch (e) {
      if (isShareConflictError(e)) {
        this.stopHeartbeat();
        void this.deps.provider.unlock(s.token, this.deps.by).catch(() => {});
        this.set({ kind: 'conflict', token: s.token, meta: s.meta, serverVersion: e.serverVersion, adminKey: s.adminKey });
        return 'conflict';
      }
      if (isShareGoneError(e)) this.toGone(s.token);
      return 'failed';
    }
  }

  /** 최신본을 다시 받아 열린 상태로 돌아온다(충돌·새 버전 대기 해소). 호출부가 바이트를 연다. */
  async reloadLatest(): Promise<Uint8Array | null> {
    const s = this.current;
    if (s.kind !== 'open' && s.kind !== 'conflict') return null;
    let res;
    try {
      res = await this.deps.provider.open(s.token);
    } catch (e) {
      if (isShareGoneError(e)) {
        this.toGone(s.token);
        return null;
      }
      throw e;
    }
    if (isEnded(res.meta, this.deps.now())) {
      this.toGone(s.token);
      return null;
    }
    const held = s.kind === 'open' && s.lockHeld;
    this.set({
      kind: 'open',
      token: s.token,
      meta: res.meta,
      role: held ? 'editor' : 'viewer',
      lockHeld: held,
      baseVersion: res.meta.version,
      dirty: false,
      by: this.deps.by,
      adminKey: s.adminKey,
      ...this.lockInfo(res.meta),
    });
    if (!held && roleFor(res.meta, this.deps.by, this.deps.now()) === 'editor') await this.acquire();
    return res.bytes;
  }

  /** 남의 잠금이 만료됐을 때 「이어서 편집」 */
  async takeOver(): Promise<boolean> {
    const s = this.openState();
    if (!s || s.lockHeld || s.meta.access !== 'edit') return false;
    if (!lockExpired(s.meta.lock, this.deps.now())) return false;
    return this.acquire();
  }

  async close(): Promise<void> {
    const s = this.current;
    this.stopHeartbeat();
    this.unwatch?.();
    this.unwatch = null;
    if (s.kind === 'open' && s.lockHeld) {
      try {
        await this.deps.provider.unlock(s.token, this.deps.by);
      } catch {
        /* 베스트 에포트 — 남은 잠금은 30분 뒤 만료된다 */
      }
    }
    this.set({ kind: 'idle' });
  }

  // ─── 내부 ─────────────────────────────

  private set(next: SessionState): void {
    this.current = next;
    this.deps.onState(next);
  }

  private openState(): OpenState | null {
    return this.current.kind === 'open' ? this.current : null;
  }

  private lockInfo(meta: ShareMeta): { lockedBy?: string; lockedSince?: number } {
    if (meta.lock && meta.lock.by !== this.deps.by) return { lockedBy: meta.lock.by, lockedSince: meta.lock.since };
    return { lockedBy: undefined, lockedSince: undefined };
  }

  private toGone(token: string): void {
    this.stopHeartbeat();
    this.unwatch?.();
    this.unwatch = null;
    this.set({ kind: 'gone', token });
  }

  private async acquire(): Promise<boolean> {
    const s = this.openState();
    if (!s || this.acquiring) return false;
    this.acquiring = true;
    let ok = false;
    try {
      ok = await this.deps.provider.lock(s.token, this.deps.by);
    } catch {
      ok = false;
    } finally {
      this.acquiring = false;
    }
    const cur = this.openState();
    if (!cur || cur.token !== s.token) return false;
    if (ok) {
      this.lastActivity = this.deps.now();
      this.heartbeatPaused = false;
      this.set({ ...cur, role: 'editor', lockHeld: true, lockedBy: undefined, lockedSince: undefined });
      this.startHeartbeat();
    } else {
      this.set({ ...cur, role: 'viewer', lockHeld: false });
    }
    return ok;
  }

  private startHeartbeat(): void {
    if (this.timer != null) return;
    this.timer = this.deps.setInterval(() => { void this.beat(false); }, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.timer != null) this.deps.clearInterval(this.timer);
    this.timer = null;
    this.heartbeatPaused = false;
  }

  private async beat(force: boolean): Promise<void> {
    const s = this.openState();
    if (!s || !s.lockHeld) return;
    if (!force && this.deps.now() - this.lastActivity > IDLE_MS) {
      this.heartbeatPaused = true;
      return;
    }
    let ok: boolean;
    try {
      ok = await this.deps.provider.heartbeat(s.token, this.deps.by);
    } catch {
      return; // 일시적 네트워크 오류 — 다음 틱에 다시
    }
    if (!ok) this.loseLock();
  }

  private loseLock(): void {
    this.stopHeartbeat();
    const cur = this.openState();
    if (cur) this.set({ ...cur, role: 'viewer', lockHeld: false, ...this.lockInfo(cur.meta) });
  }

  private async onMeta(m: ShareMeta): Promise<void> {
    const s = this.current;
    if (s.kind === 'conflict') {
      if (isEnded(m, this.deps.now())) this.toGone(s.token);
      else this.set({ ...s, meta: m });
      return;
    }
    if (s.kind !== 'open') return;
    const now = this.deps.now();
    if (isEnded(m, now)) {
      this.toGone(s.token);
      return;
    }
    let next: OpenState = { ...s, meta: m, ...this.lockInfo(m) };
    let verifyLock = false;
    if (s.lockHeld) {
      if (m.access !== 'edit') {
        this.stopHeartbeat();
        void this.deps.provider.unlock(s.token, this.deps.by).catch(() => {});
        next = { ...next, role: 'viewer', lockHeld: false };
      } else if (m.lock && m.lock.by !== this.deps.by) {
        // 알림은 늦게·순서가 바뀌어 올 수 있다 — 바로 놓지 않고 심장박동으로 서버에 확인한다.
        // 서버가 거부하면 beat 가 잠금을 놓는다(loseLock).
        verifyLock = true;
      }
    }
    const newer = m.version > next.baseVersion;
    if (newer && next.dirty) next = { ...next, pendingVersion: m.version };
    this.set(next);
    if (verifyLock) await this.beat(true);

    if (newer && !next.dirty) await this.queueFetchLatest(next.token);

    const after = this.openState();
    if (after && !after.lockHeld && after.meta.access === 'edit'
      && (!after.meta.lock || after.meta.lock.by === this.deps.by)) {
      await this.acquire();
    }
  }

  /** 새 버전 다시 열기 — 한 번에 하나씩(앞 열기가 끝난 뒤 다음) */
  private queueFetchLatest(token: string): Promise<void> {
    const run = this.reloadChain.then(() => this.fetchLatest(token));
    this.reloadChain = run.catch(() => undefined);
    return run;
  }

  private async fetchLatest(token: string): Promise<void> {
    const before = this.openState();
    if (!before || before.token !== token || before.dirty) return;
    let res;
    try {
      res = await this.deps.provider.open(token);
    } catch (e) {
      if (isShareGoneError(e)) this.toGone(token);
      return;
    }
    const cur = this.openState();
    if (!cur || cur.token !== token || cur.dirty) return;
    if (res.meta.version <= cur.baseVersion) return; // 이미 그 버전(또는 더 새것)을 보고 있다
    try {
      await this.deps.onNewVersion(res.bytes, res.meta);
    } catch (e) {
      console.warn('[share] 새 버전을 열지 못했습니다 — 기준 버전을 유지합니다:', e);
      return;
    }
    // 화면이 실제로 그 버전이 된 뒤에만 기준 버전을 올린다
    const after = this.openState();
    if (!after || after.token !== token) return;
    this.set({ ...after, meta: res.meta, baseVersion: res.meta.version, pendingVersion: undefined, dirty: false, ...this.lockInfo(res.meta) });
  }
}
