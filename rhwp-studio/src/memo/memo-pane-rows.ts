/**
 * 메모 내용 보기 창의 행 데이터 — 순수 함수. DOM 은 memo-pane.ts 가 맡는다.
 */
import type { MemoEntry } from './memo-types.ts';

export const EXCERPT_CHARS = 60;

export interface MemoPaneRow {
  fieldId: number;
  /** 1 기반 쪽 번호(모르면 0) */
  page: number;
  author: string;
  when: string;
  /** 내용 첫 줄, 60자 넘으면 '…' */
  excerpt: string;
}

export function memoPaneRows(
  entries: readonly MemoEntry[],
  pageOf: (entry: MemoEntry) => number,
  formatWhen: (iso: string) => string,
): MemoPaneRow[] {
  return entries.map((m) => {
    const firstLine = m.text.split(/\r?\n/)[0] ?? '';
    const chars = Array.from(firstLine);
    const excerpt = chars.length > EXCERPT_CHARS ? chars.slice(0, EXCERPT_CHARS).join('') + '…' : firstLine;
    return { fieldId: m.fieldId, page: pageOf(m), author: m.author, when: formatWhen(m.createdAt), excerpt };
  });
}
