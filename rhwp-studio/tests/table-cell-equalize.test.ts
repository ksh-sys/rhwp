import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEqualHeightUpdates,
  buildEqualWidthUpdates,
  type CellGeometry,
} from '../src/engine/table-resize-updates.ts';
import { resolveCellBlockLetterShortcut } from '../src/command/contextual-shortcut.ts';

/** rows×cols 격자, 칸 너비 widths, 줄 높이 heights. 병합 없음. */
function grid(widths: number[], heights: number[]): CellGeometry[] {
  const cells: CellGeometry[] = [];
  heights.forEach((height, row) => {
    widths.forEach((width, col) => {
      cells.push({ cellIdx: row * widths.length + col, row, col, rowSpan: 1, colSpan: 1, width, height });
    });
  });
  return cells;
}

function apply(cells: CellGeometry[], updates: ReturnType<typeof buildEqualWidthUpdates>): CellGeometry[] {
  const byIdx = new Map(updates.map((u) => [u.cellIdx, u]));
  return cells.map((c) => ({
    ...c,
    width: c.width + (byIdx.get(c.cellIdx)?.widthDelta ?? 0),
    height: c.height + (byIdx.get(c.cellIdx)?.heightDelta ?? 0),
  }));
}

const rowWidths = (cells: CellGeometry[], row: number) =>
  cells.filter((c) => c.row === row).sort((a, b) => a.col - b.col).map((c) => c.width);

test('셀 너비를 같게: 선택 칸의 폭 합을 고르게 나누고 줄 폭 합·선택 밖 칸은 그대로', () => {
  const cells = grid([1000, 3000, 2000, 4000], [500, 500, 500]);
  const range = { startRow: 0, startCol: 0, endRow: 1, endCol: 2 };
  const after = apply(cells, buildEqualWidthUpdates(cells, range));
  assert.deepEqual(rowWidths(after, 0), [2000, 2000, 2000, 4000]);
  assert.deepEqual(rowWidths(after, 1), [2000, 2000, 2000, 4000]);
  // 선택하지 않은 줄은 건드리지 않는다
  assert.deepEqual(rowWidths(after, 2), [1000, 3000, 2000, 4000]);
});

test('셀 너비를 같게: 나누어떨어지지 않아도 줄 폭 합은 정확히 유지', () => {
  const cells = grid([1000, 1000, 1001], [500]);
  const after = apply(cells, buildEqualWidthUpdates(cells, { startRow: 0, startCol: 0, endRow: 0, endCol: 2 }));
  const widths = rowWidths(after, 0);
  assert.equal(widths.reduce((a, b) => a + b, 0), 3001);
  assert.ok(Math.max(...widths) - Math.min(...widths) <= 1);
});

test('셀 너비를 같게: 가로 병합 셀은 걸친 칸 수만큼, 경계를 넘는 병합 줄은 건드리지 않음', () => {
  const cells: CellGeometry[] = [
    // 0줄: [0-1 병합 4000][2: 2000]
    { cellIdx: 0, row: 0, col: 0, rowSpan: 1, colSpan: 2, width: 4000, height: 500 },
    { cellIdx: 1, row: 0, col: 2, rowSpan: 1, colSpan: 1, width: 2000, height: 500 },
    // 1줄: [0: 1000][1-2 병합 5000] — 선택 0~1칸이면 병합이 경계를 넘는다
    { cellIdx: 2, row: 1, col: 0, rowSpan: 1, colSpan: 1, width: 1000, height: 500 },
    { cellIdx: 3, row: 1, col: 1, rowSpan: 1, colSpan: 2, width: 5000, height: 500 },
  ];
  const all = apply(cells, buildEqualWidthUpdates(cells, { startRow: 0, startCol: 0, endRow: 0, endCol: 2 }));
  assert.deepEqual(rowWidths(all, 0), [4000, 2000]);
  const partial = buildEqualWidthUpdates(cells, { startRow: 1, startCol: 0, endRow: 1, endCol: 1 });
  assert.deepEqual(partial, []);
});

