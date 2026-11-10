import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isShareProvider } from '../src/share/provider-loader.ts';
import { isShareConflictError, isShareGoneError } from '../src/share/provider.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(here, '..', rel), 'utf8');

function installFakeBrowser() {
  const store = new Map<string, string>();
  const g = globalThis as Record<string, unknown>;
  const saved = { localStorage: g.localStorage, window: g.window };
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  g.window = { addEventListener() {}, removeEventListener() {} };
  return () => { g.localStorage = saved.localStorage; g.window = saved.window; };
}

const load = async () => (await import('../public/share-provider.dev.js')).default;

test('개발 제공자는 계약(12 메서드)을 만족한다', async () => {
  assert.equal(isShareProvider(await load()), true);
});

test('만들기 → 열기 왕복, 잠금·저장으로 버전이 오르고, 옛 버전 기준 저장은 충돌', async () => {
  const restore = installFakeBrowser();
  try {
    const p = await load();
    const { token, adminKey } = await p.create(new Uint8Array([1, 2, 3]), 'a.hwpx', { access: 'edit', expiresAt: null });
    assert.match(token, /^[0-9a-f]{32}$/);
    assert.match(adminKey, /^[0-9a-f]{32}$/);
    const opened = await p.open(token);
    assert.deepEqual(Array.from(opened.bytes), [1, 2, 3]);
    assert.equal(opened.meta.version, 1);
    assert.equal('adminKey' in opened.meta, false, '관리키는 메타로 새지 않는다');

    assert.equal(await p.lock(token, 'A#1'), true);
    assert.equal(await p.lock(token, 'B#2'), false);
    assert.deepEqual(await p.save(token, new Uint8Array([9]), 1, 'A#1'), { version: 2 });
    await assert.rejects(p.save(token, new Uint8Array([8]), 1, 'A#1'), (e: unknown) => isShareConflictError(e));
    await assert.rejects(p.save(token, new Uint8Array([8]), 2, 'B#2'), (e: unknown) => isShareConflictError(e));

    const versions = await p.listVersions(token);
    assert.deepEqual(versions.map((v: { version: number }) => v.version), [2, 1]);
    assert.deepEqual(Array.from(await p.openVersion(token, 1)), [1, 2, 3]);

    await assert.rejects(p.revoke(token, 'wrong'));
    await p.revoke(token, adminKey);
    assert.equal((await p.open(token)).meta.revoked, true);
    await assert.rejects(p.open('f'.repeat(32)), (e: unknown) => isShareGoneError(e));
  } finally {
    restore();
  }
});

test('개발 제공자·공유 제공자 파일은 PWA 사전 캐시에서 뺀다', () => {
  assert.match(read('vite.config.ts'), /globIgnores:\s*\[[^\]]*'share-provider\.dev\.js'[^\]]*'share-provider\.js'/);
});

test('제공자 계약 문서가 있고 조직 이름이 없다', () => {
  const doc = read('docs/share-provider.md');
  for (const m of ['create', 'open', 'save', 'watch', 'lock', 'heartbeat', 'unlock', 'updateSettings', 'revoke', 'listVersions', 'openVersion', 'canCreate']) {
    assert.ok(doc.includes(`\`${m}`), m);
  }
  assert.match(doc, /ShareConflictError/);
  assert.match(doc, /RHWP_SHARE_PROVIDER/);
  assert.doesNotMatch(doc, /kossa|협회|firebase/i);
});

test('운영 빌드 결과물에서는 개발 제공자 파일을 지운다', () => {
  const src = read('vite.config.ts');
  assert.match(src, /name: 'drop-dev-share-provider'/);
  assert.match(src, /apply: 'build'/);
  assert.match(src, /share-provider\.dev\.js/);
});
