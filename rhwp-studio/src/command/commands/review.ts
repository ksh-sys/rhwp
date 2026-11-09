/**
 * 검토 ▸ 메모 명령 — 넣기·지우기·이전·다음·표시 토글 3종.
 * 문서 변경은 InputHandler(input-handler-memo.ts)의 snapshot 경로로만 간다.
 */
import type { CommandDef, CommandServices } from '../types';
import { userSettings, type ReviewSettings } from '@/core/user-settings';
import { getMemoServices } from '@/memo/memo-services';
import type { MemoEntry } from '@/memo/memo-types';
import { showToast } from '@/ui/toast';
import { openOptionsDialog } from '@/ui/options-dialog';
import { t } from '../../i18n/index.ts';

/** 상태줄 한 줄 알림 — 잠시 보여 주고 원래 문구로 되돌린다(main 의 autosave 알림과 같은 방식). */
function statusNotice(message: string, ms = 4000): void {
  const el = document.getElementById('sb-message');
  if (!el) return;
  const prev = el.textContent;
  el.textContent = message;
  window.setTimeout(() => {
    if (el.textContent === message) el.textContent = prev;
  }, ms);
}

export { nowIsoSeconds } from '@/memo/memo-time';
import { nowIsoSeconds } from '@/memo/memo-time';

/** 메모 표시·안내선·내용 보기 체크 상태를 메뉴·리본에 반영한다(시작 시·토글 뒤). */
export function syncMemoMenu(): void {
  const r = userSettings.getReviewSettings();
  const pairs: Array<[string, boolean]> = [
    ['review:memo-show', r.showMemos],
    ['review:memo-guide', r.showMemoGuides],
    ['review:memo-list', r.showMemoList],
  ];
  for (const [cmd, on] of pairs) {
    document.querySelectorAll(`[data-cmd="${cmd}"]`).forEach((el) => el.classList.toggle('active', on));
  }
}

function toggleReview(services: CommandServices, key: keyof ReviewSettings): void {
  const cur = userSettings.getReviewSettings();
  userSettings.updateReviewSettings({ [key]: !cur[key] } as Partial<ReviewSettings>);
  syncMemoMenu();
  services.eventBus.emit('memo-settings-changed');
}

/** 메모의 앵커가 있는 쪽으로 이동하고 활성화한다. */
function revealMemo(services: CommandServices, entry: MemoEntry): void {
  const svc = getMemoServices();
  if (!svc) return;
  try {
    const loc = entry.location;
    let rects: Array<{ pageIndex: number }> = [];
    if (!loc.path || loc.path.length === 0) {
      rects = services.wasm.getSelectionRects(loc.sectionIndex, loc.paraIndex, entry.startCharIdx, loc.paraIndex, entry.endCharIdx);
    } else if (loc.path.length === 1 && loc.path[0].type === 'cell') {
      const p = loc.path[0];
      rects = services.wasm.getSelectionRectsInCell(
        loc.sectionIndex, loc.paraIndex, p.controlIndex, p.cellIndex ?? 0, p.paraIndex, entry.startCharIdx, p.paraIndex, entry.endCharIdx,
      );
    }
    if (rects[0]) services.gotoPage(rects[0].pageIndex); // 0 기반(CanvasView.gotoPage)
  } catch {
    /* 쪽을 못 찾아도 활성화는 한다 */
  }
  svc.store.setActive(entry.fieldId);
  services.eventBus.emit('memo-activate', entry.fieldId);
}

const hasMemos = () => (getMemoServices()?.store.entries.length ?? 0) > 0;

export const reviewCommands: CommandDef[] = [
  {
    id: 'review:memo-insert',
    label: t('command.review.memoInsert.label'),
    icon: 'icon-memo-insert',
    shortcutLabel: 'Ctrl+M,C',
    canExecute: (ctx) => ctx.hasDocument && ctx.isEditable && !ctx.isFormMode && !ctx.inCellSelectionMode
      && !ctx.inPictureObjectSelection && !ctx.inTableObjectSelection,
    execute(services) {
      const ih = services.getInputHandler();
      if (!ih) return;
      const userName = userSettings.getReviewSettings().userName.trim();
      if (!userName) {
        showToast({
          message: t('memo.needUserName.text'),
          action: { label: t('memo.openOptions.text'), onClick: () => openOptionsDialog(services.eventBus) },
        });
        return;
      }
      const result = ih.insertMemoAtSelection(userName, nowIsoSeconds());
      if (!result.ok) {
        if (result.reason === 'overlap') showToast({ message: t('memo.overlapsField.text') });
        else if (result.reason === 'no-range') statusNotice(t('memo.noRange.text'));
        else showToast({ message: typeof result.reason === 'string' && result.reason.length > 12 ? result.reason : t('memo.cannotInsert.text') });
        return;
      }
      if (result.clamped) statusNotice(t('memo.clampedToFirstParagraph.text'));
      getMemoServices()?.store.refresh();
      getMemoServices()?.store.setActive(result.fieldId);
      services.eventBus.emit('memo-activate', result.fieldId);
    },
  },
  {
    id: 'review:memo-delete',
    label: t('command.review.memoDelete.label'),
    icon: 'icon-memo-delete',
    canExecute: (ctx) => ctx.hasDocument && ctx.isEditable && !ctx.isFormMode && getMemoServices()?.store.activeId != null,
    execute(services) {
      const ih = services.getInputHandler();
      const svc = getMemoServices();
      const entry = svc?.store.activeEntry;
      if (!ih || !entry) return;
      ih.removeMemo(entry);
      svc!.store.refresh();
    },
  },
  {
    id: 'review:memo-prev',
    label: t('command.review.memoPrev.label'),
    icon: 'icon-chevron-left',
    canExecute: (ctx) => ctx.hasDocument && hasMemos(),
    execute(services) {
      const svc = getMemoServices();
      const next = svc?.store.neighbor(svc.store.activeId, -1);
      if (next) revealMemo(services, next);
    },
  },
  {
    id: 'review:memo-next',
    label: t('command.review.memoNext.label'),
    icon: 'icon-chevron-right',
    canExecute: (ctx) => ctx.hasDocument && hasMemos(),
    execute(services) {
      const svc = getMemoServices();
      const next = svc?.store.neighbor(svc.store.activeId, 1);
      if (next) revealMemo(services, next);
    },
  },
  {
    id: 'review:memo-show',
    label: t('command.review.memoShow.label'),
    canExecute: (ctx) => ctx.hasDocument,
    execute: (services) => toggleReview(services, 'showMemos'),
  },
  {
    id: 'review:memo-guide',
    label: t('command.review.memoGuide.label'),
    canExecute: (ctx) => ctx.hasDocument,
    execute: (services) => toggleReview(services, 'showMemoGuides'),
  },
  {
    id: 'review:memo-list',
    label: t('command.review.memoList.label'),
    canExecute: (ctx) => ctx.hasDocument,
    execute: (services) => toggleReview(services, 'showMemoList'),
  },
];
