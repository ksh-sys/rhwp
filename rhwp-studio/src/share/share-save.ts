/**
 * 공유 세션 저장(Ctrl+S) — 순수 함수, 의존성 주입.
 *
 * 편집자일 때 「저장」은 PC 파일이 아니라 공유본 새 버전이 된다. 실패하면 문서를 dirty 로 둬
 * 다시 저장할 수 있게 하고, 충돌이면 세션 상태(conflict)가 띠로 안내한다.
 */
import type { SessionState } from './share-session.ts';

export const SHARE_MAX_BYTES = 20 * 1024 * 1024;

export interface ShareSaveDeps {
  session: { readonly state: SessionState; save(bytes: Uint8Array): Promise<'saved' | 'conflict' | 'failed' | 'lost-lock'> };
  /** 지연된 쪽 나눔 마무리 등 출력 전 준비(실패하면 throw) */
  prepare(): void;
  exportBytes(): Uint8Array;
  markClean(reason: string): void;
  /** 상태줄 한 줄 알림 */
  notify(message: string): void;
  toast(message: string): void;
  t(key: string, params?: Record<string, string | number>): string;
}

export function shouldSaveToShare(state: SessionState): boolean {
  return state.kind === 'open' && state.role === 'editor';
}

export async function saveToShare(deps: ShareSaveDeps): Promise<'saved' | 'failed'> {
  try {
    deps.prepare();
    const bytes = deps.exportBytes();
    if (bytes.length > SHARE_MAX_BYTES) {
      deps.toast(deps.t('share.tooLarge.text'));
      return 'failed';
    }
    const result = await deps.session.save(bytes);
    if (result === 'saved') {
      deps.markClean('share-save');
      const st = deps.session.state;
      deps.notify(deps.t('share.saved.text', { p1: st.kind === 'open' ? st.baseVersion : '' }));
      return 'saved';
    }
    if (result === 'failed') deps.toast(deps.t('share.saveFailed.text'));
    if (result === 'lost-lock') deps.toast(deps.t('share.lockLost.text'));
    return 'failed';
  } catch (e) {
    console.warn('[share] 공유본 저장 실패:', e);
    deps.toast(deps.t('share.saveFailed.text'));
    return 'failed';
  }
}
