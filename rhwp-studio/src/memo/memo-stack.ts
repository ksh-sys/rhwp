/**
 * 메모 풍선 적층 — 앵커 세로 위치 순으로 놓되, 앞 풍선과 겹치면 아래로 민다(한글과 같은 단순 적층).
 * 순수 함수: 레이어가 DOM 높이를 재서 넘긴다.
 */
export interface StackInput {
  id: number;
  /** 앵커(본문 대상 구간) 위쪽 세로 위치 — 쪽 기준 px */
  anchorTop: number;
  /** 풍선 높이 px */
  height: number;
}

/** id → 풍선 top. 입력 순서와 무관하게 anchorTop 오름차순으로 쌓는다. */
export function stackBalloons(items: readonly StackInput[], gap: number): Map<number, number> {
  const tops = new Map<number, number>();
  let prevBottom = -Infinity;
  for (const it of [...items].sort((a, b) => a.anchorTop - b.anchorTop || a.id - b.id)) {
    const top = Math.max(it.anchorTop, prevBottom + gap);
    tops.set(it.id, top);
    prevBottom = top + it.height;
  }
  return tops;
}

/** 적층 결과의 아래 끝 — 띠 높이를 쪽보다 늘려야 하는지 판단할 때 쓴다. 빈 입력은 0. */
export function stackedBottom(tops: ReadonlyMap<number, number>, items: readonly StackInput[]): number {
  let bottom = 0;
  for (const it of items) {
    const top = tops.get(it.id);
    if (top !== undefined) bottom = Math.max(bottom, top + it.height);
  }
  return bottom;
}
