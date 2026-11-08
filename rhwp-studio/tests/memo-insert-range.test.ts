import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMemoRange as resolveFull, wordRangeAt } from '../src/memo/memo-range.ts';

/** anchor(문단 위치)는 빼고 범위만 비교한다 */
const resolveMemoRange = (...args: Parameters<typeof resolveFull>) => {
  const r = resolveFull(...args);
  if (!r) return null;
  const { anchor: _anchor, ...rest } = r;
  return rest;
};

const pos = (paragraphIndex: number, charOffset: number, extra: Record<string, unknown> = {}) =>
  ({ sectionIndex: 0, paragraphIndex, charOffset, ...extra }) as any;

test('같은 문단 선택은 그대로(앞뒤 순서 무관)', () => {
  const r = resolveMemoRange({ start: pos(3, 7), end: pos(3, 2) }, pos(3, 7), '가나다라마바사아');
  assert.deepEqual(r, { start: 2, end: 7, clampedToFirstParagraph: false });
});

test('여러 문단 선택은 시작 문단의 선택 시작부터 문단 끝까지 + clamped', () => {
  const r = resolveMemoRange({ start: pos(3, 2), end: pos(5, 1) }, pos(3, 2), '가나다라마');
  assert.deepEqual(r, { start: 2, end: 5, clampedToFirstParagraph: true });
  // 거꾸로 긁어도(끝이 앞 문단) 앞 문단 기준
  const r2 = resolveMemoRange({ start: pos(5, 1), end: pos(3, 2) }, pos(5, 1), '가나다라마');
  assert.deepEqual(r2, { start: 2, end: 5, clampedToFirstParagraph: true });
});

test('선택이 없으면 캐럿이 놓인 낱말, 공백 위면 null', () => {
  assert.deepEqual(wordRangeAt('가나다 라마', 1), { start: 0, end: 3 });
  assert.deepEqual(wordRangeAt('가나다 라마', 3), { start: 0, end: 3 }); // 낱말 끝 경계는 앞 낱말
  assert.deepEqual(wordRangeAt('가나다 라마', 4), { start: 4, end: 6 });
  assert.equal(wordRangeAt('가나다  라마', 4), null);
  assert.deepEqual(wordRangeAt('hello, world', 8), { start: 7, end: 12 });
  assert.equal(wordRangeAt('', 0), null);
  const r = resolveMemoRange(null, pos(0, 1), '가나다 라마');
  assert.deepEqual(r, { start: 0, end: 3, clampedToFirstParagraph: false });
  assert.equal(resolveMemoRange(null, pos(0, 3), '가나다 라마')?.start, 0);
  assert.equal(resolveMemoRange(null, pos(0, 7), '가나다 라마 '), null);
});

test('빈 선택(start==end)은 선택 없음과 같이 낱말을 쓴다', () => {
  const r = resolveMemoRange({ start: pos(0, 5), end: pos(0, 5) }, pos(0, 5), '가나다 라마');
  assert.deepEqual(r, { start: 4, end: 6, clampedToFirstParagraph: false });
});
