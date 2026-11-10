import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseShareLocation, buildShareUrl, buildAdminUrl, isHexToken, ADMIN_KEY_STORAGE_PREFIX,
  lockOwnerId, displayNameOf,
} from '../src/share/share-link.ts';

const TOK = '0123456789abcdef0123456789abcdef';
const KEY = 'fedcba9876543210fedcba9876543210';

test('isHexToken — 32자 16진수만', () => {
  assert.equal(isHexToken(TOK), true);
  assert.equal(isHexToken(TOK.toUpperCase()), true);
  assert.equal(isHexToken('abc'), false);
  assert.equal(isHexToken(TOK + '0'), false);
  assert.equal(isHexToken('g' + TOK.slice(1)), false);
});

test('parseShareLocation — ?share= 와 #admin= 를 읽는다', () => {
  assert.equal(parseShareLocation('?share=abc', ''), null);
  assert.equal(parseShareLocation('', ''), null);
  assert.deepEqual(parseShareLocation(`?share=${TOK}`, ''), { token: TOK, adminKey: null });
  assert.deepEqual(parseShareLocation(`?x=1&share=${TOK.toUpperCase()}`, `#admin=${KEY}`), { token: TOK, adminKey: KEY });
  assert.deepEqual(parseShareLocation(`?share=${TOK}`, '#admin=zz'), { token: TOK, adminKey: null });
});

test('buildShareUrl / buildAdminUrl — 기존 쿼리·해시를 지우고 토큰만 남긴다', () => {
  assert.equal(buildShareUrl('https://h/hwpx/', TOK), `https://h/hwpx/?share=${TOK}`);
  assert.equal(buildShareUrl('https://h/hwpx/?url=x#y', TOK), `https://h/hwpx/?share=${TOK}`);
  assert.equal(buildAdminUrl('https://h/hwpx/', TOK, KEY), `https://h/hwpx/?share=${TOK}#admin=${KEY}`);
  assert.equal(ADMIN_KEY_STORAGE_PREFIX, 'rhwp-share-admin:');
});

test('잠금 주인 표기 — 이름#탭ID, 화면에는 이름만', () => {
  assert.equal(lockOwnerId('김성환', 'a1b2c3'), '김성환#a1b2c3');
  assert.equal(displayNameOf('김성환#a1b2c3'), '김성환');
  assert.equal(displayNameOf('이름#에#샵#a1b2c3'), '이름#에#샵');
  assert.equal(displayNameOf('그냥이름'), '그냥이름');
});
