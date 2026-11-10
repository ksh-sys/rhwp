/**
 * 보기 전용(view) 모드 명령 정책 — 허용 목록 방식.
 *
 * 양식 모드는 "막을 것"을 나열하지만, 보기 전용은 새 명령이 생겨도 기본이 차단이어야
 * 공유 문서가 실수로 바뀌지 않는다. 그래서 읽기·내려받기·표시 명령만 여기 적는다.
 * (dispatcher.ts 는 생성자 매개변수 속성이 있어 node:test 로 못 불러오므로 순수 모듈로 뗀다.)
 */

const VIEW_MODE_ALLOWED_IDS = new Set([
  'file:open',
  'file:open-recent',
  'file:clear-recent',
  'file:save-as',
  'file:about',
  'edit:copy',
  'edit:select-all',
  'edit:find',
  'edit:find-again',
  'edit:goto',
  'edit:document-history',
  'tool:options',
  'review:memo-show',
  'review:memo-guide',
  'review:memo-list',
  'review:memo-prev',
  'review:memo-next',
]);

const VIEW_MODE_ALLOWED_PREFIXES = [
  'view:',
  'file:save-as-',
  'file:print',
  'file:export-',
  'file:share-',
  'ext:',
];

/** 보기 전용 모드에서도 막아야 하는 `view:` 명령 — 양식 모드로 바꾸면 편집이 열린다 */
const VIEW_MODE_BLOCKED_IDS = new Set(['view:form-mode']);

export function isBlockedInViewMode(commandId: string): boolean {
  if (VIEW_MODE_BLOCKED_IDS.has(commandId)) return true;
  if (VIEW_MODE_ALLOWED_IDS.has(commandId)) return false;
  return !VIEW_MODE_ALLOWED_PREFIXES.some((prefix) => commandId.startsWith(prefix));
}
