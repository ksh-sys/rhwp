/**
 * 공유 런타임 — 세션 상태 기계(share-session)와 편집기(main)를 잇는다.
 *
 * - `?share=<토큰>` 으로 열기, 「보기 전용」 모드 전환, 띠(배너)·끝난 공유 화면
 * - 남이 저장한 새 버전 자동 다시 열기, 사용자 입력 → 심장박동 판단, dirty 전달
 * - 다른 문서를 열거나 새 문서를 만들면 공유 세션을 떠난다
 */
import type { EventBus } from '@/core/event-bus';
import type { EditorEditMode } from '@/command/types';
import { userSettings } from '@/core/user-settings';
import { showToast } from '@/ui/toast';
import { t } from '../i18n/index.ts';
import type { ShareMeta, ShareProvider, ShareSettings } from './provider';
import { ShareSession, type SessionState } from './share-session';
import { ADMIN_KEY_STORAGE_PREFIX, buildAdminUrl, buildShareUrl, lockOwnerId, parseShareLocation } from './share-link';
import { bannerModel, chipModel, type BannerActionKind } from './share-banner';
import { browserClipboardEnv, copyText } from './clipboard';
import { ShareNameDialog } from './share-name-dialog';

const NAME_KEY = 'rhwp-share-name';
const CLIENT_KEY = 'rhwp-share-client';
const BANNER_REFRESH_MS = 30_000;

export interface ShareRuntimeDeps {
  providerPromise: Promise<ShareProvider | null>;
  eventBus: EventBus;
  /** 공유본 바이트를 현재 문서로 연다(최근 문서에 남기지 않음) */
  loadBytes(bytes: Uint8Array, name: string): Promise<void>;
  setEditMode(mode: EditorEditMode): void;
  getEditMode(): EditorEditMode;
  isDirty(): boolean;
  dispatch(commandId: string): boolean;
  setStatus(text: string): void;
  /** 공유본이 곧 최신본이 됐다(만들기 직후) — 로컬 저장 안내가 뜨지 않게 */
  markClean(reason: string): void;
}

function safeGet(store: Storage | undefined, key: string): string | null {
  try { return store?.getItem(key) ?? null; } catch { return null; }
}
function safeSet(store: Storage | undefined, key: string, value: string): void {
  try { store?.setItem(key, value); } catch { /* 사생활 보호 모드 등 */ }
}

function tabClientId(): string {
  let id = safeGet(globalThis.sessionStorage, CLIENT_KEY);
  if (!id) {
    const b = new Uint8Array(3);
    crypto.getRandomValues(b);
    id = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    safeSet(globalThis.sessionStorage, CLIENT_KEY, id);
  }
  return id;
}

export class ShareRuntime {
  /** 끝난 공유 안내를 띄웠다 — main 이 빈 문서를 만들지 않는다 */
  goneShown = false;
  session: ShareSession | null = null;
  provider: ShareProvider | null = null;
  private readonly deps: ShareRuntimeDeps;
  private loadingShare = false;
  private viewModeByShare = false;
  private bannerTimer: number | null = null;
  private providerLoaded = false;

  constructor(deps: ShareRuntimeDeps) {
    this.deps = deps;
    deps.eventBus.on('document-dirty-changed', () => this.session?.setDirty(this.deps.isDirty()));
    deps.eventBus.on('document-swapped', () => {
      if (!this.loadingShare && this.session) void this.leave();
    });
    const activity = () => this.session?.noteActivity();
    for (const type of ['keydown', 'pointerdown', 'wheel'] as const) {
      document.addEventListener(type, activity, { capture: true, passive: true });
    }
    void deps.providerPromise.then((p) => {
      this.provider = p;
      this.providerLoaded = true;
      this.syncShareUi();
      deps.eventBus.emit('command-state-changed');
    });
    document.getElementById('sb-share')?.addEventListener('click', () => {
      const st = this.session?.state;
      const manageable = (st?.kind === 'open' || st?.kind === 'conflict') && !!st.adminKey;
      if (manageable) this.deps.dispatch('file:share-manage');
      else void this.copyLink();
    });
    window.addEventListener('pagehide', () => {
      const s = this.session?.state;
      if (s?.kind === 'open' && s.lockHeld) void this.provider?.unlock(s.token, s.by).catch(() => {});
    });
  }

