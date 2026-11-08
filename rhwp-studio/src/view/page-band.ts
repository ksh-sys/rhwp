/**
 * 쪽 오른쪽 띠(메모 풍선 자리)의 레이아웃 산술 — 순수 함수 + 현재 띠 폭(100% 기준) 모듈 상태.
 *
 * 띠는 쪽의 일부가 아니라 쪽 옆 슬롯이다: 조판에 관여하지 않고, 가상 스크롤의 슬롯 폭·중앙
 * 정렬·폭 맞춤 배율에만 더해진다. 폭은 배율에 비례한다(한글 memoPr width 가 HWPUNIT 이므로).
 *
 * `@/` 별칭 없음 — node:test 가 그대로 읽는다.
 */

const HORIZONTAL_FRAME_PADDING = 40;

/** 쪽 폭(px, 배율 적용) + 띠 폭(px, 배율 적용) */
export function slotWidth(pageWidthPx: number, bandPx: number): number {
  return pageWidthPx + Math.max(0, bandPx);
}

/** 단일 열에서 쪽+띠를 뷰포트 가운데 둔 left — gap 아래로는 내려가지 않는다 */
export function singleColumnLeft(viewportWidth: number, pageWidthPx: number, bandPx: number, gap: number): number {
  return Math.max(gap, (viewportWidth - slotWidth(pageWidthPx, bandPx)) / 2);
}

export interface FitWidthWithBandInput {
  containerWidth: number;
  /** 쪽 폭 px (100% 기준) */
  pageWidth: number;
  columns: number;
  pageGap: number;
  /** 띠 폭 px (100% 기준) — 0 이면 띠 없음 */
  bandAt100: number;
}

/** 한 행(열 수 × (쪽+띠))이 창 폭 안에 들어오는 배율. 상·하한은 호출부가 clamp 한다. */
export function fitWidthZoomWithBand(input: FitWidthWithBandInput): number {
  const columns = Math.max(1, input.columns);
  const available = input.containerWidth - HORIZONTAL_FRAME_PADDING - input.pageGap * (columns - 1);
  return available / ((input.pageWidth + Math.max(0, input.bandAt100)) * columns);
}

/* ── 현재 띠 폭(100% 기준) — VirtualScroll 이 쓰고, 폭 맞춤 계산이 읽는다 ── */
let rightBandAt100 = 0;

/** 100% 배율에서의 띠 폭 px. 0 이면 띠 없음. */
export function setRightBandAt100(px: number): void {
  rightBandAt100 = Number.isFinite(px) && px > 0 ? px : 0;
}

export function getRightBandAt100(): number {
  return rightBandAt100;
}
