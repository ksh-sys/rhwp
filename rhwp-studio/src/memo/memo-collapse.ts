/**
 * 메모 앵커 붕괴 판정과 캐럿 위치 → 메모 location 변환 — 순수 함수.
 *
 * 앵커 글자를 사용자가 모두 지우면 범위 필드가 start==end 로 남는다. 그 메모는 함께 지운다
 * (설계서 §3.3). 판정만 여기서 하고 삭제는 main 이 InputHandler.removeMemo 로 한다.
 */
import type { DocumentPosition } from '../core/types.ts';
import type { MemoEntry, MemoLocation } from './memo-types.ts';

/** 대상 글자가 모두 지워진 메모 */
export function collapsedMemos(entries: readonly MemoEntry[]): MemoEntry[] {
  return entries.filter((m) => m.startCharIdx >= m.endCharIdx);
}

/** DocumentPosition → `getMemoList` 의 location 모양(본문·셀·중첩 셀·글상자) */
export function positionToMemoLocation(pos: DocumentPosition): MemoLocation {
  if (pos.parentParaIndex === undefined) {
    return { sectionIndex: pos.sectionIndex, paraIndex: pos.paragraphIndex };
  }
  const path: NonNullable<MemoLocation['path']> = [];
  if (pos.cellPath && pos.cellPath.length > 0) {
    for (const e of pos.cellPath) {
      path.push({ type: 'cell', controlIndex: e.controlIndex, cellIndex: e.cellIndex, paraIndex: e.cellParaIndex });
    }
  } else if (pos.isTextBox) {
    path.push({ type: 'textbox', controlIndex: pos.controlIndex ?? 0, paraIndex: pos.cellParaIndex ?? 0 });
  } else {
    path.push({
      type: 'cell',
      controlIndex: pos.controlIndex ?? 0,
      cellIndex: pos.cellIndex ?? 0,
      paraIndex: pos.cellParaIndex ?? 0,
    });
  }
  return { sectionIndex: pos.sectionIndex, paraIndex: pos.parentParaIndex, path };
}
