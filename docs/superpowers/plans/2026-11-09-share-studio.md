# 링크 공유 — 스튜디오(포크) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 편집기 안에서 「파일 ▸ 링크로 공유…」로 공유 링크를 만들고, `?share=<토큰>` 링크로 연 사람이 로그인 없이 보거나(권한 「보기」) 고쳐 저장(권한 「편집」)하면 같은 링크가 최신본이 되게 한다 — 저장소 구현은 외부 **공유 제공자(provider) 모듈**에 맡기고, 스튜디오는 제공자 로더·세션(잠금·구독·충돌)·UI만 갖는다.

**Architecture:** 빌드 환경변수 `RHWP_SHARE_PROVIDER` 가 있으면 `<meta name="rhwp-share-provider">` 가 index.html 에 박히고, 기동 시 그 ES 모듈을 `import()` 한다(없으면 공유 메뉴 숨김). `ShareSession`(순수 상태 기계)이 열기·잠금·심장박동·버전 구독·저장·충돌을 다루고, `file:save` 는 세션이 살아 있으면 제공자 저장으로 분기한다. 「보기」 권한·남이 편집 중이면 새 편집 모드 `'view'` 로 입력을 막는다.

**Tech Stack:** vanilla TypeScript + Vite · node:test(`.ts` 직접 실행, 순수 모듈은 `@/` 금지)

**Spec:** `D:\04. claud code\02. 클로드 작업실\07_회원사 관리\docs\superpowers\specs\2026-11-08-hwp-link-share-design.md` (§4.1 제공자 인터페이스, §4.5 잠금·갱신 흐름, §4.10 포크 변경 범위)

## Global Constraints

- 공개 포크: 조직 이름·도메인·Firebase 설정을 소스·i18n·문서 어디에도 넣지 않는다. 제공자가 없으면 편집기 동작이 전과 같다(메뉴 숨김, 콘솔 info 한 줄).
- `window.rhwpStudio` 객체의 첫 키는 `notifySaved` 유지(tests/embed-protocol.test.ts). `main.ts` 시작 순서 문자열 `await loadFromUrlParam();` → `if (chromeMode !== 'embed') await offerAutosaveRecoveryIfIdle();` → `await openBlankDocumentIfIdle();` 는 그대로 두고 사이에 끼운다(tests/startup-blank-document·chrome-mode).
- 다이얼로그를 여는 명령 블록은 `opensDialog: true` + 블록 안에서 `new …Dialog(` 직접 생성(tests/dialog-policy-ledger).
- 새 모듈이 wasm 에 부르는 것은 `exportHwpx()`·`loadDocument` 경로뿐(뮤테이터 아님) — 변이 가드 등록 불필요.
- 토큰 형식: 16바이트 난수 hex 32자(07 기존 `reportShares` 와 동일 — 설계서의 base64url 22자 대신, 같은 128비트). 관리키도 hex 32자, URL **fragment** `#admin=` 로만.
- 상수: 심장박동 60초, 잠금 만료 30분(무동작), 파일 상한 20MB.
- 커밋 메시지 끝: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **제공자 모듈이 없거나 import 가 실패(404·CSP)** — 편집기가 평소처럼 떠야 한다. 기대: 공유 메뉴 숨김, 다른 기능 영향 없음(Task 1 시험).
2. **「편집」 링크를 두 사람이 동시에 열고 한쪽이 30분 넘게 자리 비움** — 뒤 사람이 이어서 편집 가능해야 하고, 앞 사람이 돌아와 저장하면 **거부**돼야 한다. 기대: 충돌 안내 + 내려받기(Task 3 상태 기계 시험).
3. **저장 중 네트워크 실패** — 문서가 dirty 로 남고 다시 저장할 수 있어야 한다. 기대: 오류 토스트, `markClean` 안 함(Task 5 시험).
4. **`?share=` 로 열었는데 토큰이 만료·회수** — 빈 문서로 떨어지거나 복구 대화상자가 뜨면 안 된다. 기대: "이 공유는 끝났습니다" 한 줄 화면(Task 4 시험).
5. **보기 전용에서 IME 로 한글 타이핑** — 글자가 들어가면 안 된다(기록만 막는 게 아니라 입력 진입점에서 막아야 함). 기대: 아무 변화 없음(Task 2 수동 확인 + 진입점 소스 시험).

