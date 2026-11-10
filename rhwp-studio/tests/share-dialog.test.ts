import test from 'node:test';
import assert from 'node:assert/strict';
import { expiresAtFrom, shareFileName } from '../src/share/share-expiry.ts';
import { copyText } from '../src/share/clipboard.ts';
import { chipModel } from '../src/share/share-banner.ts';
import { buildShareUrl } from '../src/share/share-link.ts';
import type { SessionState } from '../src/share/share-session.ts';
import type { ShareMeta } from '../src/share/provider.ts';

const DAY = 86_400_000;
const TOK = '0123456789abcdef0123456789abcdef';
const t = (key: string, p?: Record<string, unknown>) => (p ? `${key}|${Object.entries(p).map(([k, v]) => `${k}=${v}`).join(',')}` : key);

test('만료 선택 → 시각: 없음·7일·30일·날짜(그날 끝)', () => {
  const now = Date.UTC(2026, 10, 10, 3, 0, 0);
  assert.equal(expiresAtFrom('none', now), null);
  assert.equal(expiresAtFrom('7d', now), now + 7 * DAY);
  assert.equal(expiresAtFrom('30d', now), now + 30 * DAY);
  assert.equal(expiresAtFrom('date', now, '2026-11-20'), new Date(2026, 10, 20, 23, 59, 59, 999).getTime());
  assert.equal(expiresAtFrom('date', now, ''), null);
  assert.equal(expiresAtFrom('date', now, 'nope'), null);
});

test('공유본 파일 이름은 .hwpx 로', () => {
  assert.equal(shareFileName('보고서.hwp'), '보고서.hwpx');
  assert.equal(shareFileName('보고서.HWPX'), '보고서.hwpx');
  assert.equal(shareFileName('문서.hml'), '문서.hwpx');
  assert.equal(shareFileName('이름없음'), '이름없음.hwpx');
});

test('링크 문자열', () => {
  assert.equal(buildShareUrl('https://h/hwpx/', TOK), `https://h/hwpx/?share=${TOK}`);
});

test('클립보드 — writeText → execCommand → 직접 복사 순으로 물러난다', async () => {
  assert.equal(await copyText('x', { writeText: async () => {}, execCopy: () => true }), 'clipboard');
  assert.equal(await copyText('x', { writeText: async () => { throw new Error('denied'); }, execCopy: () => true }), 'execCommand');
  assert.equal(await copyText('x', { execCopy: () => true }), 'execCommand');
  assert.equal(await copyText('x', { writeText: async () => { throw new Error('denied'); }, execCopy: () => false }), 'manual');
  assert.equal(await copyText('x', {}), 'manual');
});

function meta(over: Partial<ShareMeta> = {}): ShareMeta {
  return { token: TOK, name: 'a.hwpx', access: 'edit', expiresAt: null, revoked: false, version: 4, byteSize: 3, lock: null, ...over };
}

test('상태 칩 — 공유 중 · v번호 · 권한 · 만료', () => {
  assert.equal(chipModel({ kind: 'idle' }, t), null);
  assert.equal(chipModel({ kind: 'gone', token: TOK }, t), null);
  const open = (m: ShareMeta, base = m.version): SessionState => ({ kind: 'open', token: TOK, meta: m, role: 'editor', lockHeld: true, baseVersion: base, dirty: false, by: 'a#b', adminKey: 'k' });
  assert.equal(chipModel(open(meta()), t)!.text, 'share.chip.text|p1=4,p2=share.chip.edit');
  const exp = new Date(2026, 11, 31, 23, 59).getTime();
  assert.equal(chipModel(open(meta({ access: 'view', expiresAt: exp })), t)!.text, 'share.chip.text|p1=4,p2=share.chip.view share.chip.until|p1=12/31');
  assert.equal(chipModel(open(meta()), t)!.manageable, true);
});
