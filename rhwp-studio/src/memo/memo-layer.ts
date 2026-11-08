/**
 * 메모 오버레이 — 쪽 오른쪽 여백 띠·풍선·안내선·본문 앵커 밑줄을 #scroll-content 위에 그린다.
 *
 * 좌표 계산은 memo-layout.ts(순수)가, 엔진 사각형 조회·DOM·이벤트는 여기가 맡는다.
 * SelectionRenderer 와 같은 레이어 방식(absolute, pointer-events none)이며 풍선만 입력을 받는다.
 * 풍선·밑줄의 mousedown 은 전파를 막는다 — InputHandler 가 #scroll-container 의 mousedown 으로
 * hitTest·캐럿 이동을 하기 때문이다.
 */
import type { WasmBridge } from '@/core/wasm-bridge';
import type { VirtualScroll } from '@/view/virtual-scroll';
import { userSettings } from '@/core/user-settings';
import { t } from '../i18n/index.ts';
import type { MemoStore } from './memo-store.ts';
import {
  BALLOON_INSET,
  computeMemoLayout,
  DEFAULT_BALLOON_HEIGHT,
  type AnchorRect,
  type MemoLayout,
  type PageBox,
} from './memo-layout.ts';
import { memoBandPx, type MemoEntry } from './memo-types.ts';

export interface MemoLayerOptions {
  getZoom(): number;
  getViewport(): { scrollX: number; scrollY: number; width: number; height: number };
  /** 풍선·밑줄 클릭 */
  onActivate(fieldId: number): void;
  /** 띠 폭이 바뀌어 쪽 배치를 다시 계산해야 할 때 */
  requestRelayout(): void;
  /** 풍선 본문 편집(Task 9 에서 연결). 없으면 읽기 전용 표시 */
  onEditText?: (entry: MemoEntry, text: string) => void;
  onDelete?: (entry: MemoEntry) => void;
}

const GAP = 6;

export class MemoLayer {
  private readonly layer: HTMLDivElement;
  private readonly svg: SVGSVGElement;
  private readonly bands = new Map<number, HTMLDivElement>();
  private readonly balloons = new Map<number, HTMLDivElement>();
  private anchorEls: HTMLDivElement[] = [];
  private lastBand100 = -1;
  private readonly container: HTMLElement;
  private readonly virtualScroll: VirtualScroll;
  private readonly store: MemoStore;
  private readonly wasm: WasmBridge;
  private readonly opts: MemoLayerOptions;