  async getProvider(): Promise<ShareProvider | null> {
    if (!this.providerLoaded) {
      this.provider = await this.deps.providerPromise;
      this.providerLoaded = true;
    }
    return this.provider;
  }

  /** 공유 제공자가 있다(메뉴·명령 표시) */
  get available(): boolean {
    return !!this.provider;
  }

  /** 편집기 주소(쿼리·해시 없는 디렉터리) — 공유 링크의 바탕 */
  private shareBase(): string {
    return new URL('.', location.href).href;
  }

  shareUrl(token: string): string {
    return buildShareUrl(this.shareBase(), token);
  }

  adminUrl(token: string, adminKey: string): string {
    return buildAdminUrl(this.shareBase(), token, adminKey);
  }

  /** 지금 공유 링크를 클립보드에 복사하고 결과를 알린다 */
  async copyLink(): Promise<void> {
    const st = this.session?.state;
    if (!st || (st.kind !== 'open' && st.kind !== 'conflict')) return;
    const url = this.shareUrl(st.token);
    const r = await copyText(url, browserClipboardEnv());
    showToast({ message: r === 'manual' ? `${t('share.copyManual.text')}\n${url}` : t('share.linkCopied.text') });
  }

  /**
   * 지금 문서로 공유를 만든다 — 공유본 v1 업로드, 관리키 저장, 세션 시작(문서는 다시 열지 않음),
   * 주소창을 공유 링크로 바꿔 새로고침해도 공유본이 열리게 한다.
   */
  async createFromCurrentDocument(bytes: Uint8Array, name: string, settings: ShareSettings): Promise<{ token: string; adminKey: string; url: string; adminUrl: string }> {
    const provider = await this.getProvider();
    if (!provider) throw new Error(t('share.noProvider.text'));
    const { token, adminKey } = await provider.create(bytes, name, settings);
    safeSet(globalThis.localStorage, ADMIN_KEY_STORAGE_PREFIX + token, adminKey);
    await this.openSession(token, adminKey, false);
    this.deps.markClean('share-create');
    const u = new URL(location.href);
    u.searchParams.set('share', token);
    u.hash = '';
    history.replaceState(history.state, '', u.href);
    return { token, adminKey, url: this.shareUrl(token), adminUrl: this.adminUrl(token, adminKey) };
  }

  async updateSettings(settings: Partial<ShareSettings>): Promise<void> {
    const st = this.session?.state;
    if (!this.provider || !st || (st.kind !== 'open' && st.kind !== 'conflict') || !st.adminKey) throw new Error(t('share.manage.noAdminKey.text'));
    await this.provider.updateSettings(st.token, st.adminKey, settings);
  }

  /** 예전 버전을 공유본 새 버전으로 되돌린다(내가 편집자일 때만) */
  async restoreVersion(version: number): Promise<void> {
    const session = this.session;
    const st = session?.state;
    if (!session || !this.provider || st?.kind !== 'open' || st.role !== 'editor' || !st.lockHeld) {
      showToast({ message: t('share.restoreBlocked.text') });
      return;
    }
    const bytes = await this.provider.openVersion(st.token, version);
    const r = await session.save(bytes);
    const after = session.state;
    if (r !== 'saved' || after.kind !== 'open') {
      showToast({ message: t('share.actionFailed.text', { p1: r }) });
      return;
    }
    await this.withShareLoad(() => this.deps.loadBytes(bytes, after.meta.name));
    session.setDirty(false);
    this.applyMode(session.state);
    showToast({ message: t('share.restored.text', { p1: version, p2: after.baseVersion }) });
  }

  /** 공유를 회수한다 — 링크는 끝나고, 이 화면의 문서는 그대로 남는다 */
  async revoke(): Promise<void> {
    const st = this.session?.state;
    if (!this.provider || !st || (st.kind !== 'open' && st.kind !== 'conflict') || !st.adminKey) throw new Error(t('share.manage.noAdminKey.text'));
    await this.provider.revoke(st.token, st.adminKey);
    await this.leave();
    showToast({ message: t('share.revoked.text') });
  }

