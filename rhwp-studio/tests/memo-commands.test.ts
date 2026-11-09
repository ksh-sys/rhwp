import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(here, '..', rel), 'utf8');

const IDS = [
  'review:memo-insert',
  'review:memo-delete',
  'review:memo-prev',
  'review:memo-next',
  'review:memo-show',
  'review:memo-guide',
  'review:memo-list',
];

const count = (hay: string, needle: string) => hay.split(needle).length - 1;

test('검토 명령 7개가 정의되고 레지스트리에 등록된다', () => {
  const src = read('src/command/commands/review.ts');
  for (const id of IDS) assert.ok(src.includes(`id: '${id}'`), id);
  assert.match(read('src/main.ts'), /registry\.registerAll\(reviewCommands\)/);
});

test('검토 메뉴·리본에 7개가 한 번씩 있고 문서 비교 표면 수(4)는 그대로다', () => {
  const html = read('index.html');
  for (const id of IDS) assert.equal(count(html, `data-cmd="${id}"`), 1, id);
  assert.equal(count(html, 'data-cmd="edit:compare-documents"'), 4);
  const ribbon = read('src/ui/ribbon-tabs.ts');
  const review = ribbon.slice(ribbon.indexOf('  review: ['), ribbon.indexOf('  tool: ['));
  for (const id of IDS) assert.ok(review.includes(`'${id}'`), `ribbon ${id}`);
  assert.ok(review.includes("'edit:document-history'"));
});

test('Ctrl+M,C(ㅊ) 가 메모 넣기이고 IME 경로에도 KeyC 가 있다', () => {
  const kb = read('src/engine/input-handler-keyboard.ts');
  const map = kb.slice(kb.indexOf('const chordMapM'), kb.indexOf('const chordMapV'));
  assert.match(map, /\bc: 'review:memo-insert'/);
  assert.match(map, /ㅊ: 'review:memo-insert'/);
  assert.match(kb, /KeyC: 'c'/);
});

test('검토 i18n 키가 ko/en 에 모두 있다', () => {
  const keys = [
    ...IDS.map((id) => `command.review.${id.replace('review:', '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())}.label`),
    'memo.needUserName.text',
    'memo.openOptions.text',
    'memo.clampedToFirstParagraph.text',
    'memo.overlapsField.text',
    'memo.unreadableHwp.text',
  ];
  for (const locale of ['ko', 'en']) {
    const src = read(`src/i18n/locales/${locale}.ts`);
    for (const key of keys) assert.ok(src.includes(`"${key}"`), `${locale}: ${key}`);
  }
});

import { formatWhen, nowIsoSeconds } from '../src/memo/memo-time.ts';

test('메모 작성 시각은 한글처럼 현지 시각 + Z 로 쓰고, 읽을 때도 현지 시각으로 보여 준다', () => {
  const d = new Date(2026, 10, 8, 23, 31, 20); // 2026-11-08 23:31:20 현지
  assert.equal(nowIsoSeconds(d), '2026-11-08T23:31:20Z');
  assert.equal(formatWhen('2026-11-08T23:31:20Z'), '2026/11/08 23:31');
  assert.equal(formatWhen(''), '');
});