---

### Task 1: 제공자 인터페이스·로더·빌드 메타

**Files:**
- Create: `rhwp-studio/src/share/provider.ts`(타입만), `rhwp-studio/src/share/provider-loader.ts`
- Modify: `rhwp-studio/vite.config.ts`(78행 `plugins: [...]`에 `share-provider-meta` 플러그인), `rhwp-studio/src/vite-env.d.ts`(필요 시)
- Test: `rhwp-studio/tests/share-provider-loader.test.ts`

**Interfaces:**
- Produces (`provider.ts`, 상대 import 전용):
  ```ts
  export type ShareAccess = 'view' | 'edit';
  export interface ShareSettings { access: ShareAccess; expiresAt: number | null }
  export interface ShareLock { by: string; since: number; heartbeatAt: number }
  export interface ShareMeta { token: string; name: string; access: ShareAccess; expiresAt: number | null; revoked: boolean; version: number; byteSize: number; lock: ShareLock | null; createdBy?: { name: string } }
  export interface ShareOpenResult { meta: ShareMeta; bytes: Uint8Array }
  export interface ShareVersion { version: number; createdAt: number; by: string; byteSize: number }
  export class ShareConflictError extends Error { constructor(public readonly serverVersion: number) }
  export class ShareGoneError extends Error {}            // 만료·회수·없음
  export class ShareAuthRequiredError extends Error {}    // 만들기에 로그인 필요
  export interface ShareProvider {
    create(bytes: Uint8Array, name: string, settings: ShareSettings): Promise<{ token: string; adminKey: string }>;
    open(token: string): Promise<ShareOpenResult>;
    save(token: string, bytes: Uint8Array, baseVersion: number, by: string): Promise<{ version: number }>;
    watch(token: string, cb: (meta: ShareMeta) => void): () => void;
    lock(token: string, by: string): Promise<boolean>;
    heartbeat(token: string, by: string): Promise<boolean>;
    unlock(token: string, by: string): Promise<void>;
    updateSettings(token: string, adminKey: string, settings: Partial<ShareSettings>): Promise<void>;
    revoke(token: string, adminKey: string): Promise<void>;
    listVersions(token: string): Promise<ShareVersion[]>;
    openVersion(token: string, version: number): Promise<Uint8Array>;
    /** 만들기 가능 여부(직원 세션 유무). 없으면 만들기 메뉴는 안내로 바뀐다 */
    canCreate(): Promise<{ ok: true; by: string } | { ok: false; loginUrl?: string }>;
  }
  ```
- Produces (`provider-loader.ts`): `export function providerUrlFromDocument(doc: { querySelector(sel: string): { getAttribute(n: string): string | null } | null }, baseURI: string): string | null` (메타 없으면 null, 상대 경로는 `new URL(content, baseURI).href`), `export async function loadShareProvider(url: string, importer: (u: string) => Promise<unknown> = (u) => import(/* @vite-ignore */ u)): Promise<ShareProvider | null>` — 모듈의 `default` 또는 `createShareProvider()` 를 받아 `isShareProvider()`(필수 메서드 12개 함수 검사)에 통과하면 반환, 아니면 null 과 `console.info`.
- vite 플러그인: `process.env.RHWP_SHARE_PROVIDER` 가 있으면 `{ tag:'meta', attrs:{ name:'rhwp-share-provider', content }, injectTo:'head' }`.

