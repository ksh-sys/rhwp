/**
 * 「파일 ▸ 링크로 공유…」 — 권한·만료를 고르고 공유 링크를 만든다.
 * 만들면 링크를 복사하고, 관리 링크(이 브라우저에도 저장됨)를 함께 보여 준다.
 */
import { ModalDialog } from '@/ui/dialog';
import { t } from '../i18n/index.ts';
import type { ShareAccess, ShareSettings } from './provider';
import { expiresAtFrom, type ExpiryChoice } from './share-expiry';
import type { CopyResult } from './clipboard';

export interface ShareLinkDialogOptions {
  fileName: string;
  create(settings: ShareSettings): Promise<{ url: string; adminUrl: string }>;
  copy(text: string): Promise<CopyResult>;
}

export function linkRow(label: string, value: string, copy: (text: string) => Promise<CopyResult>): HTMLElement {
  const row = document.createElement('div');
  row.className = 'share-link-row';
  const lab = document.createElement('div');
  lab.className = 'share-link-label';
  lab.textContent = label;
  const box = document.createElement('div');
  box.className = 'share-link-box';
  const input = document.createElement('input');
  input.type = 'text';
  input.readOnly = true;
  input.className = 'dialog-input share-link-input';
  input.value = value;
  input.addEventListener('focus', () => input.select());
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dialog-btn';
  btn.textContent = t('dialog.share.copy');
  const status = document.createElement('span');
  status.className = 'share-link-status';
  btn.addEventListener('click', async () => {
    const r = await copy(value);
    status.textContent = r === 'manual' ? t('share.copyManual.text') : t('share.linkCopied.text');
    if (r === 'manual') input.select();
  });
  box.append(input, btn);
  row.append(lab, box, status);
  return row;
}

export function accessRadios(name: string, initial: ShareAccess): { el: HTMLElement; value(): ShareAccess; setDisabled(d: boolean): void } {
  const wrap = document.createElement('div');
  wrap.className = 'share-radio-group';
  const radios: HTMLInputElement[] = [];
  for (const [val, key] of [['edit', 'dialog.share.access.edit'], ['view', 'dialog.share.access.view']] as const) {
    const label = document.createElement('label');
    label.className = 'dialog-checkbox';
    const r = document.createElement('input');
    r.type = 'radio';
    r.name = name;
    r.value = val;
    r.checked = val === initial;
    radios.push(r);
    label.append(r, document.createTextNode(` ${t(key)}`));
    wrap.appendChild(label);
  }
  return {
    el: wrap,
    value: () => (radios.find((r) => r.checked)?.value === 'view' ? 'view' : 'edit'),
    setDisabled: (d) => radios.forEach((r) => { r.disabled = d; }),
  };
}

