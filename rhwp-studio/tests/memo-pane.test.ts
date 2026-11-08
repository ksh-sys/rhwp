import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { memoPaneRows, EXCERPT_CHARS } from '../src/memo/memo-pane-rows.ts';
import type { MemoEntry } from '../src/memo/memo-types.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(here, '..', rel), 'utf8');

const entry = (fieldId: number, text: string): MemoEntry => ({
  fieldId, number: fieldId, author: '홍길동', createdAt: '2026-11-08T14:00:00Z', text, readable: true,
  location: { sectionIndex: 0, paraIndex: fieldId }, startCharIdx: 0, endCharIdx: 2,
});

test('memoPaneRows 는 쪽·작성자·시각·내용 첫 줄(60자 절단)을 만든다', () => {
  const long = '가'.repeat(80);
  const rows = memoPaneRows([entry(1, '첫 줄\n둘째 줄'), entry(2, long), entry(3, '')], (m) => m.fieldId * 2, (iso) => iso.slice(0, 10));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { fieldId: 1, page: 2, author: '홍길동', when: '2026-11-08', excerpt: '첫 줄' });
  assert.equal(rows[1].excerpt.length, EXCERPT_CHARS + 1);
  assert.ok(rows[1].excerpt.endsWith('…'));
  assert.equal(rows[2].excerpt, '');
  assert.equal(rows[2].page, 6);
});

test('메모 내용 보기 창은 editor-area 아래 행에 있고 review:memo-list 설정으로 숨긴다', () => {
  assert.match(read('index.html'), /id="memo-pane"/);
  assert.match(read('src/styles/editor.css'), /grid-template-rows: 20px minmax\(0, 1fr\) auto/);
  const pane = read('src/memo/memo-pane.ts');
  assert.match(pane, /setVisible\(/);
  assert.match(pane, /onSelect/);
  assert.match(read('src/main.ts'), /new MemoPane\(/);
});
