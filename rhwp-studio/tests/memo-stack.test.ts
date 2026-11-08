import test from 'node:test';
import assert from 'node:assert/strict';
import { stackBalloons, stackedBottom, type StackInput } from '../src/memo/memo-stack.ts';

const item = (id: number, anchorTop: number, height: number): StackInput => ({ id, anchorTop, height });

test('겹치지 않는 풍선은 앵커 높이에 그대로 놓인다', () => {
  const tops = stackBalloons([item(1, 10, 40), item(2, 100, 40)], 6);
  assert.equal(tops.get(1), 10);
  assert.equal(tops.get(2), 100);
});

test('겹치면 앞 풍선 아래로 gap 만큼 띄워 민다', () => {
  const tops = stackBalloons([item(1, 10, 40), item(2, 20, 40)], 6);
  assert.equal(tops.get(2), 10 + 40 + 6);
});

test('세 개가 연쇄로 밀리고 입력 순서와 무관하게 앵커 순으로 쌓인다', () => {
  const tops = stackBalloons([item(3, 30, 30), item(1, 0, 30), item(2, 10, 30)], 4);
  assert.equal(tops.get(1), 0);
  assert.equal(tops.get(2), 34);
  assert.equal(tops.get(3), 68);
});

test('stackedBottom 은 마지막 풍선의 아래 끝이고 빈 입력은 0', () => {
  const items = [item(1, 0, 30), item(2, 10, 30)];
  const tops = stackBalloons(items, 4);
  assert.equal(stackedBottom(tops, items), 34 + 30);
  assert.equal(stackBalloons([], 4).size, 0);
  assert.equal(stackedBottom(new Map(), []), 0);
});
