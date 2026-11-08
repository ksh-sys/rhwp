import test from 'node:test';
import assert from 'node:assert/strict';
import { fitWidthZoomWithBand, singleColumnLeft, slotWidth } from '../src/view/page-band.ts';

test('slotWidth 는 쪽 폭에 오른쪽 띠를 더한다', () => {
  assert.equal(slotWidth(400, 0), 400);
  assert.equal(slotWidth(400, 100), 500);
});

test('singleColumnLeft 는 쪽+띠를 뷰포트 가운데 두되 gap 아래로 내려가지 않는다', () => {
  assert.equal(singleColumnLeft(1000, 400, 100, 10), 250);
  assert.equal(singleColumnLeft(300, 400, 100, 10), 10);
});

test('폭 맞춤은 띠가 배율에 비례하므로 (쪽 폭 + 100% 띠 폭) 에 열 수를 곱해 나눈다', () => {
  // containerWidth 1000, 프레임 여백 40, 2열, gap 10, 쪽 400, 띠(100%) 100
  assert.equal(fitWidthZoomWithBand({ containerWidth: 1000, pageWidth: 400, columns: 2, pageGap: 10, bandAt100: 100 }), (1000 - 40 - 10) / ((400 + 100) * 2));
  // 띠 0 이면 기존 식과 같다
  assert.equal(fitWidthZoomWithBand({ containerWidth: 1000, pageWidth: 400, columns: 2, pageGap: 10, bandAt100: 0 }), (1000 - 40 - 10) / (400 * 2));
});
