/**
 * 공유 제공자 로더 — `<meta name="rhwp-share-provider" content="…">` 를 읽어 ES 모듈을 동적으로 불러온다.
 * 순수 함수(문서·importer 주입)라 node:test 에서 바로 실행된다.
 */
import type { ShareProvider } from './provider.ts';

export const SHARE_PROVIDER_META = 'rhwp-share-provider';

export const SHARE_PROVIDER_METHODS = [
  'create', 'open', 'save', 'watch', 'lock', 'heartbeat', 'unlock',
  'updateSettings', 'revoke', 'listVersions', 'openVersion', 'canCreate',
] as const;

type DocLike = { querySelector(sel: string): { getAttribute(n: string): string | null } | null };

/** 메타가 없거나 비어 있으면 null. 상대 경로는 baseURI 기준으로 절대화한다. */
export function providerUrlFromDocument(doc: DocLike, baseURI: string): string | null {
  const el = doc.querySelector(`meta[name="${SHARE_PROVIDER_META}"]`);
  const content = el?.getAttribute('content')?.trim();
  if (!content) return null;
  try {
    return new URL(content, baseURI).href;
  } catch {
    return null;
  }
}

export function isShareProvider(x: unknown): x is ShareProvider {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return SHARE_PROVIDER_METHODS.every((m) => typeof o[m] === 'function');
}

/**
 * 모듈의 `default` 또는 `createShareProvider()` 결과가 계약을 만족하면 반환, 아니면 null.
 * import 실패(404·CSP)도 null — 편집기는 평소처럼 떠야 한다.
 */
export async function loadShareProvider(
  url: string,
  importer: (u: string) => Promise<unknown> = (u) => import(/* @vite-ignore */ u),
): Promise<ShareProvider | null> {
  let mod: unknown;
  try {
    mod = await importer(url);
  } catch (e) {
    console.info('[share] provider module not loaded:', url, e instanceof Error ? e.message : e);
    return null;
  }
  const m = (mod ?? {}) as Record<string, unknown>;
  let candidate: unknown = m.default;
  if (!isShareProvider(candidate) && typeof m.createShareProvider === 'function') {
    try {
      candidate = await (m.createShareProvider as () => unknown)();
    } catch (e) {
      console.info('[share] createShareProvider() failed:', e instanceof Error ? e.message : e);
      return null;
    }
  }
  if (!isShareProvider(candidate)) {
    console.info('[share] provider module does not satisfy the contract:', url);
    return null;
  }
  return candidate;
}