- [ ] **Step 1: 실패하는 시험** — `providerUrlFromDocument` 메타 없음→null / `./share-provider.js` + base `https://h/hwpx/` → `https://h/hwpx/share-provider.js`; `loadShareProvider` 가짜 importer: 12개 메서드 있는 객체→반환, 일부 없음→null, importer 가 throw→null; `vite.config.ts` 소스에 `rhwp-share-provider` 와 `RHWP_SHARE_PROVIDER` 포함.
- [ ] **Step 2: RED 확인** — `node --test tests/share-provider-loader.test.ts`
- [ ] **Step 3: 구현.** — [ ] **Step 4: GREEN + `npm test` 전체.** — [ ] **Step 5: Commit** `feat(studio): 공유 제공자 인터페이스·로더·빌드 메타`

### Task 2: 보기 전용 편집 모드 `'view'`

**Files:**
- Modify: `rhwp-studio/src/command/types.ts`(7행 `EditorEditMode`에 `'view'`; `CommandFailure`에 `'view-mode'`), `rhwp-studio/src/command/dispatcher.ts`(`FORM_MODE_BLOCKED_*` 옆에 `VIEW_MODE_ALLOWED_PREFIXES`: 허용 목록 방식 — `view:`, `file:open`, `file:save-as*`, `file:print*`, `file:export*`, `edit:copy`, `edit:select-all`, `edit:find*`, `edit:document-history`, `tool:options`, `review:memo-show|guide|list`, `ext:`), `rhwp-studio/src/engine/input-handler.ts`(`isViewMode()`, `isOperationAllowedInEditMode` 에서 view 면 `record` 포함 전부 거부 + `console.warn` 1회), 진입점 가드 `this.isFormMode?.()` 가 있는 자리마다 `|| this.isViewMode?.()`: `input-handler-text.ts` 127·293·365, `input-handler-keyboard.ts` 89·637·1456·1473·1570·1658·1677·1926·1964, `input-handler.ts` 739·5018·5591·5598·5646, `onPaste`/`onCut`/drop(`main.ts` 1136–1148: view 면 문서 교체 금지)
- Modify: `rhwp-studio/src/main.ts` `setEditMode` (271–281행)에서 `'view'` 면 `#sb-mode` 문구 `ui.sbMode.view`("보기 전용"), `data-edit-mode="view"` → `src/styles/editor.css` 에 `[data-edit-mode="view"] #style-bar, [data-edit-mode="view"] .tb-tab-panel { opacity:.55; pointer-events:none }` (메뉴는 살림)
- Test: `rhwp-studio/tests/view-mode.test.ts`

**Interfaces:**
- Produces: `setEditMode('view' | 'normal')`(기존 CommandServices.setEditMode), `InputHandler.isViewMode(): boolean`, dispatcher `isBlockedInViewMode(id)`.

- [ ] **Step 1: 실패하는 시험** — dispatcher 순수 함수 `isBlockedInViewMode('edit:cut') === true`, `('edit:copy') === false`, `('review:memo-insert') === true`, `('view:zoom-in') === false`; 소스 시험: 위 진입점 각 파일에 `isViewMode` 가 `isFormMode` 등장 수 이상 등장; `isOperationAllowedInEditMode` 본문에 `'view'` 분기.
- [ ] **Step 2: RED.** — [ ] **Step 3: 구현.** — [ ] **Step 4: GREEN + 전체 시험 + 수동**(개발 서버: `__inputHandler.setEditMode('view')` 뒤 타이핑·IME·붙여넣기·Backspace·표 명령이 모두 무효, 복사·스크롤·찾기·줌은 됨).
- [ ] **Step 5: Commit** `feat(studio): 보기 전용 편집 모드 view`

### Task 3: 공유 세션 상태 기계 (순수)

**Files:**
- Create: `rhwp-studio/src/share/share-session.ts`, `rhwp-studio/src/share/share-link.ts`
- Test: `rhwp-studio/tests/share-session.test.ts`, `rhwp-studio/tests/share-link.test.ts`

