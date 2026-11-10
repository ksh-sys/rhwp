/**
 * 개발·시험용 공유 제공자 — 같은 브라우저의 탭끼리 localStorage 로 공유한다.
 *
 * 실제 저장소 없이 링크 공유 흐름(만들기·열기·잠금·저장·충돌·회수)을 확인하는 용도다.
 * 개발 서버에서 `?shareProvider=./share-provider.dev.js` 로만 불러온다(운영 빌드는 쓰지 않음).
 * 계약: rhwp-studio/docs/share-provider.md
 */
const PREFIX = 'rhwp-dev-share:';
const LOCK_TTL_MS = 30 * 60_000;

const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');

function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function namedError(name, message, extra = {}) {
  return Object.assign(new Error(message), { name }, extra);
}

const metaKey = (token) => `${PREFIX}${token}`;
const bytesKey = (token, v) => `${PREFIX}${token}:v${v}`;

function readRecord(token) {
  const raw = localStorage.getItem(metaKey(token));
  if (!raw) throw namedError('ShareGoneError', 'no such share');
  return JSON.parse(raw);
}

const localWatchers = new Map();

function writeRecord(token, rec) {
  localStorage.setItem(metaKey(token), JSON.stringify(rec));
  // storage 이벤트는 다른 탭에만 가므로 같은 탭 구독자에게는 직접 알린다
  for (const cb of localWatchers.get(token) ?? []) cb(publicMeta(rec));
}

function publicMeta(rec) {
  const { adminKey, versions, ...meta } = rec;
  return meta;
}

function assertLive(rec) {
  if (rec.revoked || (rec.expiresAt != null && rec.expiresAt <= Date.now())) throw namedError('ShareGoneError', 'share ended');
}

const lockFree = (rec, by) => !rec.lock || rec.lock.by === by || Date.now() - rec.lock.heartbeatAt > LOCK_TTL_MS;

const provider = {
  async canCreate() {
    return { ok: true, by: '개발자' };
  },

  async create(bytes, name, settings) {
    const token = hex(16);
    const adminKey = hex(16);
    const now = Date.now();
    localStorage.setItem(bytesKey(token, 1), toB64(bytes));
    writeRecord(token, {
      token, name, access: settings.access, expiresAt: settings.expiresAt, revoked: false,
      version: 1, byteSize: bytes.length, lock: null, createdBy: { name: '개발자' },
      adminKey, versions: [{ version: 1, createdAt: now, by: '개발자', byteSize: bytes.length }],
    });
    return { token, adminKey };
  },

  async open(token) {
    const rec = readRecord(token);
    const b64 = localStorage.getItem(bytesKey(token, rec.version));
    return { meta: publicMeta(rec), bytes: b64 ? fromB64(b64) : new Uint8Array() };
  },

  async save(token, bytes, baseVersion, by) {
    const rec = readRecord(token);
    assertLive(rec);
    if (rec.access !== 'edit') throw new Error('view-only share');
    if (baseVersion !== rec.version) throw namedError('ShareConflictError', 'conflict', { serverVersion: rec.version });
    if (!rec.lock || rec.lock.by !== by) throw namedError('ShareConflictError', 'not the lock holder', { serverVersion: rec.version });
    const version = rec.version + 1;
    localStorage.setItem(bytesKey(token, version), toB64(bytes));
    rec.version = version;
    rec.byteSize = bytes.length;
    rec.versions.push({ version, createdAt: Date.now(), by, byteSize: bytes.length });
    rec.lock.heartbeatAt = Date.now();
    writeRecord(token, rec);
    return { version };
  },

  watch(token, cb) {
    const onStorage = (e) => {
      if (e.key === metaKey(token) && e.newValue) cb(publicMeta(JSON.parse(e.newValue)));
    };
    window.addEventListener('storage', onStorage);
    const set = localWatchers.get(token) ?? new Set();
    set.add(cb);
    localWatchers.set(token, set);
    return () => {
      window.removeEventListener('storage', onStorage);
      set.delete(cb);
    };
  },

  async lock(token, by) {
    const rec = readRecord(token);
    assertLive(rec);
    if (rec.access !== 'edit' || !lockFree(rec, by)) return false;
    const now = Date.now();
    rec.lock = { by, since: rec.lock?.by === by ? rec.lock.since : now, heartbeatAt: now };
    writeRecord(token, rec);
    return true;
  },

  async heartbeat(token, by) {
    const rec = readRecord(token);
    if (!rec.lock || rec.lock.by !== by) return false;
    rec.lock.heartbeatAt = Date.now();
    writeRecord(token, rec);
    return true;
  },

  async unlock(token, by) {
    const rec = readRecord(token);
    if (rec.lock?.by !== by) return;
    rec.lock = null;
    writeRecord(token, rec);
  },

  async updateSettings(token, adminKey, settings) {
    const rec = readRecord(token);
    if (rec.adminKey !== adminKey) throw new Error('bad admin key');
    if (settings.access) rec.access = settings.access;
    if ('expiresAt' in settings) rec.expiresAt = settings.expiresAt ?? null;
    if (rec.access === 'view') rec.lock = null;
    writeRecord(token, rec);
  },

  async revoke(token, adminKey) {
    const rec = readRecord(token);
    if (rec.adminKey !== adminKey) throw new Error('bad admin key');
    rec.revoked = true;
    rec.lock = null;
    writeRecord(token, rec);
  },

  async listVersions(token) {
    return [...readRecord(token).versions].reverse();
  },

  async openVersion(token, version) {
    const b64 = localStorage.getItem(bytesKey(token, version));
    if (!b64) throw new Error(`no version ${version}`);
    return fromB64(b64);
  },
};

export default provider;
