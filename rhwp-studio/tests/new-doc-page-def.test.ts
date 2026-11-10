import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DEFAULT_NEW_DOC_PAGE_DEF, normalizeNewDocPageDef } from '../src/core/new-doc-page-def.ts';
import { userSettings } from '../src/core/user-settings.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(here, '..', rel), 'utf8');
const mm = (hu: number) => Math.round(hu * 25.4 / 7200 * 10) / 10;

test('새 문서 기본 용지: A4 세로·한쪽, 위 15·머리말 10·왼쪽 20·오른쪽 20·제본 0·꼬리말 10·아래 15 mm', () => {
  const d = DEFAULT_NEW_DOC_PAGE_DEF;
  assert.deepEqual([d.width, d.height], [59528, 84188]);
  assert.equal(d.landscape, false);
  assert.equal(d.binding, 0);
  assert.deepEqual(
    [d.marginTop, d.marginHeader, d.marginLeft, d.marginRight, d.marginGutter, d.marginFooter, d.marginBottom].map(mm),
    [15, 10, 20, 20, 0, 10, 15],
  );
});

test('normalizeNewDocPageDef — 깨진 값은 기본값, 일부만 있으면 나머지는 기본값으로 채운다', () => {
  assert.deepEqual(normalizeNewDocPageDef(null), DEFAULT_NEW_DOC_PAGE_DEF);
  assert.deepEqual(normalizeNewDocPageDef('x'), DEFAULT_NEW_DOC_PAGE_DEF);
  const partial = normalizeNewDocPageDef({ marginTop: 5669, marginLeft: -1, width: 'a', landscape: true, binding: 9 });
  assert.equal(partial.marginTop, 5669);
  assert.equal(partial.marginLeft, DEFAULT_NEW_DOC_PAGE_DEF.marginLeft);
  assert.equal(partial.width, DEFAULT_NEW_DOC_PAGE_DEF.width);
  assert.equal(partial.landscape, true);
  assert.equal(partial.binding, DEFAULT_NEW_DOC_PAGE_DEF.binding);
  // 돌려준 객체를 고쳐도 기본값 상수는 그대로
  partial.marginTop = 1;
  assert.notEqual(DEFAULT_NEW_DOC_PAGE_DEF.marginTop, 1);
});

test('사용자 설정 — 새 문서 용지는 기본값으로 시작하고 저장·다시 읽기가 된다', () => {
  const store = new Map<string, string>();
  const original = (globalThis as { localStorage?: Storage }).localStorage;
  (globalThis as { localStorage?: Storage }).localStorage = {
    get length() { return store.size; }, clear() { store.clear(); },
    getItem: (k: string) => store.get(k) ?? null, key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => { store.delete(k); }, setItem: (k: string, v: string) => { store.set(k, v); },
  } as Storage;
  try {
    userSettings.reload();
    assert.deepEqual(userSettings.getNewDocPageDef(), DEFAULT_NEW_DOC_PAGE_DEF);
    userSettings.setNewDocPageDef({ ...DEFAULT_NEW_DOC_PAGE_DEF, marginLeft: 8504 });
    assert.equal(JSON.parse(store.get('rhwp-settings')!).newDocument.pageDef.marginLeft, 8504);
    userSettings.reload();
    assert.equal(userSettings.getNewDocPageDef().marginLeft, 8504);
  } finally {
    (globalThis as { localStorage?: Storage }).localStorage = original;
    userSettings.reload();
  }
});

test('새 문서를 만들 때 설정의 용지를 적용하고, F7 에 「현재 설정 값을 새 문서에 적용」이 있다', () => {
  const main = read('src/main.ts');
  assert.match(main, /wasm\.createNewDocument\(userSettings\.getNewDocPageDef\(\)\)/);
  const bridge = read('src/core/wasm-bridge.ts');
  const body = bridge.slice(bridge.indexOf('createNewDocument(pageDef'), bridge.indexOf('createNewDocument(pageDef') + 900);
  assert.ok(body.indexOf('setPageDef') > 0 && body.indexOf('setPageDef') < body.indexOf('_documentDigest'), '다이제스트 계산 전에 용지 적용');
  const dlg = read('src/ui/page-setup-dialog.ts');
  assert.match(dlg, /dialog\.pageSetup\.applyToNewDoc\.label/);
  assert.match(dlg, /userSettings\.setNewDocPageDef\(newDef\)/);
  for (const loc of ['ko', 'en']) assert.match(read(`src/i18n/locales/${loc}.ts`), /"dialog\.pageSetup\.applyToNewDoc\.label"/);
});
