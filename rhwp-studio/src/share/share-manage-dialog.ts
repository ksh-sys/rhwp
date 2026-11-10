/**
 * 「파일 ▸ 공유 관리…」 — 링크 복사, 권한·만료 변경, 버전 기록·되돌리기, 공유 회수.
 * 관리키(만든 브라우저에 저장되거나 관리 링크로 연 경우)가 있어야 연다.
 */
import { ModalDialog } from '@/ui/dialog';
import { showConfirm } from '@/ui/confirm-dialog';
import { t } from '../i18n/index.ts';
import type { ShareMeta, ShareSettings, ShareVersion } from './provider';
import type { CopyResult } from './clipboard';
import { accessRadios, expiryPicker, linkRow } from './share-dialog';
import { displayNameOf } from './share-link';

export interface ShareManageDialogOptions {
  url: string;
  adminUrl: string;
  meta: ShareMeta;
  copy(text: string): Promise<CopyResult>;
  listVersions(): Promise<ShareVersion[]>;
  apply(settings: ShareSettings): Promise<void>;
  restore(version: number): Promise<void>;
  revoke(): Promise<void>;
}

function when(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export class ShareManageDialog extends ModalDialog {
  private readonly opts: ShareManageDialogOptions;
  private access!: ReturnType<typeof accessRadios>;
  private expiry!: ReturnType<typeof expiryPicker>;
  private message!: HTMLElement;
  private versions!: HTMLElement;

  constructor(opts: ShareManageDialogOptions) {
    super(t('dialog.shareManage.title'), 500);
    this.opts = opts;
  }

  protected createBody(): HTMLElement {
    const body = document.createElement('div');
    body.className = 'share-dialog';
    const name = document.createElement('div');
    name.className = 'share-file-name';
    name.textContent = this.opts.meta.name;

    const settings = document.createElement('div');
    settings.className = 'share-settings';
    const accessRow = document.createElement('div');
    accessRow.className = 'dialog-row';
    const al = document.createElement('span');
    al.className = 'dialog-label';
    al.textContent = t('dialog.share.access.label');
    this.access = accessRadios('share-manage-access', this.opts.meta.access);
    accessRow.append(al, this.access.el);
    const expiryRow = document.createElement('div');
    expiryRow.className = 'dialog-row';
    const el = document.createElement('span');
    el.className = 'dialog-label';
    el.textContent = t('dialog.share.expiry.label');
    this.expiry = expiryPicker(this.opts.meta.expiresAt);
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'dialog-btn';
    apply.textContent = t('dialog.shareManage.apply');
    apply.addEventListener('click', () => { void this.applySettings(apply); });
    expiryRow.append(el, this.expiry.el, apply);
    settings.append(accessRow, expiryRow);

    this.message = document.createElement('div');
    this.message.className = 'share-hint';

    const vTitle = document.createElement('div');
    vTitle.className = 'dialog-section-title';
    vTitle.textContent = t('dialog.shareManage.versions');
    this.versions = document.createElement('div');
    this.versions.className = 'share-versions';

    const revoke = document.createElement('button');
    revoke.type = 'button';
    revoke.className = 'dialog-btn share-danger';
    revoke.textContent = t('dialog.shareManage.revoke');
    revoke.addEventListener('click', () => { void this.revoke(); });

    body.append(
      name,
      linkRow(t('dialog.share.link.label'), this.opts.url, this.opts.copy),
      linkRow(t('dialog.shareManage.adminLink.label'), this.opts.adminUrl, this.opts.copy),
      settings,
      this.message,
      vTitle,
      this.versions,
      revoke,
    );
    return body;
  }

  override show(): void {
    super.show();
    const primary = this.dialog.querySelector<HTMLButtonElement>('.dialog-btn-primary');
    if (primary) primary.textContent = t('dialog.share.close');
    const cancel = this.dialog.querySelector<HTMLElement>('.dialog-footer .dialog-btn:not(.dialog-btn-primary)');
    if (cancel) cancel.hidden = true;
    void this.loadVersions();
  }

  protected onConfirm(): boolean {
    return true;
  }

  private say(text: string): void {
    this.message.textContent = text;
  }

  private async applySettings(btn: HTMLButtonElement): Promise<void> {
    const expiresAt = this.expiry.value(Date.now());
    if (expiresAt === 'invalid') {
      this.say(t('share.badDate.text'));
      return;
    }
    btn.disabled = true;
    try {
      await this.opts.apply({ access: this.access.value(), expiresAt });
      this.say(t('share.settingsSaved.text'));
    } catch (e) {
      this.say(t('share.actionFailed.text', { p1: e instanceof Error ? e.message : String(e) }));
    } finally {
      btn.disabled = false;
    }
  }

  private async loadVersions(): Promise<void> {
    let list: ShareVersion[];
    try {
      list = await this.opts.listVersions();
    } catch (e) {
      this.versions.textContent = t('share.actionFailed.text', { p1: e instanceof Error ? e.message : String(e) });
      return;
    }
    if (list.length === 0) {
      this.versions.textContent = t('dialog.shareManage.noVersions');
      return;
    }
    const latest = Math.max(...list.map((v) => v.version));
    const rows = list.map((v) => {
      const row = document.createElement('div');
      row.className = 'share-version-row';
      const text = document.createElement('span');
      text.textContent = `v${v.version} · ${when(v.createdAt)} · ${displayNameOf(v.by)}`;
      row.appendChild(text);
      if (v.version !== latest) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'dialog-btn';
        b.textContent = t('dialog.shareManage.restore');
        b.addEventListener('click', async () => {
          if (!(await showConfirm(t('dialog.shareManage.restore'), t('dialog.shareManage.restoreConfirm', { p1: v.version })))) return;
          b.disabled = true;
          try {
            await this.opts.restore(v.version);
            await this.loadVersions();
          } finally {
            b.disabled = false;
          }
        });
        row.appendChild(b);
      }
      return row;
    });
    this.versions.replaceChildren(...rows);
  }

  private async revoke(): Promise<void> {
    if (!(await showConfirm(t('dialog.shareManage.revoke'), t('dialog.shareManage.revokeConfirm')))) return;
    try {
      await this.opts.revoke();
      super.hide();
    } catch (e) {
      this.say(t('share.actionFailed.text', { p1: e instanceof Error ? e.message : String(e) }));
    }
  }
}
