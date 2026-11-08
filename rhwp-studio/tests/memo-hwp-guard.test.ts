import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { hwpSaveWarning, unreadableMemoCount } from '../src/memo/memo-hwp-guard.ts';
import type { MemoEntry } from '../src/memo/memo-types.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(here, '..', rel), 'utf8');

const entry = (fieldId: number, readable: boolean): MemoEntry => ({
  fieldId, number: fieldId, author: 'a', createdAt: '', text: readable ? 'x' : '', readable,
  location: { sectionIndex: 0, paraIndex: 0 }, startCharIdx: 0, endCharIdx: 1,
});

test('unreadableMemoCount 는 본문을 읽지 못한 메모 수', () => {
  assert.equal(unreadableMemoCount([entry(1, false), entry(2, true), entry(3, false)]), 2);
  assert.equal(unreadableMemoCount([]), 0);
});

test('hwpSaveWarning 은 읽지 못한 메모가 없으면 null, 있으면 개수를 담은 문구', () => {
  assert.equal(hwpSaveWarning(0, 3, (k, p) => `${k}:${p?.count}/${p?.total}`), null);
  assert.equal(hwpSaveWarning(2, 3, (k, p) => `${k}:${p?.count}/${p?.total}`), 'memo.hwpSaveWarning.text:2/3');
});

test('.hwp 저장 경로(다른 이름으로·저장)가 경고를 거친다', () => {
  const file = read('src/command/commands/file.ts');
  assert.match(file, /guardHwpMemoLoss\(/);
  assert.ok((file.match(/await guardHwpMemoLoss\(/g) ?? []).length >= 2, '저장·다른 이름으로 저장 두 경로');
  for (const locale of ['ko', 'en']) {
    const src = read(`src/i18n/locales/${locale}.ts`);
    for (const key of ['memo.hwpSaveWarning.text', 'memo.hwpSaveWarning.title', 'memo.hwpSaveWarning.saveHwpx', 'memo.hwpSaveWarning.saveAnyway']) {
      assert.ok(src.includes(`"${key}"`), `${locale}: ${key}`);
    }
  }
});
