// F5 셀 선택 후 키보드 셀 크기 조절 3모드(한컴 table(size).htm)의
// resizeTableCells update 구성. WASM/DOM 의존이 없는 순수 로직이라
// 단위 테스트가 직접 검증한다 (tests/table-cell-resize-keyboard.test.ts).

import type { CellBbox } from '../core/types';

export type ResizeArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

export type CellSelectionRange = {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
};

export type LocalResizeUpdate = {
  cellIdx: number;
  widthDelta?: number;
  heightDelta?: number;
  /** 표 높이를 줄 높이 합으로 다시 맞춘다 — 엔진이 표 높이 여유분을 보존하지 않게 한다 (셀 높이를 같게) */
  fitTableHeight?: boolean;
};

/** Only pointer gestures that map to durable table geometry may own a drag. */
export function shouldStartPersistentTableResize(button: number, shiftKey: boolean): boolean {
  return button === 0 && !shiftKey;
}

/** 키보드 셀 크기 조절: 1 키스트로크 당 이동량 (HWPUNIT, 약 1mm). */
const KEYBOARD_RESIZE_DELTA_HWP = 300;

function resizeAxis(key: ResizeArrowKey): { isHoriz: boolean; delta: number } {
  const isHoriz = key === 'ArrowLeft' || key === 'ArrowRight';
  const delta =
    key === 'ArrowRight' || key === 'ArrowDown'
      ? KEYBOARD_RESIZE_DELTA_HWP
      : -KEYBOARD_RESIZE_DELTA_HWP;
  return { isHoriz, delta };
}

/** 페이지 fragment 중복을 제거한다. 병합 셀도 실제 경계를 찾아 처리해야 한다. */
function collectUniqueCells(bboxes: CellBbox[]): CellBbox[] {
  const seen = new Set<number>();
  const out: CellBbox[] = [];
  for (const b of bboxes) {
    if (seen.has(b.cellIdx)) continue;
    seen.add(b.cellIdx);
    out.push(b);
  }
  return out;
}

function axisStart(b: CellBbox, isHoriz: boolean): number {
  return isHoriz ? b.col : b.row;
}

function axisEnd(b: CellBbox, isHoriz: boolean): number {
  return axisStart(b, isHoriz) + (isHoriz ? b.colSpan : b.rowSpan) - 1;
}

function overlapCount(b: CellBbox, isHoriz: boolean, start: number, end: number): number {
  return Math.max(0, Math.min(axisEnd(b, isHoriz), end) - Math.max(axisStart(b, isHoriz), start) + 1);
}

/**
 * 셀 선택 범위와 셀이 실제로 겹치는지 판정한다. 병합 셀은 bbox에 시작 행/열만
 * 저장되므로 시작 좌표를 범위와 직접 비교하면 선택 범위가 병합 셀의 하위 행/열일 때
 * 그 병합 셀이 통째로 누락된다. F5 키보드 경로(selectedAxisRange)와
 * 마우스 드래그 경로(finishResizeDrag)가 이 판정 하나를 공유한다.
 */
export function cellOverlapsSelectionRange(b: CellBbox, range: CellSelectionRange): boolean {
  return overlapCount(b, true, range.startCol, range.endCol) > 0
    && overlapCount(b, false, range.startRow, range.endRow) > 0;
}

/**
 * 셀 선택 상태의 마우스 열 경계 드래그: 경계 왼쪽의 선택 셀에 delta, 오른쪽 이웃에
 * 반대 delta 를 만들어 표 외곽 폭을 유지한다. 병합 셀은 걸친 모든 행의 이웃을
 * 보상해야 한다 — 시작 행의 이웃 하나만 보상하면 나머지 행의 열 폭 합이 어긋나
 * 표가 깨진다 (finishResizeDrag 가 사용).
 */