  /** 시작 시 `?share=` 가 있으면 공유 문서를 연다 */
  async loadFromShareParam(): Promise<void> {
    const loc = parseShareLocation(location.search, location.hash);
    if (!loc) return;
    const provider = await this.getProvider();
    if (!provider) {
      showToast({ message: t('share.noProvider.text') });
      return;
    }
    let adminKey = loc.adminKey;
    if (adminKey) {
      // 관리키는 이 브라우저에만 기억하고 주소창에서 지운다(화면 공유·캡처로 새지 않게)
      safeSet(globalThis.localStorage, ADMIN_KEY_STORAGE_PREFIX + loc.token, adminKey);
      history.replaceState(history.state, '', location.pathname + location.search);
    } else {
      adminKey = safeGet(globalThis.localStorage, ADMIN_KEY_STORAGE_PREFIX + loc.token);
    }
    await this.openSession(loc.token, adminKey, true);
  }

  /**
   * 공유 세션을 연다. `load` 가 false 면 문서는 이미 화면에 있다(방금 공유를 만든 경우).
   * @returns 열렸으면 true
   */
  async openSession(token: string, adminKey: string | null, load: boolean): Promise<boolean> {
    const provider = await this.getProvider();
    if (!provider) return false;
    const name = await this.resolveName();
    await this.session?.close();
    const session = new ShareSession({
      provider,
      now: () => Date.now(),
      setInterval: (fn, ms) => window.setInterval(fn, ms),
      clearInterval: (h) => window.clearInterval(h as number),
      by: lockOwnerId(name, tabClientId()),
      onState: (s) => this.onState(s),
      onNewVersion: (bytes, meta) => { void this.applyNewVersion(bytes, meta); },
    });
    this.session = session;
    let bytes: Uint8Array | null;
    try {
      bytes = await session.open(token, adminKey);
    } catch (e) {
      this.session = null;
      showToast({ message: t('share.openFailed.text', { p1: e instanceof Error ? e.message : String(e) }) });
      return false;
    }
    if (!bytes) return false; // gone — onState 가 안내 화면을 띄웠다
    const st = session.state;
    if (load && st.kind === 'open') {
      await this.withShareLoad(() => this.deps.loadBytes(bytes!, st.meta.name));
    }
    session.setDirty(this.deps.isDirty());
    this.applyMode(session.state);
    this.renderBanner();
    this.startBannerTimer();
    return true;
  }

  /** 공유 세션을 떠난다(다른 문서를 열거나 새 문서를 만들 때). 세션이 없으면 아무것도 안 한다. */
  async leave(): Promise<void> {
    if (!this.session && !this.goneShown) return;
    const s = this.session;
    this.session = null;
    await s?.close();
    this.goneShown = false;
    document.getElementById('share-gone')?.remove();
    this.stopBannerTimer();
    this.renderBanner();
    this.applyMode({ kind: 'idle' });
    const u = new URL(location.href);
    if (u.searchParams.has('share')) {
      u.searchParams.delete('share');
      u.hash = '';
      history.replaceState(history.state, '', u.href);
    }
  }

  // ─── 내부 ─────────────────────────────

  private async resolveName(): Promise<string> {
    const fromSettings = userSettings.getReviewSettings().userName.trim();
    if (fromSettings) return fromSettings;
    const stored = safeGet(globalThis.localStorage, NAME_KEY)?.trim();
    if (stored) return stored;
    const asked = (await new ShareNameDialog().showAsync())?.trim().slice(0, 40);
    const name = asked || t('share.anonymous');
    if (asked) safeSet(globalThis.localStorage, NAME_KEY, asked);
    return name;
  }

  private async withShareLoad(fn: () => Promise<void>): Promise<void> {
    this.loadingShare = true;
    try {
      await fn();
    } finally {
      this.loadingShare = false;
    }
  }

  private onState(s: SessionState): void {
    if (this.session && this.session.state !== s) return; // 닫힌 옛 세션의 늦은 알림
    if (s.kind === 'gone') this.showGone();
    this.applyMode(s);
    this.renderBanner();
  }

