/**
 * InputHandler 의 메모(검토 주석) 편집 — 넣기·본문 변경·삭제. 모두 executeOperation snapshot 으로
 * 실행 취소에 들어간다. input-handler-table.ts 와 같은 `function f(this: any, …)` 분리 패턴.
 */
import { hyperlinkTarget } from '@/core/hyperlink';
import type { DocumentPosition } from '@/core/types';
import { resolveMemoRange } from '@/memo/memo-range';
import { toFieldTarget, type MemoEntry } from '@/memo/memo-types';

export type InsertMemoResult =
  | { ok: true; fieldId: number; clamped: boolean }
  | { ok: false; reason: 'no-range' | 'overlap' | 'unsupported' | string };

/** 현재 선택(없으면 캐럿 낱말)에 빈 메모를 단다. */
export function insertMemoAtSelection(this: any, author: string, createdAt: string): InsertMemoResult {
  if (!this.canEditHyperlink()) return { ok: false, reason: 'unsupported' };
  const selection = this.hasSelection() ? structuredClone(this.getSelection()) : null;
  const caret: DocumentPosition = this.getCursorPosition();
  const wasm = this.wasm;
  let range;
  try {
    range = resolveMemoRange(selection, caret, (pos) => wasm.getHyperlinkContext(hyperlinkTarget(pos)).text);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'unsupported' };
  }
  if (!range) return { ok: false, reason: 'no-range' };
  let target;
  try {
    target = hyperlinkTarget(range.anchor);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'unsupported' };
  }
  const { start, end, anchor, clampedToFirstParagraph } = range;
  let fieldId = 0;
  let error: string | null = null;
  try {
    this.executeOperation({
      kind: 'snapshot',
      operationType: 'insertMemo',
      selectionBefore: selection ? { ...selection, blockPhase: null } : null,
      operation: (wasm: any) => {
        try {
          fieldId = wasm.insertMemo({ target, start, end, author, text: '', createdAt });
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
          return null;
        }
        return { ...anchor, charOffset: end };
      },
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  if (error) return { ok: false, reason: String(error).includes('겹치') ? 'overlap' : error };
  if (!fieldId) return { ok: false, reason: 'unsupported' };
  return { ok: true, fieldId, clamped: clampedToFirstParagraph };
}

/** 메모 본문 교체. 같은 내용이면 기록하지 않고 false. */
export function updateMemoText(this: any, entry: MemoEntry, text: string): boolean {
  let changed = false;
  const target = toFieldTarget(entry.location);
  this.executeOperation({
    kind: 'snapshot',
    operationType: 'updateMemoText',
    operation: (wasm: any) => {
      if (!wasm.updateMemoText({ target, fieldId: entry.fieldId, text })) return null;
      changed = true;
      return this.cursor.getPosition();
    },
  });
  return changed;
}

/** 메모 삭제 — 대상 글자는 남는다. */
export function removeMemo(this: any, entry: MemoEntry): boolean {
  let removed = false;
  const target = toFieldTarget(entry.location);
  try {
    this.executeOperation({
      kind: 'snapshot',
      operationType: 'removeMemo',
      operation: (wasm: any) => {
        wasm.removeMemo({ target, fieldId: entry.fieldId });
        removed = true;
        return this.cursor.getPosition();
      },
    });
  } catch (e) {
    console.warn('[memo] 삭제 실패:', e);
  }
  return removed;
}
