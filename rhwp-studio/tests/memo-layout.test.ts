import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMemoLayout, type MemoLayoutInput } from '../src/memo/memo-layout.ts';
import type { MemoEntry } from '../src/memo/memo-types.ts';

const entry = (fieldId: number, readable = true): MemoEntry => ({
  fieldId,
  number: fieldId,
  author: '홍길동',
  createdAt: '2026-11-08T14:00:00Z',
  text: `메모 ${fieldId}`,
  readable,
  location: { sectionIndex: 0, paraIndex: 0 },
  startCharIdx: 0,
  endCharIdx: 2,
});

function input(over: Partial<MemoLayoutInput> = {}): MemoLayoutInput {
  return {
    entries: [entry(1), entry(2)],
    anchors: new Map([
      [1, [{ pageIndex: 0, x: 50, y: 100, width: 80, height: 20 }]],
      [2, [{ pageIndex: 0, x: 50, y: 105, width: 40, height: 20 }, { pageIndex: 0, x: 0, y: 125, width: 30, height: 20 }]],
    ]),
    pages: [{ pageIndex: 0, left: 100, top: 10, width: 600, height: 800 }],
    zoom: 1,
    bandPx: 208,
    balloonHeights: new Map([[1, 60], [2, 60]]),
    gap: 6,
    showGuides: true,
    ...over,
  };
}

test('쪽마다 띠 하나 — 쪽 바로 오른쪽, 쪽 높이와 같다(적층이 더 길지 않으면)', () => {
  const out = computeMemoLayout(input());
  assert.equal(out.bands.length, 1);
  assert.deepEqual(out.bands[0], { pageIndex: 0, left: 700, top: 10, width: 208, height: 800 });
});

test('풍선은 앵커 첫 사각형 높이에 놓이고 겹치면 아래로 밀린다', () => {
  const out = computeMemoLayout(input());
  const b1 = out.balloons.find((b) => b.fieldId === 1)!;
  const b2 = out.balloons.find((b) => b.fieldId === 2)!;
  assert.equal(b1.top, 10 + 100);
  assert.equal(b1.left, 700 + 8);
  assert.equal(b2.top, b1.top + 60 + 6);
  assert.equal(b1.width, 208 - 16);
});

test('앵커 밑줄은 사각형마다, 안내선은 첫 사각형 오른쪽 가운데에서 풍선 왼쪽 가운데로', () => {
  const out = computeMemoLayout(input());
  assert.equal(out.anchors.filter((a) => a.fieldId === 2).length, 2);
  const g = out.guides.find((g) => g.fieldId === 1)!;
  assert.deepEqual([g.x1, g.y1], [100 + 50 + 80, 10 + 100 + 10]);
  assert.deepEqual([g.x2, g.y2], [708, 110 + 30]);
  assert.equal(computeMemoLayout(input({ showGuides: false })).guides.length, 0);
});

test('적층이 쪽 아래를 넘으면 띠 높이가 늘어난다', () => {
  const out = computeMemoLayout(input({ balloonHeights: new Map([[1, 500], [2, 500]]) }));
  // 2번 풍선 top = 110 + 500 + 6 = 616, bottom = 1116 → 띠 top 10 부터 1106 + gap
  assert.equal(out.bands[0].height, 1116 - 10 + 6);
});

test('앵커 사각형이 없는 메모(보이지 않는 쪽)는 풍선을 만들지 않고 줌은 좌표에 곱해진다', () => {
  const out = computeMemoLayout(input({
    entries: [entry(1), entry(3)],
    zoom: 2,
    pages: [{ pageIndex: 0, left: 100, top: 10, width: 1200, height: 1600 }],
  }));
  assert.equal(out.balloons.length, 1);
  assert.equal(out.balloons[0].top, 10 + 100 * 2);
  assert.equal(out.bands[0].left, 100 + 1200);
});
