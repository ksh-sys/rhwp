/**
 * 공유 띠(배너) 문구 선택 — 순수 함수. 세션 상태 → 문구·버튼.
 * DOM 그리기는 share-runtime 이 한다.
 */
import type { SessionState } from './share-session.ts';
import { lockExpired } from './share-session.ts';
import { displayNameOf } from './share-link.ts';

export type BannerActionKind = 'takeover' | 'download' | 'reload';

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
  'share.action.takeover',
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
  if (state.role === 'editor') return null;

  if (state.meta.access === 'view') {
    return { text: t('share.banner.viewOnly'), actions: [action('download')], fullscreen: false, tone: 'info' };
  }
  const lock = state.meta.lock;
  if (state.lockedBy && lock && lock.by === state.lockedBy) {
    const name = displayNameOf(state.lockedBy);
    if (lockExpired(lock, now)) {
      return { text: t('share.banner.lockStale', { p1: name }), actions: [action('takeover')], fullscreen: false, tone: 'info' };
    }
    const minutes = Math.max(0, Math.floor((now - (state.lockedSince ?? lock.since)) / 60_000));
    return { text: t('share.banner.lockedBy', { p1: name, p2: minutes }), actions: [], fullscreen: false, tone: 'info' };
  }
  return { text: t('share.banner.checking'), actions: [], fullscreen: false, tone: 'info' };
}
