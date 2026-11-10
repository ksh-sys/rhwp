/**
 * 파일 ▸ 링크로 공유… / 공유 관리… — 공유 제공자가 있을 때만 보이고 실행된다.
 * 저장소는 제공자 모듈이 맡고, 여기서는 대화상자를 열어 런타임에 넘긴다.
 */
import type { CommandDef, CommandServices } from '../types';
import { exportDocumentWithReportForFormat } from '@/command/save-document-format';
import { getShareRuntime } from '@/share/share-runtime';
import { ShareLinkDialog } from '@/share/share-dialog';
import { ShareManageDialog } from '@/share/share-manage-dialog';
import { shareFileName } from '@/share/share-expiry';
import { browserClipboardEnv, copyText } from '@/share/clipboard';
import { showToast } from '@/ui/toast';
import { t } from '../../i18n/index.ts';

/** 공유본 바이트 — 지연된 쪽 나눔을 마무리하고 HWPX 로 내보낸다 */
function currentHwpxBytes(services: CommandServices): Uint8Array {
  services.getInputHandler()?.flushDeferredPaginationIfNeeded('share');
  return exportDocumentWithReportForFormat(services.wasm, 'hwpx').bytes;
}

const copy = (text: string) => copyText(text, browserClipboardEnv());

function activeShareState() {
  const st = getShareRuntime()?.session?.state;
  return st && (st.kind === 'open' || st.kind === 'conflict') ? st : null;
}

export const shareCommands: CommandDef[] = [
  {
    id: 'file:share-link',
    label: t('command.file.shareLink.label'),
    opensDialog: true,
    canExecute: (ctx) => ctx.hasDocument && !!getShareRuntime()?.available,
    execute(services) {
      void (async () => {
        const rt = getShareRuntime();
        if (!rt) return;
        // 이미 공유 중인 문서면 새로 만들지 않고 지금 링크를 복사한다
        if (activeShareState()) {
          await rt.copyLink();
          return;
        }
        const provider = await rt.getProvider();
        if (!provider) {
          showToast({ message: t('share.noProvider.text') });
          return;
        }
        const can = await provider.canCreate().catch(() => ({ ok: false as const, loginUrl: undefined }));
        if (!can.ok) {
          const loginUrl = can.loginUrl;
          showToast({
            message: t('share.loginRequired.text'),
            action: loginUrl ? { label: t('share.login.action'), onClick: () => { window.open(loginUrl, '_blank', 'noopener'); } } : undefined,
          });
          return;
        }
        const name = shareFileName(services.wasm.fileName);
        new ShareLinkDialog({
          fileName: name,
          create: (settings) => rt.createFromCurrentDocument(currentHwpxBytes(services), name, settings),
          copy,
        }).show();
      })();
    },
  },
  {
    id: 'file:share-manage',
    label: t('command.file.shareManage.label'),
    opensDialog: true,
    canExecute: (ctx) => ctx.hasDocument && activeShareState() != null,
    execute() {
      const rt = getShareRuntime();
      const st = activeShareState();
      if (!rt || !st) return;
      if (!st.adminKey) {
        showToast({ message: t('share.manage.noAdminKey.text') });
        return;
      }
      const adminKey = st.adminKey;
      new ShareManageDialog({
        url: rt.shareUrl(st.token),
        adminUrl: rt.adminUrl(st.token, adminKey),
        meta: st.meta,
        copy,
        listVersions: () => rt.provider!.listVersions(st.token),
        apply: (settings) => rt.updateSettings(settings),
        restore: (version) => rt.restoreVersion(version),
        revoke: () => rt.revoke(),
      }).show();
    },
  },
];
