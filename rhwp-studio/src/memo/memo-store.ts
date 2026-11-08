/**
 * 메모 목록 캐시와 활성 메모 — 엔진 `getMemoList` 를 한 번 읽어 두고(문서 변경마다 refresh)
 * 캐럿↔메모 대응·이전/다음 탐색을 제공한다. DOM·wasm 에 직접 의존하지 않는다.
 */
import { sameLocation, type MemoEntry, type MemoLocation } from './memo-types.ts';

export class MemoStore {
  private list: MemoEntry[] = [];
  private active: number | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly readList: () => MemoEntry[];

  constructor(readList: () => MemoEntry[]) {
    this.readList = readList;
  }

  /** 엔진에서 다시 읽는다. 사라진 활성 메모는 해제한다. */
  refresh(): MemoEntry[] {
    let next: MemoEntry[];
    try {
      next = this.readList();
    } catch {
      next = [];
    }
    this.list = next;
    if (this.active !== null && !next.some((m) => m.fieldId === this.active)) {
      this.active = null;
    }
    this.emit();
    return this.list;
  }

  get entries(): readonly MemoEntry[] {
    return this.list;
  }

  get activeId(): number | null {
    return this.active;
  }

  get activeEntry(): MemoEntry | null {
    return this.list.find((m) => m.fieldId === this.active) ?? null;
  }

  byId(fieldId: number): MemoEntry | null {
    return this.list.find((m) => m.fieldId === fieldId) ?? null;
  }

  setActive(id: number | null): void {
    if (this.active === id) return;
    this.active = id;
    this.emit();
  }

  /** 같은 문단에서 start ≤ charIdx ≤ end 인 첫 메모 */
  findAtCaret(loc: MemoLocation, charIdx: number): MemoEntry | null {
    return (
      this.list.find(
        (m) => sameLocation(m.location, loc) && m.startCharIdx <= charIdx && charIdx <= m.endCharIdx,
      ) ?? null
    );
  }

  /** 문서 순 다음(1)/이전(-1). fromId 가 없으면 첫/마지막. 끝을 넘으면 null. */
  neighbor(fromId: number | null, dir: 1 | -1): MemoEntry | null {
    if (this.list.length === 0) return null;
    if (fromId === null) return dir === 1 ? this.list[0] : this.list[this.list.length - 1];
    const idx = this.list.findIndex((m) => m.fieldId === fromId);
    if (idx < 0) return dir === 1 ? this.list[0] : this.list[this.list.length - 1];
    return this.list[idx + dir] ?? null;
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private emit(): void {
    for (const cb of this.listeners) cb();
  }
}