test('셀 높이를 같게: 선택 줄의 높이 합을 고르게 나누고 그 줄의 모든 칸을 맞춤', () => {
  const cells = grid([1000, 1000, 1000], [400, 1600, 1000]);
  // 1번 줄의 한 칸만 더 낮게 저장돼 있어도 줄 높이는 최댓값으로 본다
  cells[4].height = 900;
  const after = apply(cells, buildEqualHeightUpdates(cells, { startRow: 0, startCol: 1, endRow: 1, endCol: 1 }));
  for (const c of after.filter((x) => x.row <= 1)) assert.equal(c.height, 1000);
  for (const c of after.filter((x) => x.row === 2)) assert.equal(c.height, 1000);
});

test('셀 높이를 같게: 세로 병합 셀은 걸친 줄 수만큼, 범위를 넘는 병합은 그대로', () => {
  const cells: CellGeometry[] = [
    { cellIdx: 0, row: 0, col: 0, rowSpan: 2, colSpan: 1, width: 1000, height: 3000 },
    { cellIdx: 1, row: 0, col: 1, rowSpan: 1, colSpan: 1, width: 1000, height: 1000 },
    { cellIdx: 2, row: 1, col: 1, rowSpan: 1, colSpan: 1, width: 1000, height: 2000 },
    { cellIdx: 3, row: 2, col: 0, rowSpan: 1, colSpan: 1, width: 1000, height: 700 },
    { cellIdx: 4, row: 2, col: 1, rowSpan: 1, colSpan: 1, width: 1000, height: 700 },
  ];
  const after = apply(cells, buildEqualHeightUpdates(cells, { startRow: 0, startCol: 0, endRow: 1, endCol: 1 }));
  assert.equal(after[0].height, 3000);
  assert.equal(after[1].height, 1500);
  assert.equal(after[2].height, 1500);
  assert.equal(after[3].height, 700);
});

test('한 칸·한 줄만 고르면 바꿀 것이 없다', () => {
  const cells = grid([1000, 2000], [500, 900]);
  assert.deepEqual(buildEqualWidthUpdates(cells, { startRow: 0, startCol: 0, endRow: 1, endCol: 0 }), []);
  assert.deepEqual(buildEqualHeightUpdates(cells, { startRow: 0, startCol: 0, endRow: 0, endCol: 1 }), []);
});

test('F5 셀 블록에서 H/W(한글 자판 ㅗ/ㅈ 포함)는 높이/너비를 같게', () => {
  const key = (k: string, code: string) => ({ key: k, code, ctrlKey: false, metaKey: false, altKey: false });
  const block = { inCellSelectionMode: true };
  assert.deepEqual(resolveCellBlockLetterShortcut(key('h', 'KeyH'), block), { kind: 'dispatch', commandId: 'table:cell-height-equal' });
  assert.deepEqual(resolveCellBlockLetterShortcut(key('ㅗ', 'KeyH'), block), { kind: 'dispatch', commandId: 'table:cell-height-equal' });
  assert.deepEqual(resolveCellBlockLetterShortcut(key('w', 'KeyW'), block), { kind: 'dispatch', commandId: 'table:cell-width-equal' });
  assert.deepEqual(resolveCellBlockLetterShortcut(key('ㅈ', 'KeyW'), block), { kind: 'dispatch', commandId: 'table:cell-width-equal' });
  assert.equal(resolveCellBlockLetterShortcut(key('h', 'KeyH'), { inCellSelectionMode: false }), null);
});

test('F5 셀 블록에서 P(ㅔ)는 표/셀 속성', () => {
  const key = (k: string, code: string) => ({ key: k, code, ctrlKey: false, metaKey: false, altKey: false });
  const block = { inCellSelectionMode: true };
  assert.deepEqual(resolveCellBlockLetterShortcut(key('p', 'KeyP'), block), { kind: 'dispatch', commandId: 'table:cell-props' });
  assert.deepEqual(resolveCellBlockLetterShortcut(key('ㅔ', 'KeyP'), block), { kind: 'dispatch', commandId: 'table:cell-props' });
});
