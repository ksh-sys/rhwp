import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { saveToShare, shouldSaveToShare, SHARE_MAX_BYTES, type ShareSaveDeps } from '../src/share/share-save.ts';
import type { SessionState } from '../src/share/share-session.ts';
import type { ShareMeta } from '../src/share/provider.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(here, '..', rel), 'utf8');
const TOK = '0123456789abcdef0123456789abcdef';

function meta(): ShareMeta {
  return { token: TOK, name: 'a.hwpx', access: 'edit', expiresAt: null, revoked: false, version: 1, byteSize: 3, lock: null };
}
function editorState(over: Record<string, unknown> = {}): SessionState {
  return { kind: 'open', token: TOK, meta: meta(), role: 'editor', lockHeld: true, baseVersion: 1, dirty: true, by: '나#a', adminKey: null, ...over } as SessionState;
}

function deps(result: 'saved' | 'conflict' | 'failed' | 'throw', bytes = new Uint8Array(10)) {
  const log: string[] = [];
  let state = editorState();
  const d: ShareSaveDeps = {
    session: {
      get state() { return state; },
      async save(b: Uint8Array) {
        log.push(`save:${b.length}`);
        if (result === 'throw') throw new Error('boom');
        if (result === 'saved') state = editorState({ baseVersion: 2, dirty: false });
        return result;
      },
    },
    prepare: () => log.push('prepare'),
    exportBytes: () => { log.push('export'); return bytes; },
    markClean: (r) => log.push(`clean:${r}`),
    notify: (m) => log.push(`notify:${m}`),
    toast: (m) => log.push(`toast:${m}`),
    t: (k, p) => (p ? `${k}|${Object.values(p).join(',')}` : k),
  };
  return { d, log };
}

test('shouldSaveToShare — 열린 공유의 편집자일 때만', () => {
  assert.equal(shouldSaveToShare({ kind: 'idle' }), false);
  assert.equal(shouldSaveToShare(editorState()), true);
  assert.equal(shouldSaveToShare(editorState({ role: 'viewer', lockHeld: false })), false);
  assert.equal(shouldSaveToShare({ kind: 'conflict', token: TOK, meta: meta(), serverVersion: 2, adminKey: null }), false);
});

test('성공 — 준비·내보내기·저장 후 clean, 상태줄에 새 버전', async () => {
  const { d, log } = deps('saved');
  assert.equal(await saveToShare(d), 'saved');
  assert.deepEqual(log, ['prepare', 'export', 'save:10', 'clean:share-save', 'notify:share.saved.text|2']);
});

test('충돌 — failed, clean 하지 않음(띠가 안내)', async () => {
  const { d, log } = deps('conflict');
  assert.equal(await saveToShare(d), 'failed');
  assert.ok(!log.some((l) => l.startsWith('clean')));
  assert.ok(!log.some((l) => l.startsWith('toast')));
});

test('저장 실패·예외 — failed, 오류 토스트, dirty 유지', async () => {
  for (const r of ['failed', 'throw'] as const) {
    const { d, log } = deps(r);
    assert.equal(await saveToShare(d), 'failed');
    assert.ok(log.includes('toast:share.saveFailed.text'), r);
    assert.ok(!log.some((l) => l.startsWith('clean')), r);
  }
});

test('20MB 초과 — 제공자에 보내지 않고 failed', async () => {
  const big = new Uint8Array(SHARE_MAX_BYTES + 1);
  const { d, log } = deps('saved', big);
  assert.equal(await saveToShare(d), 'failed');
  assert.ok(log.includes('toast:share.tooLarge.text'));
  assert.ok(!log.some((l) => l.startsWith('save:')));
});

test('saveCurrentDocument 첫 분기가 공유 세션 저장이고, 문구 키가 ko/en 에 있다', () => {
  const file = read('src/command/commands/file.ts');
  const fn = file.slice(file.indexOf('export async function saveCurrentDocument'), file.indexOf('export async function saveCurrentDocument') + 2000);
  assert.ok(fn.indexOf('getActiveShareSession') > 0);
  assert.ok(fn.indexOf('getActiveShareSession') < fn.indexOf('resolveSaveTarget'));
  for (const loc of ['ko', 'en']) {
    const src = read(`src/i18n/locales/${loc}.ts`);
    for (const k of ['share.saved.text', 'share.saveFailed.text', 'share.tooLarge.text']) assert.ok(src.includes(`"${k}"`), `${loc}: ${k}`);
  }
});


test('잠금을 빼앗겨 저장 못 함 — failed, 전용 안내(다른 이름으로 저장 권유), clean 하지 않음', async () => {
  const log: string[] = [];
  const d: ShareSaveDeps = {
    session: { get state() { return editorState(); }, async save() { return 'lost-lock' as const; } },
    prepare: () => {}, exportBytes: () => new Uint8Array(3),
    markClean: (r) => log.push(`clean:${r}`), notify: (m) => log.push(`notify:${m}`), toast: (m) => log.push(`toast:${m}`),
    t: (k) => k,
  };
  assert.equal(await saveToShare(d), 'failed');
  assert.deepEqual(log, ['toast:share.lockLost.text']);
});