**Interfaces:**
- `share-link.ts`(순수): `export function parseShareLocation(search: string, hash: string): { token: string; adminKey: string | null } | null` (`?share=<hex32>` + `#admin=<hex32>`), `export function buildShareUrl(base: string, token: string): string`, `export function buildAdminUrl(base, token, adminKey)`, `export function isHexToken(s: string): boolean`(32 hex), `export const ADMIN_KEY_STORAGE_PREFIX = 'rhwp-share-admin:'`.
- `share-session.ts`(순수, 타이머·제공자 주입): 
  ```ts
  export type SessionState =
    | { kind: 'idle' }
    | { kind: 'opening'; token }
    | { kind: 'open'; token; meta: ShareMeta; role: 'editor' | 'viewer'; lockHeld: boolean; baseVersion: number; dirty: boolean; by: string; adminKey: string | null; lockedBy?: string; lockedSince?: number }
    | { kind: 'conflict'; token; meta; serverVersion: number }
    | { kind: 'gone'; token };
  export interface SessionDeps { provider: ShareProvider; now(): number; setInterval(fn, ms): unknown; clearInterval(h): void; by: string; onState(s: SessionState): void; onNewVersion(bytes: Uint8Array, meta: ShareMeta): void }
  export class ShareSession {
    constructor(deps: SessionDeps);
    get state(): SessionState;
    async open(token: string, adminKey: string | null): Promise<void>;   // provider.open → 권한·잠금 판정 → watch 구독 → 편집자면 lock 시도 + 60초 heartbeat
    noteActivity(): void;              // 사용자 입력 — heartbeat 계속 보낼지 판단(30분 무동작이면 heartbeat 중단)
    setDirty(dirty: boolean): void;
    async save(bytes: Uint8Array): Promise<'saved' | 'conflict' | 'failed'>;  // provider.save(baseVersion) → 성공 시 baseVersion 갱신
    async takeOver(): Promise<boolean>; // 잠금이 만료됐을 때 「이어서 편집」
    async close(): Promise<void>;       // unlock + watch 해제 + 타이머 정리
  }
  export function lockExpired(lock: ShareLock | null, now: number, ttlMs = 30*60_000): boolean;
  export function roleFor(meta: ShareMeta, by: string, now: number): 'editor' | 'viewer';  // access=='edit' && (lock 없음 || lock.by==by || 만료) → editor
  ```
  - watch 콜백: `meta.version > baseVersion` 이고 `!dirty` → `onNewVersion`(호출부가 다시 연다); dirty 면 상태만(`meta` 갱신) → UI 띠. `meta.revoked` 또는 만료 → `gone`. 잠금 주인이 바뀌면 role 재판정.
  - 저장 성공 뒤 `baseVersion = version`, `dirty=false`; `ShareConflictError` → `conflict`.

- [ ] **Step 1: 실패하는 시험**(가짜 제공자 + 가짜 타이머) — 열기: edit+잠금 없음→editor·lock 호출 1회·interval 등록; access view→viewer·lock 미호출; 남의 잠금(5분 전)→viewer; 남의 잠금 31분 전→editor(lockExpired); heartbeat: 타이머 틱마다 `heartbeat` 호출, 마지막 활동 30분 뒤엔 호출 안 함; watch 새 버전 & !dirty → onNewVersion; dirty → 상태만; revoked → gone; save 성공 → baseVersion 갱신; ConflictError → conflict; close → unlock·clearInterval; `parseShareLocation('?share=abc', '')` null(길이), 정상 32hex 통과, `#admin=` 파싱.
- [ ] **Step 2: RED.** — [ ] **Step 3: 구현.** — [ ] **Step 4: GREEN + 전체.** — [ ] **Step 5: Commit** `feat(studio): 공유 세션 상태 기계·링크 파서`

### Task 4: `?share=` 로 열기, 보기 전용/띠/끝난 공유 화면

