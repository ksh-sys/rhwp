/**
 * 메모를 달 본문 범위 결정 — 순수 함수.
 *
 * - 같은 문단 선택: 그대로. 빈 선택(start==end)은 선택 없음과 같다.
 * - 여러 문단 선택: 앞 문단의 선택 시작부터 그 문단 끝까지(1차 한계, 설계서 §4.1) + clamped 표시.
 * - 선택 없음: 캐럿이 놓인 낱말(공백·구두점·기호 경계). 낱말이 없으면 null.
 */
import type { DocumentPosition } from '../core/types.ts';

export interface MemoRange {
  start: number;
  end: number;
  clampedToFirstParagraph: boolean;
}

export interface MemoRangeWithAnchor extends MemoRange {
  /** 범위가 속한 문단의 위치(앞 문단) — 대상 주소를 만들 때 쓴다 */
  anchor: DocumentPosition;
}

const isWordChar = (ch: string): boolean => !/[\s\p{P}\p{S}]/u.test(ch);

/** 캐럿 위치의 낱말 [start, end). 낱말 끝 경계(바로 뒤가 공백)는 앞 낱말로 본다. */
export function wordRangeAt(text: string, caret: number): { start: number; end: number } | null {
  const chars = Array.from(text);
  const i = Math.max(0, Math.min(caret, chars.length));
  let anchor: number;
  if (i < chars.length && isWordChar(chars[i])) anchor = i;
  else if (i > 0 && isWordChar(chars[i - 1])) anchor = i - 1;
  else return null;
  let s = anchor;
  let e = anchor + 1;
  while (s > 0 && isWordChar(chars[s - 1])) s -= 1;
  while (e < chars.length && isWordChar(chars[e])) e += 1;
  return { start: s, end: e };
}

function paraKey(p: DocumentPosition): string {
  return JSON.stringify([
    p.sectionIndex,
    p.parentParaIndex ?? p.paragraphIndex,
    p.paragraphIndex,
    p.controlIndex ?? -1,
    p.cellIndex ?? -1,
    p.cellParaIndex ?? -1,
    p.cellPath ?? [],
    p.isTextBox ?? false,
  ]);
}

/** 문서 순서 비교용 — 본문 문단 번호(셀이면 부모 문단) 다음 내부 문단 번호 */
function docOrder(p: DocumentPosition): number[] {
  return [p.sectionIndex, p.parentParaIndex ?? p.paragraphIndex, p.paragraphIndex, p.cellParaIndex ?? -1, p.charOffset];
}

function earlier(a: DocumentPosition, b: DocumentPosition): DocumentPosition {
  const ka = docOrder(a);
  const kb = docOrder(b);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] < kb[i] ? a : b;
  }
  return a;
}

export function resolveMemoRange(
  selection: { start: DocumentPosition; end: DocumentPosition } | null,
  caret: DocumentPosition,
  paraText: string | ((pos: DocumentPosition) => string),
): MemoRangeWithAnchor | null {
  const textOf = (pos: DocumentPosition) => (typeof paraText === 'string' ? paraText : paraText(pos));
  if (selection && !(selection.start.charOffset === selection.end.charOffset && paraKey(selection.start) === paraKey(selection.end))) {
    const { start, end } = selection;
    if (paraKey(start) === paraKey(end)) {
      const s = Math.min(start.charOffset, end.charOffset);
      const e = Math.max(start.charOffset, end.charOffset);
      return { start: s, end: e, clampedToFirstParagraph: false, anchor: structuredClone(start) };
    }
    const first = earlier(start, end);
    const len = Array.from(textOf(first)).length;
    if (first.charOffset >= len) return null;
    return { start: first.charOffset, end: len, clampedToFirstParagraph: true, anchor: structuredClone(first) };
  }
  const w = wordRangeAt(textOf(caret), caret.charOffset);
  if (!w) return null;
  return { ...w, clampedToFirstParagraph: false, anchor: structuredClone(caret) };
}
