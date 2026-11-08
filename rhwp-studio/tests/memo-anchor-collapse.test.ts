import test from 'node:test';
import assert from 'node:assert/strict';
import { collapsedMemos, positionToMemoLocation } from '../src/memo/memo-collapse.ts';
import type { MemoEntry } from '../src/memo/memo-types.ts';

const entry = (fieldId: number, start: number, end: number): MemoEntry => ({
  fieldId, number: fieldId, author: 'a', createdAt: '', text: '', readable: true,
  location: { sectionIndex: 0, paraIndex: 0 }, startCharIdx: start, endCharIdx: end,
});

test('collapsedMemos 는 대상 글자가 모두 지워진(start==end) 메모만 돌려준다', () => {
  const out = collapsedMemos([entry(1, 2, 5), entry(2, 7, 7), entry(3, 0, 1)]);
  assert.deepEqual(out.map((m) => m.fieldId), [2]);
  assert.deepEqual(collapsedMemos([]), []);
});

test('positionToMemoLocation 은 본문·셀·중첩 셀·글상자 위치를 getMemoList 의 location 모양으로 바꾼다', () => {
  assert.deepEqual(positionToMemoLocation({ sectionIndex: 1, paragraphIndex: 4, charOffset: 2 } as any), { sectionIndex: 1, paraIndex: 4 });
  assert.deepEqual(
    positionToMemoLocation({ sectionIndex: 0, paragraphIndex: 0, charOffset: 2, parentParaIndex: 3, controlIndex: 0, cellIndex: 2, cellParaIndex: 1 } as any),
    { sectionIndex: 0, paraIndex: 3, path: [{ type: 'cell', controlIndex: 0, cellIndex: 2, paraIndex: 1 }] },
  );
  assert.deepEqual(
    positionToMemoLocation({ sectionIndex: 0, paragraphIndex: 0, charOffset: 0, parentParaIndex: 3, cellPath: [{ controlIndex: 0, cellIndex: 2, cellParaIndex: 1 }, { controlIndex: 1, cellIndex: 0, cellParaIndex: 0 }] } as any),
    { sectionIndex: 0, paraIndex: 3, path: [{ type: 'cell', controlIndex: 0, cellIndex: 2, paraIndex: 1 }, { type: 'cell', controlIndex: 1, cellIndex: 0, paraIndex: 0 }] },
  );
  assert.deepEqual(
    positionToMemoLocation({ sectionIndex: 0, paragraphIndex: 0, charOffset: 0, parentParaIndex: 5, controlIndex: 2, cellIndex: 0, cellParaIndex: 0, isTextBox: true } as any),
    { sectionIndex: 0, paraIndex: 5, path: [{ type: 'textbox', controlIndex: 2, paraIndex: 0 }] },
  );
});
