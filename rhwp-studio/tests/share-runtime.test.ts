import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(here, '..', rel), 'utf8');

test('시작 순서 — ?url= 다음에 ?share= 를 열고, 그 뒤에 복구·빈 문서', () => {
  const main = read('src/main.ts');
  const start = main.indexOf('    setupGlobalShortcuts();');
  const startup = main.slice(start, main.indexOf('\n    // E2E 테스트용 전역 노출', start));
  const url = startup.indexOf('await loadFromUrlParam();');
  const share = startup.indexOf('await loadFromShareParam();');
  const recovery = startup.indexOf('await offerAutosaveRecoveryIfIdle();');
  assert.ok(url >= 0 && share > url && recovery > share);
  assert.match(startup, /await loadFromUrlParam\(\);\n\s+await loadFromShareParam\(\);/);
});

test('?share= 로 열면 자동저장 복구를 건너뛰고, 끝난 공유면 빈 문서를 만들지 않는다', () => {
  const main = read('src/main.ts');
  const skip = main.slice(main.indexOf('function shouldSkipInitialAutosaveRecovery'), main.indexOf('async function offerAutosaveRecoveryIfIdle'));
  assert.match(skip, /params\.has\('share'\)/);
  const blank = main.slice(main.indexOf('async function openBlankDocumentIfIdle'), main.indexOf('\nasync function canReplaceCurrentDocument'));
  assert.match(blank, /shareRuntime\?\.goneShown/);
});

test('rhwpStudio.share 는 공개 API 객체 정의 뒤에 덧붙인다(첫 키 notifySaved 유지)', () => {
  const main = read('src/main.ts');
  const def = main.indexOf('(window as any).rhwpStudio = {');
  const share = main.indexOf('(window as any).rhwpStudio.share =');
  assert.ok(def >= 0 && share > def);
});

test('index.html 에 공유 띠 자리가 header 와 main 사이에 있고, share.css 를 불러온다', () => {
  const html = read('index.html');
  const header = html.indexOf('</header>');
  const banner = html.indexOf('id="share-banner"');
  const mainEl = html.indexOf('<main id="editor-area"');
  assert.ok(header >= 0 && banner > header && mainEl > banner);
  assert.match(read('src/style.css'), /@import '\.\/styles\/share\.css';/);
});

test('런타임 — 다른 문서를 열면 공유 세션을 떠나고, 관리키는 주소창에서 지운다', () => {
  const rt = read('src/share/share-runtime.ts');
  assert.match(rt, /'document-swapped'/);
  assert.match(rt, /history\.replaceState/);
  assert.match(rt, /ADMIN_KEY_STORAGE_PREFIX/);
  assert.match(rt, /pagehide/);
  const main = read('src/main.ts');
  const create = main.slice(main.indexOf('async function createNewDocument'), main.indexOf('async function createNewDocument') + 600);
  assert.match(create, /shareRuntime\?\.leave\(/);
});

test('[최종 검토] 공유본 열기 표시는 횟수(겹친 다시 열기에서 하나가 끝나도 남은 열기를 남의 문서 열기로 오인하지 않음)', () => {
  const rt = read('src/share/share-runtime.ts');
  assert.match(rt, /private loadingShare = 0;/);
  assert.match(rt, /this\.loadingShare === 0 && this\.session/);
  assert.match(rt, /onNewVersion: \(bytes, meta\) => this\.applyNewVersion\(bytes, meta\)/);
});