**Files:**
- Create: `rhwp-studio/src/share/share-runtime.ts`(main 과 세션·UI 연결: `installShareRuntime({ provider, wasm, eventBus, loadBytes, setEditMode, documentState, getInputHandler, services })`), `rhwp-studio/src/share/share-banner.ts`, `rhwp-studio/src/share/share-name-dialog.ts`(이름 묻기 ModalDialog, localStorage `rhwp-share-name`), `rhwp-studio/src/styles/share.css`(`src/style.css` import)
- Modify: `rhwp-studio/src/main.ts`(기동: 로더 → `installShareRuntime`; `await loadFromUrlParam();` 다음 줄에 `await loadFromShareParam();`; `shouldSkipInitialAutosaveRecovery` 에 `|| params.has('share')`; `(window as any).rhwpStudio.share = runtime`(뒤에 덧붙임)), `rhwp-studio/index.html`(`</header>` 과 `<main>` 사이 `<div id="share-banner" hidden></div>`)
- Test: `rhwp-studio/tests/share-runtime.test.ts`(소스 시험: 삽입 위치·recovery 건너뜀·배너 DOM), `rhwp-studio/tests/share-banner.test.ts`(순수 문구 선택 함수)

**Interfaces:**
- `share-banner.ts`: `export function bannerModel(state: SessionState, t): { text: string; action?: { label: string; kind: 'takeover' | 'download' | 'reload' } } | null` — viewer(권한 view) → "보기 전용 — 내려받기는 가능합니다"; viewer(남이 편집 중) → "{name} 님이 편집 중입니다({n}분 전부터) — 저장하면 자동으로 새 버전이 열립니다"; 잠금 만료 → + [이어서 편집]; dirty 중 새 버전 → "다른 사람이 v{n}을 저장했습니다 — 내 수정본을 내려받아 두고 최신본을 여세요" + [내려받기][최신본 열기]; conflict → 같은 문구; gone → 전체 화면 안내 `#share-gone`.
- `loadFromShareParam()`: `parseShareLocation` → 없으면 return; 제공자 없으면 toast `share.noProvider.text`; `session.open` → `gone` 이면 빈 화면 안내(문서 안 열음, 복구·빈 문서 생략 — `openBlankDocumentIfIdle` 가 `pageCount>0` 아니면 빈 문서를 만드니, runtime 이 `shareGoneShown` 플래그를 두고 main 이 그 경우 건너뜀); 열리면 이름 없으면 이름 대화상자(기본 `localStorage`) → `loadBytes(bytes, meta.name, null, performance.now(), { skipRecent: true })` → 역할 viewer 면 `setEditMode('view')`.
- `onNewVersion` → `loadBytes` 다시(캐럿 위치 보존은 비목표) + 상태줄 `share.updated.text`.
- 사용자 활동 → `session.noteActivity()`: `document` capture `keydown`·`pointerdown`·`wheel` + `document-mutated`.
- `document-dirty-changed` → `session.setDirty(dirty)`.
- `pagehide`/`visibilitychange(hidden)` → `provider.unlock` 시도(베스트 에포트).

- [ ] **Step 1: 실패하는 시험** — `bannerModel` 5가지 상태 문구/액션; main.ts 소스: `await loadFromUrlParam();\n    await loadFromShareParam();` 순서, `params.has('share')`, `rhwpStudio.share =` 가 `notifySaved` 뒤; index.html 에 `id="share-banner"`.
- [ ] **Step 2: RED.** — [ ] **Step 3: 구현.** — [ ] **Step 4: GREEN + 전체 + 수동**(개발 서버에 **메모리 가짜 제공자**를 `public/share-provider.js` 로 두고 `RHWP_SHARE_PROVIDER=./share-provider.js` 로 dev 실행: `?share=` 열기, 보기 전용 띠, 편집 중 띠, 끝난 공유 화면).
- [ ] **Step 5: Commit** `feat(studio): ?share= 열기, 보기 전용·편집 중 띠, 끝난 공유 화면`

### Task 5: 저장 분기와 충돌 처리

