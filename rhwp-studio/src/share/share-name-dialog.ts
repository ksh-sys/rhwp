/**
 * 공유 문서를 열 때 한 번 묻는 이름 — 「편집 중」 표시와 버전 기록에 쓰인다.
 * 취소하면 null(호출부가 「익명」으로 대신한다).
 */
import { ModalDialog } from '@/ui/dialog';
import { t } from '../i18n/index.ts';

export class ShareNameDialog extends ModalDialog {
  private input!: HTMLInputElement;
  private readonly initial: string;
  private resolveFn: ((value: string | null) => void) | null = null;

  constructor(initial = '') {
    super(t('dialog.shareName.title'), 360);
    this.initial = initial;
  }

  protected createBody(): HTMLElement {
    const body = document.createElement('div');
    body.style.padding = '16px 20px';
    body.style.lineHeight = '1.6';
    const p = document.createElement('p');
    p.style.margin = '0 0 10px';
    p.textContent = t('dialog.shareName.body');
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.className = 'dialog-input';
    this.input.style.width = '100%';
    this.input.style.textAlign = 'left';
    this.input.style.boxSizing = 'border-box';
    this.input.maxLength = 40;
    this.input.placeholder = t('dialog.shareName.placeholder');
    this.input.value = this.initial;
    body.append(p, this.input);
    return body;
  }

  protected onConfirm(): boolean {
    this.finish(this.input.value.trim() || null);
    return true;
  }

  override hide(): void {
    this.finish(null);
    super.hide();
  }

  showAsync(): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolveFn = resolve;
      super.show();
      this.input.focus();
      this.input.select();
    });
  }

  private finish(value: string | null): void {
    const fn = this.resolveFn;
    this.resolveFn = null;
    fn?.(value);
  }
}
