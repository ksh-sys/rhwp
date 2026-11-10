/**
 * 공유 링크 문자열 — 순수 함수(node:test 직접 실행).
 *
 * 공유 링크: `<편집기 주소>?share=<토큰 32 hex>`
 * 관리 링크: 공유 링크 + `#admin=<관리키 32 hex>` (fragment 라 서버 로그·Referer 에 남지 않는다)
 */

export const ADMIN_KEY_STORAGE_PREFIX = 'rhwp-share-admin:';

const HEX32 = /^[0-9a-f]{32}$/i;

export function isHexToken(s: string): boolean {
  return HEX32.test(s);
}

export function parseShareLocation(search: string, hash: string): { token: string; adminKey: string | null } | null {
  const raw = new URLSearchParams(search).get('share');
  if (!raw || !isHexToken(raw)) return null;
  const admin = new URLSearchParams(hash.replace(/^#/, '')).get('admin');
  return {
    token: raw.toLowerCase(),
    adminKey: admin && isHexToken(admin) ? admin.toLowerCase() : null,
  };
}

export function buildShareUrl(base: string, token: string): string {
  const u = new URL(base);
  u.search = '';
  u.hash = '';
  u.searchParams.set('share', token);
  return u.href;
}

export function buildAdminUrl(base: string, token: string, adminKey: string): string {
  return `${buildShareUrl(base, token)}#admin=${adminKey}`;
}

/**
 * 잠금 주인 식별자 — 같은 이름으로 두 탭을 열어도 서로 다른 주인이 되게 탭 ID 를 붙인다.
 * 화면에는 {@link displayNameOf} 로 이름만 보인다.
 */
export function lockOwnerId(name: string, clientId: string): string {
  return `${name}#${clientId}`;
}

export function displayNameOf(owner: string): string {
  const i = owner.lastIndexOf('#');
  return i > 0 ? owner.slice(0, i) : owner;
}
