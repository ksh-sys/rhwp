/**
 * .hwp 저장 보호 — 순수 판정. 엔진은 .hwp 출처 메모의 본문을 읽지 못하므로(readable=false)
 * 그런 메모가 있는 문서를 .hwp 로 저장하면 그 본문이 사라진다(설계서 §2.1).
 */
import type { MemoEntry } from './memo-types.ts';

export function unreadableMemoCount(entries: readonly MemoEntry[]): number {
  return entries.reduce((n, m) => n + (m.readable ? 0 : 1), 0);
}

/** 경고 문구. 읽지 못한 메모가 없으면 null. `t` 는 i18n 함수(키, 매개변수). */
export function hwpSaveWarning(
  count: number,
  total: number,
  t: (key: string, params?: Record<string, string | number>) => string,
): string | null {
  if (count <= 0) return null;
  return t('memo.hwpSaveWarning.text', { count, total });
}