**Files:**
- Modify: `rhwp-studio/src/command/commands/file.ts`(`saveCurrentDocument` 맨 앞: `const share = getActiveShareSession(); if (share?.state.kind === 'open' && share.state.role === 'editor') { … }`), `rhwp-studio/src/share/share-runtime.ts`(`getActiveShareSession()` export, `saveToShare(services)`), `rhwp-studio/src/command/types.ts`(`CommandServices.discardAutosaveDraft?: (reason: string) => Promise<void>` 추가 → main 에서 `autosaveManager.discardCurrentDraft`)
- Test: `rhwp-studio/tests/share-save.test.ts`

**Interfaces:**
- `saveToShare(services): Promise<SaveCurrentDocumentResult>`: `flushDeferredPaginationBeforeExplicitOutput(services,'save')` → `wasm.exportHwpx()` → 20MB 초과면 toast `share.tooLarge.text` + `'failed'` → `session.save(bytes)` → `'saved'` 면 `documentState.markClean('share-save')` + `discardAutosaveDraft` + 상태줄 `share.saved.text`(v{n}); `'conflict'` 면 띠(Task 4 conflict) + `'failed'`; 예외 → toast `share.saveFailed.text` + `'failed'`(dirty 유지).
- `file:save-as*`·HWP 저장은 분기하지 않는다(내려받기 그대로).
- viewer 상태에서 `file:save` 는 dispatcher view 모드에서 이미 차단.

- [ ] **Step 1: 실패하는 시험** — 가짜 services/session 으로 `saveToShare`: 성공→'saved'·markClean 호출·discard 호출; conflict→'failed'·markClean 미호출; throw→'failed'; 21MB→'failed'·provider.save 미호출; 소스: `saveCurrentDocument` 첫 분기에 `getActiveShareSession`.
- [ ] **Step 2: RED.** — [ ] **Step 3: 구현.** — [ ] **Step 4: GREEN + 전체 + 수동**(가짜 제공자로 Ctrl+S → 버전 증가·상태줄; 두 번째 탭에서 저장 → 첫 탭 자동 갱신; 첫 탭 dirty 상태에서 두 번째 탭 저장 → 띠·저장 거부).
- [ ] **Step 5: Commit** `feat(studio): 공유 세션 저장 분기·충돌 처리`

### Task 6: 「링크로 공유…」 대화상자, 공유 관리, 상태 칩, 메뉴

**Files:**
- Create: `rhwp-studio/src/share/share-dialog.ts`(만들기: 권한 라디오 편집(기본)/보기, 만료 없음(기본)/7일/30일/날짜, [링크 만들기] → 복사 + 공유 링크·관리 링크 표시), `rhwp-studio/src/share/share-manage-dialog.ts`(권한·만료 변경, 링크 복사, 버전 이력 목록 + [이 버전으로 되돌리기](= openVersion → 현재 문서로 열고 저장 = 새 버전), [공유 회수]), `rhwp-studio/src/share/share-chip.ts`(`#sb-share` 칩: `공유 중 · v{n} · 편집 가능|보기 · 만료 {d}`), `rhwp-studio/src/share/clipboard.ts`(순수 폴백 체인)
- Create: `rhwp-studio/src/command/commands/share.ts`(`file:share-link`(opensDialog, 제공자 있을 때만 canExecute; `canCreate()` 실패면 toast `share.loginRequired.text` + 로그인 열기 액션), `file:share-manage`(세션 open 이고 adminKey 가 있을 때 — localStorage 또는 `#admin=`; 관리키가 없으면 안내 토스트 「관리 링크로 열거나 관리사이트에서 관리하세요」))
- Modify: `rhwp-studio/index.html`(파일 메뉴 41–43행 근처 `file:share-link`·`file:share-manage` 항목; 상태줄 `#sb-share` 버튼 `hidden`), `rhwp-studio/src/main.ts`(`registry.registerAll(shareCommands)`; `EMBED_HIDDEN_FILE_COMMAND_IDS` 에 둘 추가), `rhwp-studio/src/ui/ribbon-tabs.ts`(파일 탭은 menuOnly 라 변경 없음), i18n ko/en(`command.file.shareLink.label` "링크로 공유…", `command.file.shareManage.label` "공유 관리…", `dialog.share.*`, `share.*`)
- Test: `rhwp-studio/tests/share-dialog.test.ts`(순수: 만료 선택→timestamp, 링크 문자열, 클립보드 폴백 순서), `rhwp-studio/tests/share-commands.test.ts`(소스: id·메뉴·embed 숨김·dialog-policy)