  constructor(
    container: HTMLElement,
    virtualScroll: VirtualScroll,
    store: MemoStore,
    wasm: WasmBridge,
    opts: MemoLayerOptions,
  ) {
    this.container = container;
    this.virtualScroll = virtualScroll;
    this.store = store;
    this.wasm = wasm;
    this.opts = opts;
    this.layer = document.createElement('div');
    this.layer.className = 'memo-layer';
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'memo-guides');
    this.layer.appendChild(this.svg);
    this.ensureAttached();
  }

  /** 설정·문서 상태를 읽어 전부 다시 그린다. */
  render(): void {
    this.ensureAttached();
    const scrollContent = this.container.querySelector<HTMLElement>('#scroll-content');
    if (!scrollContent) return;
    const review = userSettings.getReviewSettings();
    const entries = this.store.entries;
    const bandOn = review.showMemos && entries.length > 0;
    const band100 = bandOn ? memoBandPx(1) : 0;
    if (band100 !== this.lastBand100) {
      this.lastBand100 = band100;
      this.virtualScroll.setRightBandAt100(band100);
      // 쪽 배치가 바뀌어야 띠 자리가 생긴다 — 재배치 뒤 layout-refreshed/resize 경로로 다시 들어온다.
      this.opts.requestRelayout();
    }
    if (!bandOn) {
      this.clearDom();
      return;
    }

    const zoom = this.opts.getZoom();
    const vp = this.opts.getViewport();
    const contentWidth = scrollContent.clientWidth;
    const visible = this.virtualScroll.getVisiblePages(vp.scrollY, vp.height, vp.scrollX, vp.width);
    const pages: PageBox[] = visible.map((pageIndex) => ({
      pageIndex,
      left: this.virtualScroll.getPageLeftResolved(pageIndex, contentWidth),
      top: this.virtualScroll.getPageOffset(pageIndex),
      width: this.virtualScroll.getPageWidth(pageIndex),
      height: this.virtualScroll.getPageHeight(pageIndex),
    }));
    const visibleSet = new Set(visible);
    const anchors = new Map<number, AnchorRect[]>();
    for (const m of entries) {
      const rects = this.rectsFor(m).filter((r) => visibleSet.has(r.pageIndex));
      if (rects.length > 0) anchors.set(m.fieldId, rects);
    }

    // 1차: 풍선 DOM 을 먼저 만들고 최종 폭을 준 뒤 실제 높이를 재고, 2차: 그 높이로 적층한다.
    const bandPx = memoBandPx(zoom);
    this.syncBalloonDom(entries.filter((m) => anchors.has(m.fieldId)), Math.max(0, bandPx - BALLOON_INSET * 2));
    const heights = new Map<number, number>();
    for (const [id, el] of this.balloons) heights.set(id, el.offsetHeight || DEFAULT_BALLOON_HEIGHT);
    const layout = computeMemoLayout({
      entries,
      anchors,
      pages,
      zoom,
      bandPx,
      balloonHeights: heights,
      gap: GAP,
      showGuides: review.showMemoGuides,
    });
    this.applyLayout(layout);
  }

  setVisible(show: boolean): void {
    userSettings.updateReviewSettings({ showMemos: show });
    this.render();
  }

  setGuides(show: boolean): void {
    userSettings.updateReviewSettings({ showMemoGuides: show });
    this.render();
  }

  /** 풍선의 본문 편집 칸에 포커스를 준다(새 메모 직후). */
  focusBalloon(fieldId: number): void {
    const el = this.balloons.get(fieldId);
    const body = el?.querySelector<HTMLElement>('.memo-text');
    body?.focus();
  }

  dispose(): void {
    this.clearDom();
    this.layer.remove();
  }

  /* ── 엔진 사각형 ─────────────────────────────────────────── */

  private rectsFor(m: MemoEntry): AnchorRect[] {
    const loc = m.location;
    const s = m.startCharIdx;
    const e = m.endCharIdx;
    try {
      if (!loc.path || loc.path.length === 0) {
        return this.wasm.getSelectionRects(loc.sectionIndex, loc.paraIndex, s, loc.paraIndex, e);
      }
      if (loc.path.length === 1 && loc.path[0].type === 'cell') {
        const p = loc.path[0];
        return this.wasm.getSelectionRectsInCell(
          loc.sectionIndex, loc.paraIndex, p.controlIndex, p.cellIndex ?? 0, p.paraIndex, s, p.paraIndex, e,
        );
      }
      const path = JSON.stringify(
        loc.path.map((p) => ({ controlIdx: p.controlIndex, cellIdx: p.cellIndex ?? 0, cellParaIdx: p.paraIndex })),
      );
      const last = loc.path[loc.path.length - 1];
      return this.wasm.getSelectionRectsInCellByPath(
        loc.sectionIndex, loc.paraIndex, path, last.paraIndex, s, last.paraIndex, e,
      );
    } catch {
      return [];
    }
  }

  /* ── DOM ────────────────────────────────────────────────── */

  private ensureAttached(): void {
    if (this.layer.parentElement) return;
    const scrollContent = this.container.querySelector('#scroll-content');
    scrollContent?.appendChild(this.layer);
  }

  private clearDom(): void {
    for (const el of this.bands.values()) el.remove();
    this.bands.clear();
    for (const el of this.balloons.values()) el.remove();
    this.balloons.clear();
    for (const el of this.anchorEls) el.remove();
    this.anchorEls = [];
    this.svg.replaceChildren();
  }

  private syncBalloonDom(entries: readonly MemoEntry[], widthPx: number): void {
    const keep = new Set(entries.map((m) => m.fieldId));
    for (const [id, el] of this.balloons) {
      if (!keep.has(id)) {
        el.remove();
        this.balloons.delete(id);
      }
    }
    for (const m of entries) {
      let el = this.balloons.get(m.fieldId);
      if (!el) {
        el = this.createBalloon(m);
        this.balloons.set(m.fieldId, el);
        this.layer.appendChild(el);
      } else {
        this.updateBalloon(el, m);
      }
      el.style.width = `${widthPx}px`;
      el.classList.toggle('active', this.store.activeId === m.fieldId);
    }
  }

  private createBalloon(m: MemoEntry): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'memo-balloon';
    el.dataset.memoId = String(m.fieldId);
    el.addEventListener('mousedown', (ev) => {
      ev.stopPropagation();
      this.opts.onActivate(m.fieldId);
    });
    const head = document.createElement('div');
    head.className = 'memo-head';
    const author = document.createElement('span');
    author.className = 'memo-author';
    const when = document.createElement('span');
    when.className = 'memo-when';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'memo-close';
    close.title = t('command.review.memoDelete.label');
    close.textContent = '×';
    close.addEventListener('mousedown', (ev) => ev.stopPropagation());
    close.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const cur = this.store.byId(m.fieldId);
      if (cur) this.opts.onDelete?.(cur);
    });
    head.append(author, when, close);
    const body = document.createElement('div');
    body.className = 'memo-body';
    el.append(head, body);
    this.updateBalloon(el, m);
    return el;
  }

  private updateBalloon(el: HTMLDivElement, m: MemoEntry): void {
    el.querySelector('.memo-author')!.textContent = m.author;
    el.querySelector('.memo-when')!.textContent = formatWhen(m.createdAt);
    const body = el.querySelector<HTMLElement>('.memo-body')!;
    const close = el.querySelector<HTMLElement>('.memo-close')!;
    close.style.display = this.opts.onDelete ? '' : 'none';
    if (!m.readable) {
      body.replaceChildren();
      body.classList.add('memo-unreadable');
      body.textContent = t('memo.unreadableHwp.text');
      return;
    }
    body.classList.remove('memo-unreadable');
    if (this.opts.onEditText) {
      let ta = body.querySelector<HTMLTextAreaElement>('textarea.memo-text');
      if (!ta) {
        body.replaceChildren();
        ta = document.createElement('textarea');
        ta.className = 'memo-text';
        ta.rows = 2;
        ta.addEventListener('mousedown', (ev) => ev.stopPropagation());
        ta.addEventListener('keydown', (ev) => ev.stopPropagation());
        ta.addEventListener('input', () => this.autoGrow(ta!));
        ta.addEventListener('focus', () => this.opts.onActivate(m.fieldId));
        ta.addEventListener('blur', () => this.commitText(m.fieldId, ta!));
        body.appendChild(ta);
      }
      if (document.activeElement !== ta && ta.value !== m.text) ta.value = m.text;
      this.autoGrow(ta);
    } else {
      body.textContent = m.text;
    }
  }

  private commitText(fieldId: number, ta: HTMLTextAreaElement): void {
    const cur = this.store.byId(fieldId);
    if (!cur || !this.opts.onEditText) return;
    if (ta.value !== cur.text) this.opts.onEditText(cur, ta.value);
  }

  private autoGrow(ta: HTMLTextAreaElement): void {
    ta.style.height = 'auto';
    ta.style.height = `${Math.max(24, ta.scrollHeight)}px`;
  }

  private applyLayout(layout: MemoLayout): void {
    const seenBands = new Set<number>();
    for (const b of layout.bands) {
      seenBands.add(b.pageIndex);
      let el = this.bands.get(b.pageIndex);
      if (!el) {
        el = document.createElement('div');
        el.className = 'memo-band';
        el.dataset.memoPage = String(b.pageIndex);
        this.layer.insertBefore(el, this.svg);
        this.bands.set(b.pageIndex, el);
      }
      el.style.left = `${b.left}px`;
      el.style.top = `${b.top}px`;
      el.style.width = `${b.width}px`;
      el.style.height = `${b.height}px`;
    }
    for (const [idx, el] of this.bands) {
      if (!seenBands.has(idx)) {
        el.remove();
        this.bands.delete(idx);
      }
    }
    for (const b of layout.balloons) {
      const el = this.balloons.get(b.fieldId);
      if (!el) continue;
      el.style.left = `${b.left}px`;
      el.style.top = `${b.top}px`;
      el.style.width = `${b.width}px`;
    }
    // 앵커 밑줄 — 매번 새로 만든다(수가 적다)
    for (const el of this.anchorEls) el.remove();
    this.anchorEls = layout.anchors.map((a) => {
      const el = document.createElement('div');
      el.className = 'memo-anchor';
      el.classList.toggle('active', this.store.activeId === a.fieldId);
      el.style.left = `${a.left}px`;
      el.style.top = `${a.top + a.height - 2}px`;
      el.style.width = `${a.width}px`;
      el.addEventListener('mousedown', (ev) => {
        ev.stopPropagation();
        this.opts.onActivate(a.fieldId);
      });
      this.layer.appendChild(el);
      return el;
    });
    // 안내선
    this.svg.replaceChildren();
    for (const g of layout.guides) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(g.x1));
      line.setAttribute('y1', String(g.y1));
      line.setAttribute('x2', String(g.x2));
      line.setAttribute('y2', String(g.y2));
      if (this.store.activeId === g.fieldId) line.setAttribute('class', 'active');
      this.svg.appendChild(line);
    }
  }
}

/** ISO 8601 UTC → 로컬 `YYYY/MM/DD HH:mm`. 비어 있거나 못 읽으면 빈 문자열. */
export function formatWhen(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
