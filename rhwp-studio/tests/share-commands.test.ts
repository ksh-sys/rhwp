import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { EMBED_HIDDEN_SHARE_COMMAND_IDS } from '../src/ui/chrome-mode.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const IDS = ['file:share-link', 'file:share-manage'];

test('공유 명령 2개 — 대화상자를 직접 열고 opensDialog 표기', () => {
  const src = read('src/command/commands/share.ts');
  for (const id of IDS) assert.ok(src.includes(`id: '${id}'`), id);
  assert.equal(src.split('opensDialog: true').length - 1, 2);
  assert.match(src, /new ShareLinkDialog\(/);
  assert.match(src, /new ShareManageDialog\(/);
});

test('파일 메뉴 항목·상태 칩 자리가 있고 처음에는 숨겨져 있다(제공자가 있을 때만 보임)', () => {
  const html = read('index.html');
  for (const id of IDS) assert.match(html, new RegExp(`data-cmd="${id}"[^>]*data-share-ui[^>]*hidden`), id);
  assert.match(html, /id="sb-share"[^>]*data-share-ui[^>]*hidden/);
  assert.match(read('src/styles/share.css'), /\[data-share-ui\]\[hidden\]/);
});

test('embed 프로파일에서는 공유 명령을 등록하지 않고 메뉴에서도 지운다', () => {
  assert.deepEqual([...EMBED_HIDDEN_SHARE_COMMAND_IDS], IDS);
  const main = read('src/main.ts');
  assert.match(main, /if \(chromeMode !== 'embed'\) registry\.registerAll\(shareCommands\);/);
  assert.match(main, /\.\.\.EMBED_HIDDEN_SHARE_COMMAND_IDS/);
});

test('공유 i18n 키가 ko/en 에 모두 있다', () => {
  const keys = [
    'command.file.shareLink.label', 'command.file.shareManage.label',
    'dialog.share.title', 'dialog.share.access.label', 'dialog.share.access.edit', 'dialog.share.access.view',
    'dialog.share.expiry.label', 'dialog.share.expiry.none', 'dialog.share.expiry.7d', 'dialog.share.expiry.30d',
    'dialog.share.expiry.date', 'dialog.share.create', 'dialog.share.copy', 'dialog.share.link.label',
    'dialog.share.adminHint', 'dialog.share.close', 'dialog.share.creating',
    'dialog.shareManage.title', 'dialog.shareManage.apply', 'dialog.shareManage.versions',
    'dialog.shareManage.restore', 'dialog.shareManage.revoke', 'dialog.shareManage.revokeConfirm',
    'dialog.shareManage.noVersions', 'dialog.shareManage.adminLink.label',
    'share.loginRequired.text', 'share.login.action', 'share.linkCopied.text', 'share.copyManual.text',
    'share.manage.noAdminKey.text', 'share.restored.text', 'share.restoreBlocked.text', 'share.revoked.text',
    'share.settingsSaved.text', 'share.actionFailed.text', 'share.badDate.text',
    'share.chip.text', 'share.chip.edit', 'share.chip.view', 'share.chip.until',
  ];
  for (const loc of ['ko', 'en']) {
    const src = read(`src/i18n/locales/${loc}.ts`);
    for (const key of keys) assert.ok(src.includes(`"${key}"`), `${loc}: ${key}`);
  }
});

test('공개 포크 — 공유 소스·개발 제공자에 조직 이름·도메인이 없다', () => {
  const files = [
    ...readdirSync(path.join(root, 'src/share')).map((f) => `src/share/${f}`),
    'src/command/commands/share.ts',
    'public/share-provider.dev.js',
  ];
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /kossa|협회|firebase/i, f);
  }
});
