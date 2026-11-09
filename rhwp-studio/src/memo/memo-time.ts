/**
 * 메모 작성 시각 — 한글 2024 실측 형식. 한글은 **현지 시각**에 `Z` 를 붙여 저장한다
 * (23:31 KST 에 만든 메모가 `2026-11-08T23:31:20Z`). 진짜 UTC 를 넣으면 한글 풍선 시각이 어긋난다.
 * `@/` 별칭 없음 — node:test 가 그대로 읽는다.
 */

/** 지금(또는 주어진 시각)을 현지 시각 + `Z` 로 */
export function nowIsoSeconds(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}T${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}Z`;
}

/** 표시용 `YYYY/MM/DD HH:mm`. `Z` 는 떼고 현지 시각으로 읽는다. 비어 있거나 못 읽으면 빈 문자열. */
export function formatWhen(iso: string): string {
  if (!iso) return '';
  const d = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/.test(iso) ? iso.slice(0, -1) : iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
