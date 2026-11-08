/**
 * 메모 내용 보기 창 — 편집 영역 아래 고정 높이 목록(쪽 · 작성자 · 시각 · 내용 첫 줄).
 * 행 클릭 → onSelect(해당 메모로 이동·활성화). 표시 여부는 review 설정 showMemoList.
 */
import { userSettings } from '@/core/user-settings';
import { t } from '../i18n/index.ts';
import { formatWhen } from './memo-layer.ts';
import { memoPaneRows } from './memo-pane-rows.ts';
import type { MemoStore } from './memo-store.ts';
import type { MemoEntry } from './memo-types.ts';

export interface MemoPaneOptions {
  /** 1 기반 쪽 번호(모르면 0) */
  pageOf(entry: MemoEntry): number;
  onSelect(entry: MemoEntry): void;
}

export class MemoPane {
  private readonly host: HTMLElement;
  private readonly store: MemoStore;
  private readonly opts: MemoPaneOptions;
  private readonly list: HTMLDivElement;

  constructor(host: HTMLElement, store: MemoStore, opts: MemoPaneOptions) {
    this.host = host;
    this.store = store;
    this.opts = opts;
    this.host.classList.add('memo-pane');
    const head = document.createElement('div');
    head.className = 'memo-pane-head';
    const title = document.createElement('span');
    title.className = 'memo-pane-title';
    title.textContent = t('command.review.memoList.label');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'memo-pane-close';
    close.textContent = '×';
    close.addEventListener('click', () => {
      userSettings.updateReviewSettings({ showMemoList: false });
      document.querySelectorAll('[data-cmd="review:memo-list"]').forEach((el) => el.classList.remove('active'));
      this.setVisible(false);
    });
    head.append(title, close);
    this.list = document.createElement('div');
    this.list.className = 'memo-pane-list';
    this.host.replaceChildren(head, this.list);
    this.setVisible(userSettings.getReviewSettings().showMemoList);
  }

  setVisible(show: boolean): void {
    this.host.style.display = show ? '' : 'none';
    if (show) this.render();
  }

  render(): void {
    if (this.host.style.display === 'none') return;
    const rows = memoPaneRows(this.store.entries, this.opts.pageOf, formatWhen);
    this.list.replaceChildren();
    if (rows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'memo-pane-empty';
      empty.textContent = t('memo.pane.empty.text');
      this.list.appendChild(empty);
      return;
    }
    const active = this.store.activeId;
    for (const r of rows) {
      const row = document.createElement('div');
      row.className = 'memo-pane-row';
      row.classList.toggle('active', r.fieldId === active);
      row.dataset.memoId = String(r.fieldId);
      const cell = (cls: string, text: string) => {
        const c = document.createElement('span');
        c.className = `memo-pane-cell ${cls}`;
        c.textContent = text;
        return c;
      };
      row.append(
        cell('memo-pane-page', r.page > 0 ? String(r.page) : '–'),
        cell('memo-pane-author', r.author),
        cell('memo-pane-when', r.when),
        cell('memo-pane-excerpt', r.excerpt),
      );
      row.addEventListener('click', () => {
        const entry = this.store.byId(r.fieldId);
        if (entry) this.opts.onSelect(entry);
      });
      this.list.appendChild(row);
    }
  }
}
