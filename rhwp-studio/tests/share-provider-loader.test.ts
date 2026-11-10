import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { providerUrlFromDocument, loadShareProvider, isShareProvider, SHARE_PROVIDER_METHODS } from '../src/share/provider-loader.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(here, '..', rel), 'utf8');

function fakeDoc(content: string | null) {
  return {
    querySelector: (sel: string) =>
      sel === 'meta[name="rhwp-share-provider"]' && content != null
        ? { getAttribute: (n: string) => (n === 'content' ? content : null) }
        : null,
  };
}

function fullProvider(): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  for (const m of SHARE_PROVIDER_METHODS) p[m] = async () => undefined;
  return p;
}

test('메타가 없으면 제공자 URL 은 null', () => {
  assert.equal(providerUrlFromDocument(fakeDoc(null), 'https://h/hwpx/'), null);
});

test('상대 경로 메타는 baseURI 기준으로 절대 URL 이 된다', () => {
  assert.equal(providerUrlFromDocument(fakeDoc('./share-provider.js'), 'https://h/hwpx/'), 'https://h/hwpx/share-provider.js');
  assert.equal(providerUrlFromDocument(fakeDoc('https://x/p.js'), 'https://h/hwpx/'), 'https://x/p.js');
  assert.equal(providerUrlFromDocument(fakeDoc('   '), 'https://h/hwpx/'), null);
});

test('필수 메서드 12개가 있어야 제공자로 인정한다', () => {
  assert.equal(SHARE_PROVIDER_METHODS.length, 12);
  assert.equal(isShareProvider(fullProvider()), true);
  const partial = fullProvider();
  delete partial.heartbeat;
  assert.equal(isShareProvider(partial), false);
  assert.equal(isShareProvider(null), false);
  assert.equal(isShareProvider('x'), false);
});

test('loadShareProvider — default 객체·createShareProvider() 모두 받는다', async () => {
  const p = fullProvider();
  assert.equal(await loadShareProvider('u', async () => ({ default: p })), p);
  assert.equal(await loadShareProvider('u', async () => ({ createShareProvider: () => p })), p);
  assert.equal(await loadShareProvider('u', async () => ({ createShareProvider: async () => p })), p);
});

test('loadShareProvider — 계약 미달·import 실패는 null 이고 던지지 않는다', async () => {
  const partial = fullProvider();
  delete partial.revoke;
  assert.equal(await loadShareProvider('u', async () => ({ default: partial })), null);
  assert.equal(await loadShareProvider('u', async () => { throw new Error('404'); }), null);
  assert.equal(await loadShareProvider('u', async () => ({})), null);
});

test('vite 설정이 RHWP_SHARE_PROVIDER 를 메타 태그로 심는다', () => {
  const src = read('vite.config.ts');
  assert.match(src, /RHWP_SHARE_PROVIDER/);
  assert.match(src, /rhwp-share-provider/);
  assert.match(src, /share-provider-meta/);
});
