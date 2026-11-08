/**
 * .hwp 저장 전 메모 손실 경고 — 세 갈래: [HWPX로 저장](기본) / [그래도 .hwp로 저장] / 취소.
 * 기본 ModalDialog 의 확인 단추를 「HWPX로 저장」으로 쓰고, 본문에 「그래도 .hwp로 저장」을 둔다.
 */
import { ModalDialog } from './dialog';
import { t } from '../i18n/index.ts';

export type HwpMemoDecision = 'hwpx' | 'proceed' | 'cancel';

class MemoHwpWarningDialog extends ModalDialog {
  private readonly message: string;
  private resolveDecision!: (value: HwpMemoDecision) => void;
  private settled = false;

  constructor(message: string) {
    super(t('memo.hwpSaveWarning.title'), 420);
    this.message = message;
  }

  protected createBody(): HTMLElement {
    const body = document.createElement('div');
    body.style.padding = '16px 20px';
    body.style.lineHeight = '1.6';
    body.style.whiteSpace = 'pre-line';
    const text = document.createElement('div');
    text.textContent = this.message;
    const anyway = document.createElement('button');
    anyway.type = 'button';
    anyway.className = 'dialog-btn';
    anyway.style.marginTop = '12px';
    anyway.textContent = t('memo.hwpSaveWarning.saveAnyway');
    anyway.addEventListener('click', () => {
      this.settle('proceed');
      super.hide();
    });
    body.append(text, anyway);
    return body;
  }

  protected onConfirm(): void {
    this.settle('hwpx');
  }

  override hide(): void {
    this.settle('cancel');
    super.hide();
  }

  private settle(v: HwpMemoDecision): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveDecision(v);
  }

  showAsync(): Promise<HwpMemoDecision> {
    return new Promise((resolve) => {
      this.resolveDecision = resolve;
      super.show();
      const primary = this.dialog.querySelector<HTMLButtonElement>('.dialog-btn-primary');
      if (primary) primary.textContent = t('memo.hwpSaveWarning.saveHwpx');
    });
  }
}

/** 경고를 띄우고 사용자의 선택을 돌려준다. */
export function showMemoHwpWarning(message: string): Promise<HwpMemoDecision> {
  return new MemoHwpWarningDialog(message).showAsync();
}