export function expiryPicker(initialAt: number | null): { el: HTMLElement; value(now: number): number | null | 'invalid'; setDisabled(d: boolean): void } {
  const wrap = document.createElement('div');
  wrap.className = 'share-expiry';
  const select = document.createElement('select');
  select.className = 'dialog-select';
  for (const [val, key] of [['none', 'dialog.share.expiry.none'], ['7d', 'dialog.share.expiry.7d'], ['30d', 'dialog.share.expiry.30d'], ['date', 'dialog.share.expiry.date']] as const) {
    const o = document.createElement('option');
    o.value = val;
    o.textContent = t(key);
    select.appendChild(o);
  }
  const date = document.createElement('input');
  date.type = 'date';
  date.className = 'dialog-input share-expiry-date';
  if (initialAt != null) {
    const d = new Date(initialAt);
    select.value = 'date';
    date.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const sync = () => { date.hidden = select.value !== 'date'; };
  select.addEventListener('change', sync);
  sync();
  wrap.append(select, date);
  return {
    el: wrap,
    value: (now) => {
      const choice = select.value as ExpiryChoice;
      const at = expiresAtFrom(choice, now, date.value);
      if (choice === 'date' && (at == null || at <= now)) return 'invalid';
      return at;
    },
    setDisabled: (d) => { select.disabled = d; date.disabled = d; },
  };
}

export class ShareLinkDialog extends ModalDialog {
  private readonly opts: ShareLinkDialogOptions;
  private access!: ReturnType<typeof accessRadios>;
  private expiry!: ReturnType<typeof expiryPicker>;
  private result!: HTMLElement;
  private error!: HTMLElement;
  private done = false;
  private busy = false;

  constructor(opts: ShareLinkDialogOptions) {
    super(t('dialog.share.title'), 460);
    this.opts = opts;
  }

  protected createBody(): HTMLElement {
    const body = document.createElement('div');
    body.className = 'share-dialog';
    const name = document.createElement('div');
    name.className = 'share-file-name';
    name.textContent = this.opts.fileName;

    const accessRow = document.createElement('div');
    accessRow.className = 'dialog-row';
    const accessLabel = document.createElement('span');
    accessLabel.className = 'dialog-label';
    accessLabel.textContent = t('dialog.share.access.label');
    this.access = accessRadios('share-access', 'edit');
    accessRow.append(accessLabel, this.access.el);

    const expiryRow = document.createElement('div');
    expiryRow.className = 'dialog-row';
    const expiryLabel = document.createElement('span');
    expiryLabel.className = 'dialog-label';
    expiryLabel.textContent = t('dialog.share.expiry.label');
    this.expiry = expiryPicker(null);
    expiryRow.append(expiryLabel, this.expiry.el);

    this.error = document.createElement('div');
    this.error.className = 'share-error';
    this.error.hidden = true;

    this.result = document.createElement('div');
    this.result.className = 'share-result';
    this.result.hidden = true;

    body.append(name, accessRow, expiryRow, this.error, this.result);
    return body;
  }

  override show(): void {
    super.show();
    this.primary()!.textContent = t('dialog.share.create');
  }

  protected onConfirm(): boolean {
    if (this.done) return true;
    if (!this.busy) void this.create();
    return false;
  }

  private primary(): HTMLButtonElement | null {
    return this.dialog.querySelector('.dialog-btn-primary');
  }

  private async create(): Promise<void> {
    const expiresAt = this.expiry.value(Date.now());
    if (expiresAt === 'invalid') {
      this.showError(t('share.badDate.text'));
      return;
    }
    this.busy = true;
    this.error.hidden = true;
    const btn = this.primary();
    if (btn) { btn.disabled = true; btn.textContent = t('dialog.share.creating'); }
    try {
      const { url, adminUrl } = await this.opts.create({ access: this.access.value(), expiresAt });
      this.done = true;
      this.access.setDisabled(true);
      this.expiry.setDisabled(true);
      const hint = document.createElement('p');
      hint.className = 'share-hint';
      hint.textContent = t('dialog.share.adminHint');
      this.result.replaceChildren(
        linkRow(t('dialog.share.link.label'), url, this.opts.copy),
        hint,
        linkRow(t('dialog.shareManage.adminLink.label'), adminUrl, this.opts.copy),
      );
      this.result.hidden = false;
      const first = this.result.querySelector<HTMLButtonElement>('.share-link-row .dialog-btn');
      first?.click(); // 만들자마자 공유 링크를 복사
      if (btn) { btn.disabled = false; btn.textContent = t('dialog.share.close'); }
      const cancel = this.dialog.querySelector<HTMLElement>('.dialog-footer .dialog-btn:not(.dialog-btn-primary)');
      if (cancel) cancel.hidden = true;
    } catch (e) {
      this.showError(t('share.actionFailed.text', { p1: e instanceof Error ? e.message : String(e) }));
      if (btn) { btn.disabled = false; btn.textContent = t('dialog.share.create'); }
    } finally {
      this.busy = false;
    }
  }

  private showError(text: string): void {
    this.error.textContent = text;
    this.error.hidden = false;
  }
}
