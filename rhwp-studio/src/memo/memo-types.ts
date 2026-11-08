/**
 * 메모(검토 주석) 공용 타입·상수 — `getMemoList` JSON 과 범위 필드 대상 주소.
 *
 * `@/` 별칭을 쓰지 않는다: node:test 가 `.ts` 를 그대로 읽는 시험에서 import 한다.
 */

/** `getFieldList`/`getMemoList` 의 location — path 가 없으면 본문 문단 */
export interface MemoLocation {
  sectionIndex: number;
  paraIndex: number;
  path?: Array<{
    type: 'cell' | 'textbox';
    controlIndex: number;
    cellIndex?: number;
    paraIndex: number;
  }>;
}

/** 엔진 `getMemoList` 항목 */
export interface MemoEntry {
  fieldId: number;
  number: number;
  author: string;
  /** ISO 8601 UTC — .hwp 출처 등 알 수 없으면 빈 문자열 */
  createdAt: string;
  text: string;
  /** 본문을 읽었는지 — .hwp 출처 메모는 false */
  readable: boolean;
  location: MemoLocation;
  startCharIdx: number;
  endCharIdx: number;
}

/** 엔진 범위 필드 대상 `{section, para, cellPath}` — 하이퍼링크와 같은 JSON */
export interface FieldTargetJson {
  section: number;
  para: number;
  cellPath: Array<[number, number, number]>;
}

/** location → 범위 필드 대상. 글상자는 셀 번호 0 으로 둔다(엔진 규약). */
export function toFieldTarget(loc: MemoLocation): FieldTargetJson {
  return {
    section: loc.sectionIndex,
    para: loc.paraIndex,
    cellPath: (loc.path ?? []).map((e) =>
      e.type === 'cell'
        ? [e.controlIndex, e.cellIndex ?? 0, e.paraIndex]
        : [e.controlIndex, 0, e.paraIndex],
    ),
  };
}

/** 한글 기본 메모 모양 색 — 채움·활성·선 */
export const MEMO_COLORS = {
  fill: '#CBFF99',
  active: '#FDBCDD',
  line: '#A9A9A9',
} as const;

/** 한글 기본 메모 띠 폭 (memoPr width, HWPUNIT) */
export const MEMO_BAND_HWPUNIT = 15591;

/** HWPUNIT → 96dpi px (7200/96 = 75) */
const HWPUNIT_PER_PX = 75;

/** 띠 폭(px) — 줌 적용, 정수 반올림 */
export function memoBandPx(zoom: number): number {
  return Math.round((MEMO_BAND_HWPUNIT / HWPUNIT_PER_PX) * zoom);
}

/** 같은 문단(같은 중첩 경로)인가 */
export function sameLocation(a: MemoLocation, b: MemoLocation): boolean {
  if (a.sectionIndex !== b.sectionIndex || a.paraIndex !== b.paraIndex) return false;
  const pa = a.path ?? [];
  const pb = b.path ?? [];
  if (pa.length !== pb.length) return false;
  return pa.every(
    (e, i) =>
      e.type === pb[i].type &&
      e.controlIndex === pb[i].controlIndex &&
      (e.cellIndex ?? 0) === (pb[i].cellIndex ?? 0) &&
      e.paraIndex === pb[i].paraIndex,
  );
}