**Interfaces:**
- `createShareFromCurrentDocument(services, settings): Promise<{ token; adminKey; url; adminUrl }>` — `exportHwpx()` → `provider.create(bytes, wasm.fileName, settings)` → `localStorage[ADMIN_KEY_STORAGE_PREFIX+token]=adminKey` → 세션 open(token, adminKey) → 칩 표시 → URL 복사.
- 공유 링크 base = `new URL('.', location.href)`(= `/hwpx/`), 형식 `?share=<token>`.
- `expiresAtFrom(choice: 'none'|'7d'|'30d'|'date', now: number, date?: string): number | null`.

- [ ] **Step 1: 실패하는 시험** — `expiresAtFrom` 4가지; `buildShareUrl('https://h/hwpx/', tok)`; 클립보드 폴백: `writeText` 성공→'clipboard', 실패+execCommand 성공→'execCommand', 둘 다 실패→'manual'; 소스: share.ts 에 두 id + `opensDialog: true` + `new ShareLinkDialog(`; index.html 에 두 `data-cmd` 와 `id="sb-share"`; `EMBED_HIDDEN_FILE_COMMAND_IDS` 포함; i18n 키 ko/en.
- [ ] **Step 2: RED.** — [ ] **Step 3: 구현.** — [ ] **Step 4: GREEN + 전체 + 수동**(가짜 제공자: 링크 만들기 → 칩·복사 토스트 → 새 탭에서 열기 → 공유 관리에서 보기로 바꾸면 새 탭이 보기 전용으로 전환 → 회수하면 새 탭이 "끝난 공유").
- [ ] **Step 5: Commit** `feat(studio): 링크로 공유 대화상자·공유 관리·상태 칩`

### Task 7: 메모리 가짜 제공자(개발·시험용)와 문서

**Files:**
- Create: `rhwp-studio/public/share-provider.dev.js`(BroadcastChannel 로 탭 간 동기화하는 메모리 제공자 — dev 전용, 빌드 산출물엔 안 들어가도록 `vite.config.ts` 의 PWA globIgnores 에 추가), `rhwp-studio/docs/share-provider.md`(제공자 계약 — 조직 언급 없음)
- Modify: 호스트 쪽 개발 서버 launch 설정(`rhwp-studio-dev` 에 `RHWP_SHARE_PROVIDER=./share-provider.dev.js` 환경변수 — 가능하면; 아니면 dev 에서만 `?shareProvider=` 쿼리로 로더 URL 지정 허용)
- Test: `rhwp-studio/tests/share-dev-provider.test.ts`(계약 검사: `isShareProvider(devProvider)`; create→open 왕복; save 충돌)

- [ ] **Step 1~5: RED → 구현 → GREEN → Commit** `chore(studio): 개발용 메모리 공유 제공자·계약 문서`

### Task 8: 빌드·설치 연동 확인(07 계획과 접점)

- 스튜디오를 `RHWP_SHARE_PROVIDER=./share-provider.js RHWP_BASE=/hwpx/` 로 빌드하면 index.html 에 메타가 들어가는지 확인(`grep rhwp-share-provider dist/index.html`). 07 쪽 제공자 파일은 **07 계획**(`2026-11-09-share-backend.md`)이 만든다. 이 계획은 여기서 끝 — 배포 없음.
- [ ] Commit 없음(확인만). 07 계획 Task 5 에서 설치·통합 검증.