  private applyMode(s: SessionState): void {
    const wantView = (s.kind === 'open' && s.role === 'viewer') || s.kind === 'conflict' || s.kind === 'gone';
    const cur = this.deps.getEditMode();
    if (wantView && cur !== 'view') {
      this.deps.setEditMode('view');
      this.viewModeByShare = true;
    } else if (!wantView && cur === 'view' && this.viewModeByShare) {
      this.deps.setEditMode('normal');
      this.viewModeByShare = false;
    }
  }

  private async applyNewVersion(bytes: Uint8Array, meta: ShareMeta): Promise<void> {
    await this.withShareLoad(() => this.deps.loadBytes(bytes, meta.name));
    this.session?.setDirty(false);
    this.applyMode(this.session?.state ?? { kind: 'idle' });
    this.deps.setStatus(t('share.updated.text', { p1: meta.version }));
  }

  private showGone(): void {
    this.goneShown = true;
    this.stopBannerTimer();
    if (document.getElementById('share-gone')) return;
    const box = document.createElement('div');
    box.id = 'share-gone';
    box.setAttribute('role', 'alert');
    const msg = document.createElement('p');
    msg.textContent = t('share.banner.gone');
    box.appendChild(msg);
    // 메뉴는 살려 둔다(다른 파일 열기) — 편집 영역 위부터 덮는다
    const top = document.getElementById('editor-area')?.getBoundingClientRect().top ?? 0;
    box.style.top = `${Math.max(0, Math.round(top))}px`;
    document.body.appendChild(box);
  }

  /** 제공자가 있을 때만 공유 메뉴를 보인다(상태 칩은 세션이 있을 때 renderChip 이 정한다) */
  private syncShareUi(): void {
    document.querySelectorAll<HTMLElement>('[data-share-ui]').forEach((el) => {
      if (el.id !== 'sb-share') el.hidden = !this.provider;
    });
    this.renderChip();
  }

  private renderChip(): void {
    const el = document.getElementById('sb-share');
    if (!el) return;
    const model = this.session ? chipModel(this.session.state, t) : null;
    el.hidden = !model;
    el.textContent = model?.text ?? '';
    el.title = model ? t(model.manageable ? 'command.file.shareManage.label' : 'share.linkCopied.hint') : '';
  }

  private renderBanner(): void {
    this.renderChip();
    const el = document.getElementById('share-banner');
    if (!el) return;
    const model = this.session ? bannerModel(this.session.state, Date.now(), t) : null;
    if (!model || model.fullscreen) {
      el.hidden = true;
      el.replaceChildren();
      return;
    }
    const text = document.createElement('span');
    text.className = 'share-banner-text';
    text.textContent = model.text;
    const buttons = model.actions.map((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'share-banner-btn';
      b.textContent = a.label;
      b.addEventListener('click', () => { void this.handleAction(a.kind); });
      return b;
    });
    el.dataset.tone = model.tone;
    el.replaceChildren(text, ...buttons);
    el.hidden = false;
  }

  private async handleAction(kind: BannerActionKind): Promise<void> {
    const session = this.session;
    if (!session) return;
    if (kind === 'download') {
      this.deps.dispatch('file:save-as-hwpx');
    } else if (kind === 'takeover') {
      if (!(await session.takeOver())) showToast({ message: t('share.takeoverFailed.text') });
    } else if (kind === 'reload') {
      const bytes = await session.reloadLatest();
      const st = session.state;
      if (bytes && st.kind === 'open') {
        await this.withShareLoad(() => this.deps.loadBytes(bytes, st.meta.name));
        session.setDirty(false);
        this.applyMode(session.state);
      }
    }
    this.renderBanner();
  }

  private startBannerTimer(): void {
    if (this.bannerTimer != null) return;
    this.bannerTimer = window.setInterval(() => this.renderBanner(), BANNER_REFRESH_MS);
  }

  private stopBannerTimer(): void {
    if (this.bannerTimer != null) window.clearInterval(this.bannerTimer);
    this.bannerTimer = null;
  }
}

let active: ShareRuntime | null = null;

export function installShareRuntime(deps: ShareRuntimeDeps): ShareRuntime {
  active = new ShareRuntime(deps);
  return active;
}

export function getShareRuntime(): ShareRuntime | null {
  return active;
}

export function getActiveShareSession(): ShareSession | null {
  return active?.session ?? null;
}
