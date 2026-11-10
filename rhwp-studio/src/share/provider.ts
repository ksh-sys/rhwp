/**
 * 공유 제공자(provider) 계약 — 스튜디오는 저장소를 모른다.
 *
 * 빌드 환경변수 `RHWP_SHARE_PROVIDER` 로 가리킨 ES 모듈이 이 인터페이스를 구현한다
 * (`default` 객체 또는 `createShareProvider()`). 모듈이 없으면 공유 기능은 숨겨진다.
 * 이 파일은 순수 타입·오류 클래스만 담는다(상대 import 전용 — node:test 에서 직접 실행).
 */

export type ShareAccess = 'view' | 'edit';

export interface ShareSettings {
  access: ShareAccess;
  /** epoch ms, null 이면 만료 없음 */
  expiresAt: number | null;
}

export interface ShareLock {
  by: string;
  since: number;
  heartbeatAt: number;
}

export interface ShareMeta {
  token: string;
  name: string;
  access: ShareAccess;
  expiresAt: number | null;
  revoked: boolean;
  version: number;
  byteSize: number;
  lock: ShareLock | null;
  createdBy?: { name: string };
}

export interface ShareOpenResult {
  meta: ShareMeta;
  bytes: Uint8Array;
}

export interface ShareVersion {
  version: number;
  createdAt: number;
  by: string;
  byteSize: number;
}

/** 저장 시 baseVersion 이 서버 최신이 아님 */
export class ShareConflictError extends Error {
  readonly serverVersion: number;
  constructor(serverVersion: number) {
    super(`share conflict: server is at v${serverVersion}`);
    this.name = 'ShareConflictError';
    this.serverVersion = serverVersion;
  }
}

/** 만료·회수·없음 */
export class ShareGoneError extends Error {
  constructor(message = 'share gone') {
    super(message);
    this.name = 'ShareGoneError';
  }
}

/** 만들기에 로그인이 필요함 */
export class ShareAuthRequiredError extends Error {
  readonly loginUrl?: string;
  constructor(loginUrl?: string) {
    super('share auth required');
    this.name = 'ShareAuthRequiredError';
    this.loginUrl = loginUrl;
  }
}

export interface ShareProvider {
  create(bytes: Uint8Array, name: string, settings: ShareSettings): Promise<{ token: string; adminKey: string }>;
  open(token: string): Promise<ShareOpenResult>;
  save(token: string, bytes: Uint8Array, baseVersion: number, by: string): Promise<{ version: number }>;
  watch(token: string, cb: (meta: ShareMeta) => void): () => void;
  lock(token: string, by: string): Promise<boolean>;
  heartbeat(token: string, by: string): Promise<boolean>;
  unlock(token: string, by: string): Promise<void>;
  updateSettings(token: string, adminKey: string, settings: Partial<ShareSettings>): Promise<void>;
  revoke(token: string, adminKey: string): Promise<void>;
  listVersions(token: string): Promise<ShareVersion[]>;
  openVersion(token: string, version: number): Promise<Uint8Array>;
  /** 만들기 가능 여부(직원 세션 유무). 없으면 만들기 메뉴는 안내로 바뀐다 */
  canCreate(): Promise<{ ok: true; by: string } | { ok: false; loginUrl?: string }>;
}
