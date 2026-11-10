/**
 * 새 문서 기본 용지(편집 용지, F7) — 순수 모듈.
 *
 * 기본값: A4 세로·한쪽, 위 15·머리말 10·왼쪽 20·오른쪽 20·제본 0·꼬리말 10·아래 15 mm.
 * F7 의 「현재 설정 값을 새 문서에 적용」으로 사용자가 바꾸면 user-settings 에 저장된다.
 * 단위는 HWPUNIT(1mm = 7200/25.4).
 */
import type { PageDef } from './types.ts';

const mm = (v: number) => Math.round(v * 7200 / 25.4);

export const DEFAULT_NEW_DOC_PAGE_DEF: Readonly<PageDef> = Object.freeze({
  width: 59528, // A4 210mm (편집 용지 프리셋과 같은 값)
  height: 84188, // A4 297mm
  marginTop: mm(15),
  marginHeader: mm(10),
  marginLeft: mm(20),
  marginRight: mm(20),
  marginGutter: 0,
  marginFooter: mm(10),
  marginBottom: mm(15),
  landscape: false,
  binding: 0,
});

const LENGTH_KEYS = [
  'width', 'height', 'marginLeft', 'marginRight', 'marginTop', 'marginBottom',
  'marginHeader', 'marginFooter', 'marginGutter',
] as const;

/** 저장값을 PageDef 로 되살린다 — 필드별로 잘못되면 그 필드만 기본값. 항상 새 객체. */
export function normalizeNewDocPageDef(value: unknown): PageDef {
  const out: PageDef = { ...DEFAULT_NEW_DOC_PAGE_DEF };
  if (!value || typeof value !== 'object') return out;
  const v = value as Record<string, unknown>;
  for (const k of LENGTH_KEYS) {
    const n = v[k];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) continue;
    if ((k === 'width' || k === 'height') && n <= 0) continue;
    out[k] = Math.round(n);
  }
  if (typeof v.landscape === 'boolean') out.landscape = v.landscape;
  if (v.binding === 0 || v.binding === 1 || v.binding === 2) out.binding = v.binding;
  return out;
}
