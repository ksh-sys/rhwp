/**
 * 링크 복사 — 순수 폴백 체인(환경 주입).
 * navigator.clipboard.writeText → document.execCommand('copy') → 사용자가 직접 복사.
 */

export interface ClipboardEnv {
  writeText?: (text: string) => Promise<void>;
  execCopy?: (text: string) => boolean;
}

export type CopyResult = 'clipboard' | 'execCommand' | 'manual';

export async function copyText(text: string, env: ClipboardEnv): Promise<CopyResult> {
  if (env.writeText) {
    try {
      await env.writeText(text);
      return 'clipboard';
    } catch {
      /* 권한 거부·비보안 문맥 — 다음 방법 */
    }
  }
  try {
    if (env.execCopy?.(text)) return 'execCommand';
  } catch {
    /* 무시 */
  }
  return 'manual';
}

/** 브라우저 환경 — 숨긴 textarea 로 execCommand('copy') 폴백 */
export function browserClipboardEnv(): ClipboardEnv {
  const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  return {
    writeText: clip?.writeText ? (text) => clip.writeText(text) : undefined,
    execCopy: (text) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        return document.execCommand('copy');
      } finally {
        ta.remove();
      }
    },
  };
}
