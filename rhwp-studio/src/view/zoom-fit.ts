import { fitWidthZoomWithBand } from './page-band.ts';
import {
  MAX_DOCUMENT_ZOOM,
  MIN_DOCUMENT_ZOOM,
  normalizePageArrangement,
  type PageArrangement,
} from './page-arrangement.ts';

const HORIZONTAL_FRAME_PADDING = 40;
const VERTICAL_FRAME_PADDING = 20;
const DEFAULT_PAGE_GAP = 10;

function clampRequestedZoom(zoom: number): number {
  return Math.max(MIN_DOCUMENT_ZOOM, Math.min(MAX_DOCUMENT_ZOOM, zoom));
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function normalizePageGap(pageGap: number | undefined): number {
  return Number.isFinite(pageGap)
    ? Math.max(0, pageGap ?? 0)
    : DEFAULT_PAGE_GAP;
}

function pageGridForArrangement(
  arrangement: PageArrangement,
): { columns: number; rows: number } {
  const normalized = normalizePageArrangement(arrangement);
  switch (normalized.kind) {
    case 'double':
    case 'facing':
      return { columns: 2, rows: 1 };
    case 'multiple':
      return { columns: normalized.columns, rows: normalized.rows };
    case 'auto':
    case 'single':
      return { columns: 1, rows: 1 };
  }
}

export function calculateFitWidthZoom(
  containerWidth: number,
  pageWidth: number,
): number {
  return calculateArrangementFitWidthZoom({
    containerWidth,
    pageWidth,
    arrangement: { kind: 'auto' },
  });
}

export interface ArrangementFitWidthInput {
  containerWidth: number;
  pageWidth: number;
  arrangement: PageArrangement;
  pageGap?: number;
  /** 쪽 오른쪽 띠(메모) 폭 px, 100% 기준 — 배율에 비례하므로 쪽 폭에 더해 나눈다 */
  rightBandAt100?: number;
}

/** 현재 쪽 배치의 한 행 전체가 문서 창 너비 안에 들어오도록 배율을 계산한다. */
export function calculateArrangementFitWidthZoom(
  input: ArrangementFitWidthInput,
): number {
  if (
    !isPositiveFinite(input.containerWidth)
    || !isPositiveFinite(input.pageWidth)
  ) return 1;
  const { columns } = pageGridForArrangement(input.arrangement);
  const pageGap = normalizePageGap(input.pageGap);
  return clampRequestedZoom(fitWidthZoomWithBand({
    containerWidth: input.containerWidth,
    pageWidth: input.pageWidth,
    columns,
    pageGap,
    bandAt100: input.rightBandAt100 ?? 0,
  }));
}

export interface ArrangementFitPageInput extends ArrangementFitWidthInput {
  containerHeight: number;
  pageHeight: number;
}

/** 현재 쪽 배치의 가로×세로 블록 전체가 문서 창 안에 들어오도록 배율을 계산한다. */
export function calculateArrangementFitPageZoom(
  input: ArrangementFitPageInput,
): number {
  if (
    !isPositiveFinite(input.containerWidth)
    || !isPositiveFinite(input.containerHeight)
    || !isPositiveFinite(input.pageWidth)
    || !isPositiveFinite(input.pageHeight)
  ) return 1;

  const { columns, rows } = pageGridForArrangement(input.arrangement);
  const pageGap = normalizePageGap(input.pageGap);
  const availableWidth = input.containerWidth
    - HORIZONTAL_FRAME_PADDING
    - pageGap * (columns - 1);
  const availableHeight = input.containerHeight
    - VERTICAL_FRAME_PADDING
    - pageGap * (rows - 1);
  return clampRequestedZoom(Math.min(
    availableWidth / (input.pageWidth * columns),
    availableHeight / (input.pageHeight * rows),
  ));
}

export function calculateFitPageZoom(
  containerWidth: number,
  containerHeight: number,
  pageWidth: number,
  pageHeight: number,
): number {
  return calculateArrangementFitPageZoom({
    containerWidth,
    containerHeight,
    pageWidth,
    pageHeight,
    arrangement: { kind: 'auto' },
  });
}

/** 사용자가 마지막으로 고른 맞춤 배율. 'none' 은 수치 배율(사용자 지정)이다. */
export type ZoomFitMode = 'none' | 'fitWidth' | 'fitPage';

export function normalizeZoomFitMode(value: unknown): ZoomFitMode {
  return value === 'fitWidth' || value === 'fitPage' ? value : 'none';
}

export interface ZoomFitMetrics {
  containerWidth: number;
  containerHeight: number;
  pageWidth: number;
  pageHeight: number;
  arrangement: PageArrangement;
  pageGap?: number;
  rightBandAt100?: number;
}

/**
 * 저장된 맞춤 배율을 지금의 창·쪽 크기로 다시 계산한다.
 *
 * 맞춤은 수치가 아니라 규칙이므로 문서마다(쪽 크기가 다르므로) 다시 계산해야 한다.
 * 수치 배율('none')이면 되돌릴 배율이 없다는 뜻으로 null 을 준다.
 */
export function resolveZoomFitZoom(
  mode: ZoomFitMode,
  metrics: ZoomFitMetrics,
): number | null {
  switch (mode) {
    case 'fitWidth':
      return calculateArrangementFitWidthZoom({
        containerWidth: metrics.containerWidth,
        pageWidth: metrics.pageWidth,
        arrangement: metrics.arrangement,
        pageGap: metrics.pageGap,
        rightBandAt100: metrics.rightBandAt100,
      });
    case 'fitPage':
      return calculateArrangementFitPageZoom(metrics);
    case 'none':
      return null;
  }
}