export function buildCellSelectionColumnDragUpdates(
  selectedBboxes: CellBbox[],
  allBboxes: CellBbox[],
  deltaHwpUnit: number,
): LocalResizeUpdate[] {
  const updates: LocalResizeUpdate[] = [];
  const addedNeighbors = new Set<number>();
  for (const bbox of selectedBboxes) {
    updates.push({ cellIdx: bbox.cellIdx, widthDelta: deltaHwpUnit });
    const neighbors = allBboxes.filter(b =>
      b.col === bbox.col + bbox.colSpan
      && b.row < bbox.row + bbox.rowSpan
      && b.row + b.rowSpan > bbox.row);
    for (const neighbor of neighbors) {
      if (addedNeighbors.has(neighbor.cellIdx)) continue;
      updates.push({ cellIdx: neighbor.cellIdx, widthDelta: -deltaHwpUnit });
      addedNeighbors.add(neighbor.cellIdx);
    }
  }
  return updates;
}

/**
 * 경계 반대편에서 보상(-delta)을 받아야 하는 이웃 셀 전부. 병합 셀은 걸친
 * 모든 행(열 경계)/열(행 경계)의 이웃을 쓸어야 한다 — 시작 행/열의 이웃
 * 하나만 보상하면 나머지 줄의 폭/높이 합이 어긋나 표 크기가 뒤틀린다.
 */
export function findResizeCompensationNeighbors(
  edge: { type: 'row' | 'col' },
  bbox: CellBbox,
  bboxes: CellBbox[],
): CellBbox[] {
  if (edge.type === 'col') {
    return bboxes.filter(b =>
      b.col === bbox.col + bbox.colSpan
      && b.row < bbox.row + bbox.rowSpan
      && b.row + b.rowSpan > bbox.row);
  }

  return bboxes.filter(b =>
    b.row === bbox.row + bbox.rowSpan
    && b.col < bbox.col + bbox.colSpan
    && b.col + b.colSpan > bbox.col);
}

/**
 * Ctrl/Cmd+방향키: 선택 칸(열)/줄(행) 전체에 같은 delta — 표 전체 크기가 변한다.
 *
 * 렌더 괘선은 열별 max 로 만드는 base grid 를 쓰므로, 셀 하나만 조절하면
 * 다행 표에서 열 max 가 그대로라 화면에 반영되지 않는다. 병합 셀은 걸친
 * 선택 칸/줄 수만큼 delta 를 곱해 저장 폭/높이를 동기화한다 — 빼놓으면
 * 저장·재열기 후 병합 셀 폭이 열 폭 합과 어긋난다.
 */
export function buildColumnResizeUpdates(
  bboxes: CellBbox[],
  range: CellSelectionRange,
  key: ResizeArrowKey,
): LocalResizeUpdate[] {
  const { isHoriz, delta } = resizeAxis(key);
  const updates: LocalResizeUpdate[] = [];
  for (const b of collectUniqueCells(bboxes)) {
    // 셀이 걸친 선택 칸(열)/줄(행) 수 — span==1 이면 0 또는 1.
    const [selLo, selHi] = isHoriz ? [range.startCol, range.endCol] : [range.startRow, range.endRow];
    const overlap = overlapCount(b, isHoriz, selLo, selHi);
    if (overlap <= 0) continue;
    const d = delta * overlap;
    updates.push(isHoriz ? { cellIdx: b.cellIdx, widthDelta: d } : { cellIdx: b.cellIdx, heightDelta: d });
  }
  return updates;
}

/** 셀 격자 위치 + 저장된 크기(HWPUNIT, getCellProperties 의 width/height). */
export type CellGeometry = Pick<CellBbox, 'cellIdx' | 'row' | 'col' | 'rowSpan' | 'colSpan'> & {
  width: number;
  height: number;
};

function uniqueGeometry(cells: CellGeometry[]): CellGeometry[] {
  const seen = new Set<number>();
  return cells.filter((c) => (seen.has(c.cellIdx) ? false : (seen.add(c.cellIdx), true)));
}

/** 합 total 을 n 칸에 나눌 때 k 번째 경계 — 반올림 오차가 한 칸에 몰리지 않고 합은 그대로 남는다. */
function equalEdge(total: number, n: number, k: number): number {
  return Math.round((total * k) / n);
}

