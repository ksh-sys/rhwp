import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScaleUpdates, scaledSizeForHandle, type CellGeometry } from '../src/engine/table-resize-updates.ts';

function grid(widths: number[], heights: number[]): CellGeometry[] {
  const cells: CellGeometry[] = [];
  heights.forEach((height, row) => {
    widths.forEach((width, col) => {
      cells.push({ cellIdx: row * widths.length + col, row, col, rowSpan: 1, colSpan: 1, width, height });
    });
  });
  return cells;
}

test('표 전체 배율 조절: 칸 너비·줄 높이를 비율대로 늘리고 합이 목표 크기와 같다', () => {
  const cells = grid([1000, 3000], [500, 1500]);
  const updates = buildScaleUpdates(cells, 1.5, 2);
  const byIdx = new Map(updates.map((u) => [u.cellIdx, u]));
  // 0행: 1000→1500(+500), 3000→4500(+1500); 높이 500→1000(+500)
  assert.deepEqual([byIdx.get(0)?.widthDelta, byIdx.get(1)?.widthDelta], [500, 1500]);
  assert.deepEqual([byIdx.get(0)?.heightDelta, byIdx.get(2)?.heightDelta], [500, 1500]);
  const rowW = (cells.filter((c) => c.row === 0).reduce((s, c) => s + c.width + (byIdx.get(c.cellIdx)?.widthDelta ?? 0), 0));
  assert.equal(rowW, 6000);
});

test('병합 셀은 걸친 칸·줄의 증분 합을 받는다', () => {
  const cells: CellGeometry[] = [
    { cellIdx: 0, row: 0, col: 0, rowSpan: 1, colSpan: 2, width: 4000, height: 500 },
    { cellIdx: 1, row: 1, col: 0, rowSpan: 1, colSpan: 1, width: 1000, height: 700 },
    { cellIdx: 2, row: 1, col: 1, rowSpan: 1, colSpan: 1, width: 3000, height: 700 },
  ];
  const byIdx = new Map(buildScaleUpdates(cells, 2, 1).map((u) => [u.cellIdx, u]));
  assert.equal(byIdx.get(0)?.widthDelta, 4000); // 1000+3000 의 증분 합
  assert.equal(byIdx.get(0)?.heightDelta ?? 0, 0);
});

test('배율 1 이면 갱신이 없고, 반올림해도 줄 폭 합은 목표에 맞는다', () => {
  assert.deepEqual(buildScaleUpdates(grid([1000, 1000], [500]), 1, 1), []);
  const cells = grid([1001, 1001, 1001], [500]);
  const byIdx = new Map(buildScaleUpdates(cells, 1.3333, 1).map((u) => [u.cellIdx, u]));
  const total = cells.reduce((s, c) => s + c.width + (byIdx.get(c.cellIdx)?.widthDelta ?? 0), 0);
  assert.equal(total, Math.round(3003 * 1.3333));
});

test('핸들 방향에 따라 드래그 변위가 폭·높이에 반영되고 최소 크기 아래로 내려가지 않는다', () => {
  assert.deepEqual(scaledSizeForHandle('se', { w: 400, h: 200 }, { dx: 50, dy: -20 }, 40), { w: 450, h: 180 });
  assert.deepEqual(scaledSizeForHandle('e', { w: 400, h: 200 }, { dx: 50, dy: 90 }, 40), { w: 450, h: 200 });
  assert.deepEqual(scaledSizeForHandle('s', { w: 400, h: 200 }, { dx: 50, dy: 90 }, 40), { w: 400, h: 290 });
  assert.deepEqual(scaledSizeForHandle('w', { w: 400, h: 200 }, { dx: 50, dy: 0 }, 40), { w: 350, h: 200 });
  assert.deepEqual(scaledSizeForHandle('n', { w: 400, h: 200 }, { dx: 0, dy: 30 }, 40), { w: 400, h: 170 });
  assert.deepEqual(scaledSizeForHandle('nw', { w: 400, h: 200 }, { dx: 500, dy: 500 }, 40), { w: 40, h: 40 });
  assert.equal(scaledSizeForHandle('rotate', { w: 400, h: 200 }, { dx: 5, dy: 5 }, 40), null);
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

test('마우스 배선: Ctrl+클릭은 캐럿 셀부터 범위 선택, 개체 핸들은 배율 드래그·hover 커서', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const mouse = readFileSync(path.join(here, '..', 'src/engine/input-handler-mouse.ts'), 'utf8');
  assert.match(mouse, /e\.ctrlKey && !e\.shiftKey && !e\.altKey && this\.cursor\.isInCell\(\) && !this\.cursor\.isInCellSelectionMode\(\)/);
  assert.match(mouse, /enterCellSelectionMode\('manual'\)[\s\S]{0,200}setCellSelectionFocus\(cellRC\.row, cellRC\.col\)/);
  assert.doesNotMatch(mouse, /ctrlToggleCell\(/);
  assert.match(mouse, /startTableScaleDrag\(/);
  assert.match(mouse, /finishTableScaleDrag\(\)/);
  assert.match(mouse, /tableHandleCursor\(dir\)/);
});
