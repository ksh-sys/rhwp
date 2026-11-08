import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoStore } from '../src/memo/memo-store.ts';
import { memoBandPx, toFieldTarget, type MemoEntry } from '../src/memo/memo-types.ts';

const entry = (fieldId: number, paraIndex: number, start: number, end: number): MemoEntry => ({
  fieldId,
  number: fieldId,
  author: '홍길동',
  createdAt: '2026-11-08T14:00:00Z',
  text: `메모 ${fieldId}`,
  readable: true,
  location: { sectionIndex: 0, paraIndex },
  startCharIdx: start,
  endCharIdx: end,
});

const three = () => [entry(11, 0, 1, 3), entry(12, 0, 5, 6), entry(13, 1, 0, 2)];

test('findAtCaret 는 같은 문단에서 범위 안(끝 포함)의 메모를 찾는다', () => {
  const store = new MemoStore(three);
  store.refresh();
  assert.equal(store.findAtCaret({ sectionIndex: 0, paraIndex: 0 }, 2)?.fieldId, 11);
  assert.equal(store.findAtCaret({ sectionIndex: 0, paraIndex: 0 }, 3)?.fieldId, 11);
  assert.equal(store.findAtCaret({ sectionIndex: 0, paraIndex: 0 }, 4), null);
  assert.equal(store.findAtCaret({ sectionIndex: 0, paraIndex: 1 }, 1)?.fieldId, 13);
  assert.equal(store.findAtCaret({ sectionIndex: 0, paraIndex: 0, path: [{ type: 'cell', controlIndex: 0, cellIndex: 0, paraIndex: 0 }] }, 2), null);
});

test('neighbor 는 문서 순으로 다음/이전을 주고 끝에서는 null', () => {
  const store = new MemoStore(three);
  store.refresh();
  assert.equal(store.neighbor(null, 1)?.fieldId, 11);
  assert.equal(store.neighbor(11, 1)?.fieldId, 12);
  assert.equal(store.neighbor(13, 1), null);
  assert.equal(store.neighbor(12, -1)?.fieldId, 11);
  assert.equal(store.neighbor(null, -1)?.fieldId, 13);
});

test('setActive 는 onChange 를 한 번 부르고 refresh 로 사라진 활성 메모는 해제된다', () => {
  let list = three();
  const store = new MemoStore(() => list);
  store.refresh();
  let calls = 0;
  const off = store.onChange(() => {
    calls += 1;
  });
  store.setActive(12);
  assert.equal(calls, 1);
  assert.equal(store.activeId, 12);
  list = [entry(11, 0, 1, 3)];
  store.refresh();
  assert.equal(store.activeId, null);
  off();
  store.setActive(11);
  assert.equal(calls, 2);
});

test('toFieldTarget 은 cell/textbox 경로를 [컨트롤, 셀, 문단] 으로 바꾼다', () => {
  assert.deepEqual(toFieldTarget({ sectionIndex: 0, paraIndex: 4 }), { section: 0, para: 4, cellPath: [] });
  assert.deepEqual(
    toFieldTarget({
      sectionIndex: 1,
      paraIndex: 2,
      path: [
        { type: 'cell', controlIndex: 0, cellIndex: 3, paraIndex: 1 },
        { type: 'textbox', controlIndex: 2, paraIndex: 0 },
      ],
    }),
    { section: 1, para: 2, cellPath: [[0, 3, 1], [2, 0, 0]] },
  );
});

test('memoBandPx 는 15591 HWPUNIT 를 px·zoom 으로 바꾼다', () => {
  assert.equal(memoBandPx(1), 208);
  assert.equal(memoBandPx(0.5), 104);
});