/**
 * 셀 너비를 같게 (한컴 F5 블록 + W): 선택한 줄마다 선택 칸들의 너비 합을 칸 수로 고르게
 * 다시 나눈다. 줄의 폭 합이 그대로라 표 바깥 폭과 선택 밖 칸은 변하지 않는다.
 * HWP 는 셀마다 자기 너비를 저장하므로(키보드·마우스 칸 크기 조절과 같은 경로) 그대로 저장된다.
 * 병합 셀이 선택 칸 경계를 넘는 줄은 고르게 나눌 수 없어 건드리지 않는다.
 */
export function buildEqualWidthUpdates(cells: CellGeometry[], range: CellSelectionRange): LocalResizeUpdate[] {
  const n = range.endCol - range.startCol + 1;
  if (n < 2) return [];
  const unique = uniqueGeometry(cells);
  const target = new Map<number, number>();
  for (let r = range.startRow; r <= range.endRow; r++) {
    const rowCells = unique.filter((c) =>
      c.row <= r && r < c.row + c.rowSpan
      && c.col <= range.endCol && c.col + c.colSpan - 1 >= range.startCol);
    const crosses = rowCells.some((c) => c.col < range.startCol || c.col + c.colSpan - 1 > range.endCol);
    const covered = rowCells.reduce((sum, c) => sum + c.colSpan, 0);
    if (crosses || covered !== n) continue;
    const total = rowCells.reduce((sum, c) => sum + c.width, 0);
    for (const c of rowCells) {
      if (target.has(c.cellIdx)) continue;
      const lo = c.col - range.startCol;
      target.set(c.cellIdx, equalEdge(total, n, lo + c.colSpan) - equalEdge(total, n, lo));
    }
  }
  return unique
    .filter((c) => target.has(c.cellIdx) && target.get(c.cellIdx) !== c.width)
    .map((c) => ({ cellIdx: c.cellIdx, widthDelta: target.get(c.cellIdx)! - c.width }));
}

/**
 * 셀 높이를 같게 (한컴 F5 블록 + H): 선택한 줄들의 **화면 높이** 합을 줄 수로 고르게 다시 나눈다.
 *
 * 저장된 셀 높이로 계산하면 안 된다 — 새 표의 셀은 저장 높이(282)가 글자 한 줄 높이보다 작아
 * 화면은 내용 높이로 그려지고, 표 높이(common.height)와 줄 높이 합의 차이(여유분)는 렌더러가
 * 마지막 줄에 몰아준다(fit_row_heights_to_common_height). 그래서 모든 줄의 저장 높이를 지금 보이는
 * 높이로 적고(선택 줄은 고르게 나눈 값), fitTableHeight 로 표 높이를 줄 합에 맞춰 여유분을 없앤다.
 * 선택 밖 줄은 보이는 그대로 남는다. 줄 병합은 걸친 줄 높이의 합.
 *
 * @param renderedRowHeights 줄마다 지금 화면 높이(HWPUNIT, 표 전체 줄 수만큼)
 */
export function buildEqualHeightUpdates(
  cells: CellGeometry[],
  range: CellSelectionRange,
  renderedRowHeights: number[],
): LocalResizeUpdate[] {
  const n = range.endRow - range.startRow + 1;
  if (n < 2 || range.endRow >= renderedRowHeights.length) return [];
  const target = renderedRowHeights.map((h) => Math.round(h));
  const total = target.slice(range.startRow, range.endRow + 1).reduce((a, b) => a + b, 0);
  for (let k = 0; k < n; k++) {
    target[range.startRow + k] = equalEdge(total, n, k + 1) - equalEdge(total, n, k);
  }
  const updates: LocalResizeUpdate[] = [];
  for (const c of uniqueGeometry(cells)) {
    const height = target.slice(c.row, c.row + c.rowSpan).reduce((a, b) => a + b, 0);
    if (height !== c.height) updates.push({ cellIdx: c.cellIdx, heightDelta: height - c.height, fitTableHeight: true });
  }
  return updates;
}
