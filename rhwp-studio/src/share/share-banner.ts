/**
 * 공유 띠(배너) 문구 선택 — 순수 함수. 세션 상태 → 문구·버튼.
 * DOM 그리기는 share-runtime 이 한다.
 */
import type { SessionState } from './share-session.ts';
import { lockExpired } from './share-session.ts';
import { displayNameOf } from './share-link.ts';

export type BannerActionKind = 'start' | 'stop' | 'download' | 'reload';

export interface BannerModel {
  text: string;
  actions: Array<{ label: string; kind: BannerActionKind }>;
  /** 끝난 공유 — 편집 영역을 덮는 전체 화면 안내 */
  fullscreen: boolean;
  tone: 'info' | 'warn';
}

type T = (key: string, params?: Record<string, string | number>) => string;

export const BANNER_KEYS = [
  'share.banner.viewOnly',
  'share.banner.lockedBy',
  'share.banner.lockStale',
  'share.banner.checking',
  'share.banner.newVersion',
  'share.banner.gone',
  'share.banner.editing',
  'share.banner.canEdit',
  'share.action.start',
  'share.action.stop',
  'share.action.download',
  'share.action.reload',
] as const;

export function bannerModel(state: SessionState, now: number, t: T): BannerModel | null {
  const action = (kind: BannerActionKind) => ({ kind, label: t(`share.action.${kind}`) });

  if (state.kind === 'gone') {
    return { text: t('share.banner.gone'), actions: [], fullscreen: true, tone: 'warn' };
  }
  if (state.kind === 'conflict') {
    return {
      text: t('share.banner.newVersion', { p1: state.serverVersion }),
      actions: [action('download'), action('reload')],
      fullscreen: false,
      tone: 'warn',
    };
  }
  if (state.kind !== 'open') return null;

  if (state.dirty && state.pendingVersion != null) {
    return {
      text: t('share.banner.newVersion', { p1: state.pendingVersion }),
      actions: [action('download'), action('reload')],
      fullscreen: false,
      tone: 'warn',
    };
  }
  if (state.role === 'editor') {
    return { text: t('share.banner.editing'), actions: [action('stop')], fullscreen: false, tone: 'info' };
  }

  if (state.meta.access === 'view') {
    return { text: t('share.banner.viewOnly'), actions: [action('download')], fullscreen: false, tone: 'info' };
  }
  const lock = state.meta.lock;
  if (state.lockedBy && lock && lock.by === state.lockedBy) {
    const name = displayNameOf(state.lockedBy);
    if (lockExpired(lock, now)) {
      return { text: t('share.banner.lockStale', { p1: name }), actions: [action('start')], fullscreen: false, tone: 'info' };
    }
    const minutes = Math.max(0, Math.floor((now - (state.lockedSince ?? lock.since)) / 60_000));
    return { text: t('share.banner.lockedBy', { p1: name, p2: minutes }), actions: [], fullscreen: false, tone: 'info' };
  }
  // 편집 가능하고 아무도 편집하지 않는다 — 고치려면 [편집 시작]
  return { text: t('share.banner.canEdit'), actions: [action('start')], fullscreen: false, tone: 'info' };
}

export interface ChipModel {
  text: string;
  /** 관리키가 있어 「공유 관리」를 열 수 있다 */
  manageable: boolean;
}

/** 상태줄 칩 — `공유 중 · v4 · 편집 가능 · ~12/31` */
export function chipModel(state: SessionState, t: T): ChipModel | null {
  if (state.kind !== 'open' && state.kind !== 'conflict') return null;
  const meta = state.meta;
  const version = state.kind === 'open' ? Math.max(state.baseVersion, meta.version) : meta.version;
  let access = t(meta.access === 'edit' ? 'share.chip.edit' : 'share.chip.view');
  if (meta.expiresAt != null) {
    const d = new Date(meta.expiresAt);
    access += ` ${t('share.chip.until', { p1: `${d.getMonth() + 1}/${d.getDate()}` })}`;
  }
  return { text: t('share.chip.text', { p1: version, p2: access }), manageable: !!state.adminKey };
}
