import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isBlockedInViewMode } from '../src/command/view-mode-policy.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(here, '..', rel), 'utf8');
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

test('보기 전용 — 편집 명령은 막고 읽기 명령은 허용한다(허용 목록 방식)', () => {
  for (const id of ['edit:cut', 'edit:paste', 'edit:delete', 'edit:undo', 'edit:find-replace',
    'review:memo-insert', 'review:memo-delete', 'format:bold', 'insert:table', 'table:insert-row',
    'page:setup', 'file:save', 'file:new-doc', 'file:page-setup', 'view:form-mode', 'field:edit']) {
    assert.equal(isBlockedInViewMode(id), true, id);
  }
  for (const id of ['edit:copy', 'edit:select-all', 'edit:find', 'edit:find-again', 'edit:goto',
    'view:zoom-in', 'view:para-mark', 'file:open', 'file:save-as', 'file:save-as-hwp', 'file:save-as-hwpx',
    'file:print', 'file:print-to-pdf', 'file:export-html', 'file:about', 'tool:options',
    'review:memo-show', 'review:memo-guide', 'review:memo-list', 'review:memo-prev', 'review:memo-next',
    'file:share-link', 'file:share-manage', 'ext:foo']) {
    assert.equal(isBlockedInViewMode(id), false, id);
  }
});

test('dispatcher 가 view 모드를 실행·활성 판정 두 곳에서 모두 막는다', () => {
  const src = read('src/command/dispatcher.ts');
  assert.ok(count(src, 'isBlockedInViewMode(') >= 2);
  assert.match(src, /'blocked-in-view-mode'/);
  assert.match(read('src/command/types.ts'), /export type EditorEditMode = 'normal' \| 'form' \| 'view'/);
});

test('입력 진입점마다 양식 모드 가드 옆에 보기 전용 가드가 있다', () => {
  for (const f of ['src/engine/input-handler-text.ts', 'src/engine/input-handler-keyboard.ts']) {
    // caretRectForPageScroll 의 양식 모드 가드는 편집이 아니라 PgUp/PgDn 캐럿 동반 이동 정책이라 제외한다.
    const raw = read(f);
    const skip = raw.indexOf('function caretRectForPageScroll');
    const src = skip < 0 ? raw : raw.slice(0, skip) + raw.slice(raw.indexOf(String.fromCharCode(10) + '}', skip));
    assert.ok(count(src, 'isViewMode') >= count(src, 'isFormMode?.()'), f);
  }
  const text = read('src/engine/input-handler-text.ts');
  for (const fn of ['export function onInput', 'export function onCompositionStart', 'export function onCompositionEnd']) {
    const body = text.slice(text.indexOf(fn), text.indexOf(fn) + 600);
    assert.match(body, /isViewMode/, fn);
  }
});

test('마우스 드래그 시작점(표 테두리·배율·이동, 개체 크기·이동·회전·끝점)이 보기 전용에서 막힌다', () => {
  const mouse = read('src/engine/input-handler-mouse.ts');
  const starts = ['this.isMoveDragging = true', 'this.isPictureResizeDragging = true', 'this.isPictureMoveDragging = true',
    'this.isLineEndpointDragging = true', 'this.isPictureRotateDragging = true'];
  let guarded = 0, total = 0;
  for (const s of starts) {
    let i = mouse.indexOf(s);
    while (i >= 0) {
      total++;
      if (mouse.slice(Math.max(0, i - 400), i).includes('isViewMode')) guarded++;
      i = mouse.indexOf(s, i + 1);
    }
  }
  assert.ok(total >= 7);
  assert.equal(guarded, total);
  const dbl = mouse.slice(mouse.indexOf('export function onDblClick'), mouse.indexOf('export function onDblClick') + 300);
  assert.match(dbl, /isViewMode/);
  const table = read('src/engine/input-handler-table.ts');
  for (const fn of ['export function startResizeDrag', 'export function startTableScaleDrag']) {
    const body = table.slice(table.indexOf(fn), table.indexOf(fn) + 500);
    assert.match(body, /isViewMode/, fn);
  }
});

test('InputHandler — isViewMode, 기록 경로 전면 거부, 클립보드·서식 진입점 가드', () => {
  const ih = read('src/engine/input-handler.ts');
  assert.match(ih, /isViewMode\(\): boolean \{ return this\.editMode === 'view'; \}/);
  const allowed = ih.slice(ih.indexOf('private isOperationAllowedInEditMode'), ih.indexOf('private isOperationAllowedInEditMode') + 400);
  assert.match(allowed, /'view'/);
  for (const fn of ['performPaste(): boolean {', 'performCut(): void {', 'performDelete(): void {']) {
    const body = ih.slice(ih.indexOf(fn), ih.indexOf(fn) + 200);
    assert.match(body, /isViewMode|'view'/, fn);
  }
  const fmt = ih.slice(ih.indexOf("eventBus.on('format-char'"), ih.indexOf("eventBus.on('format-char'") + 200);
  assert.match(fmt, /'view'/);
});

test('main — view 상태줄 문구·편집 불가 컨텍스트·드롭 차단·서식 도구 모음 끄기', () => {
  const main = read('src/main.ts');
  assert.match(main, /ui\.sbMessage\.viewMode/);
  assert.match(main, /editMode !== 'view'/);
  const drop = main.slice(main.indexOf("container.addEventListener('drop'"), main.indexOf("container.addEventListener('drop'") + 300);
  assert.match(drop, /'view'/);
  for (const loc of ['ko', 'en']) assert.match(read(`src/i18n/locales/${loc}.ts`), /"ui\.sbMessage\.viewMode"/);
  // 서식 도구 모음은 Toolbar.setEnabled 가 인라인 스타일로 켜고 끄므로 CSS 가 아니라 같은 함수로 끈다.
  assert.match(main, /toolbar\?\.setEnabled\(mode !== 'view'\)/);
  assert.match(main, /toolbar\?\.setEnabled\(editMode !== 'view'\)/);
});
