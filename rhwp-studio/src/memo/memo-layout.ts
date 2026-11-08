/**
 * 메모 오버레이의 좌표 계산 — 순수 함수. DOM·wasm 은 memo-layer.ts 가 맡는다.
 *
 * 입력 좌표계: `pages` 는 #scroll-content 기준 쪽 상자(px, 배율 적용),
 * `anchors` 는 엔진 `getSelectionRects*` 결과(쪽 기준 px, 배율 미적용 — 96dpi).
 * 출력은 모두 #scroll-content 기준 px.
 */
import { stackBalloons, stackedBottom } from './memo-stack.ts';
import type { MemoEntry } from './memo-types.ts';

export interface PageBox {
  pageIndex: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface AnchorRect {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MemoLayoutInput {
  entries: readonly MemoEntry[];
  /** fieldId → 앵커 사각형들(줄마다 하나). 없으면 그 메모는 그리지 않는다. */
  anchors: ReadonlyMap<number, readonly AnchorRect[]>;
  /** 그릴 쪽들(보이는 쪽) */
  pages: readonly PageBox[];
  zoom: number;
  /** 띠 폭 px (배율 적용) */
  bandPx: number;
  /** fieldId → 풍선 높이 px (DOM 에서 잰 값, 없으면 기본 높이) */
  balloonHeights: ReadonlyMap<number, number>;
  gap: number;
  showGuides: boolean;
}

export interface BandBox {
  pageIndex: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface BalloonBox {
  fieldId: number;
  pageIndex: number;
  left: number;
  top: number;
  width: number;
}

export interface AnchorBox {
  fieldId: number;
  pageIndex: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface GuideLine {
  fieldId: number;
  pageIndex: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface MemoLayout {
  bands: BandBox[];
  balloons: BalloonBox[];
  anchors: AnchorBox[];
  guides: GuideLine[];
}

/** 풍선 좌우 여백 px */
export const BALLOON_INSET = 8;
/** DOM 높이를 아직 모를 때의 풍선 높이 */
export const DEFAULT_BALLOON_HEIGHT = 56;

export function computeMemoLayout(input: MemoLayoutInput): MemoLayout {
  const { zoom, bandPx, gap } = input;
  const pageByIndex = new Map(input.pages.map((p) => [p.pageIndex, p]));
  const anchors: AnchorBox[] = [];
  const guides: GuideLine[] = [];
  const balloons: BalloonBox[] = [];
  const perPage = new Map<number, { id: number; anchorTop: number; height: number; first: AnchorRect; page: PageBox }[]>();

  for (const m of input.entries) {
    const rects = input.anchors.get(m.fieldId);
    if (!rects || rects.length === 0) continue;
    const first = rects[0];
    const page = pageByIndex.get(first.pageIndex);
    if (!page) continue;
    for (const r of rects) {
      const p = pageByIndex.get(r.pageIndex);
      if (!p) continue;
      anchors.push({
        fieldId: m.fieldId,
        pageIndex: r.pageIndex,
        left: p.left + r.x * zoom,
        top: p.top + r.y * zoom,
        width: r.width * zoom,
        height: r.height * zoom,
      });
    }
    const list = perPage.get(first.pageIndex) ?? [];
    list.push({
      id: m.fieldId,
      anchorTop: page.top + first.y * zoom,
      height: input.balloonHeights.get(m.fieldId) ?? DEFAULT_BALLOON_HEIGHT,
      first,
      page,
    });
    perPage.set(first.pageIndex, list);
  }

  const bands: BandBox[] = input.pages.map((page) => {
    const items = perPage.get(page.pageIndex) ?? [];
    const tops = stackBalloons(items, gap);
    const bandLeft = page.left + page.width;
    for (const it of items) {
      const top = tops.get(it.id) ?? it.anchorTop;
      balloons.push({
        fieldId: it.id,
        pageIndex: page.pageIndex,
        left: bandLeft + BALLOON_INSET,
        top,
        width: Math.max(0, bandPx - BALLOON_INSET * 2),
      });
      if (input.showGuides) {
        guides.push({
          fieldId: it.id,
          pageIndex: page.pageIndex,
          x1: page.left + (it.first.x + it.first.width) * zoom,
          y1: page.top + (it.first.y + it.first.height / 2) * zoom,
          x2: bandLeft + BALLOON_INSET,
          y2: top + it.height / 2,
        });
      }
    }
    const bottom = stackedBottom(tops, items);
    const height = Math.max(page.height, bottom > 0 ? bottom - page.top + gap : 0);
    return { pageIndex: page.pageIndex, left: bandLeft, top: page.top, width: bandPx, height };
  });

  return { bands, balloons, anchors, guides };
}
