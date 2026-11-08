import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(here, '..', rel), 'utf8');

test('풍선 본문은 textarea 로 편집하고 Escape(원복)·Ctrl+Enter(확정)·빈 값 Backspace(삭제)를 처리한다', () => {
  const src = read('src/memo/memo-layer.ts');
  assert.match(src, /textarea\.memo-text/);
  assert.match(src, /key === 'Escape'/);
  assert.match(src, /key === 'Enter'[^\n]*ctrlKey/);
  assert.match(src, /key === 'Backspace'[^\n]*value === ''/);
  assert.match(src, /memo-close/);
  // 편집 확정은 blur 에서 한 번 — 레이어가 직접 wasm 을 부르지 않는다
  assert.doesNotMatch(src, /\bwasm\.(insertMemo|updateMemoText|removeMemo)\(/);
});

test('캐럿 이동 시 그 자리의 메모를 활성화하고, 풍선/밑줄 클릭은 본문 캐럿을 앵커로 옮긴다', () => {
  const main = read('src/main.ts');
  assert.match(main, /cursor-para-changed[\s\S]{0,400}findAtCaret/);
  assert.match(main, /collapsedMemos/);
  assert.match(main, /moveCursorTo/);
});
