/** 공유 만들기 대화상자의 순수 계산 — 만료 시각, 공유본 파일 이름. */

export type ExpiryChoice = 'none' | '7d' | '30d' | 'date';

const DAY_MS = 86_400_000;

/** 만료 선택 → epoch ms(없으면 null). 'date' 는 그날(현지) 끝 23:59:59.999, 잘못된 날짜는 null. */
export function expiresAtFrom(choice: ExpiryChoice, now: number, date?: string): number | null {
  if (choice === '7d') return now + 7 * DAY_MS;
  if (choice === '30d') return now + 30 * DAY_MS;
  if (choice !== 'date') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const at = new Date(y, mo, d, 23, 59, 59, 999);
  if (at.getFullYear() !== y || at.getMonth() !== mo || at.getDate() !== d) return null;
  return at.getTime();
}

/** 공유본은 HWPX 로 저장된다 — 이름의 확장자를 .hwpx 로 맞춘다. */
export function shareFileName(fileName: string): string {
  const base = fileName.replace(/\.(hwp|hwpx|hml)$/i, '');
  return `${base || 'document'}.hwpx`;
}
