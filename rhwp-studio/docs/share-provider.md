# 링크 공유 제공자(Share Provider) 계약

rhwp-studio 의 「파일 ▸ 링크로 공유…」는 저장소를 직접 갖지 않는다. 배포하는 쪽이 **공유 제공자**
ES 모듈을 하나 만들어 편집기 옆에 두면, 편집기가 그 모듈로 공유본을 만들고·열고·저장한다.
제공자가 없으면 공유 메뉴와 상태 칩이 숨겨지고 편집기는 이전과 똑같이 동작한다.

## 연결 방법

1. 제공자 모듈을 빌드해 편집기와 같은 경로(예: `share-provider.js`)에 둔다.
2. 편집기를 빌드할 때 `RHWP_SHARE_PROVIDER` 환경변수로 그 주소를 알려 준다.

   ```bash
   RHWP_BASE=/editor/ RHWP_SHARE_PROVIDER=./share-provider.js npm run build
   ```

   빌드된 `index.html` 의 `<head>` 에 `<meta name="rhwp-share-provider" content="./share-provider.js">`
   가 들어가고, 편집기는 시작할 때 이 모듈을 백그라운드에서 `import()` 한다.
3. 제공자 파일은 PWA 사전 캐시에서 빠진다(`globIgnores`) — 항상 네트워크에서 받는다.

개발 서버에서는 `?shareProvider=./share-provider.dev.js` 로 같은 출처의 제공자를 시험할 수 있다
(운영 빌드에서는 이 분기가 제거된다). `public/share-provider.dev.js` 는 같은 브라우저의 탭끼리
localStorage 로 공유하는 시험용 제공자다.

## 모듈 모양

`default` 로 제공자 객체를 내보내거나, 제공자(또는 그 Promise)를 돌려주는 `createShareProvider()`
를 내보낸다. 아래 12개 메서드가 모두 함수여야 제공자로 인정한다.

| 메서드 | 설명 |
|---|---|
| `create(bytes, name, settings)` | 공유본 v1 을 만든다. `{ token, adminKey }` — 둘 다 16바이트 난수 hex 32자. 만들기에 로그인이 필요하면 `ShareAuthRequiredError` |
| `open(token)` | `{ meta, bytes }` — 최신 버전. 없는 토큰이면 `ShareGoneError`. 회수·만료는 `meta.revoked`·`meta.expiresAt` 로 알린다 |
| `save(token, bytes, baseVersion, by)` | `baseVersion` 이 최신일 때만 새 버전을 쓴다. `{ version }`. 아니면 `ShareConflictError(serverVersion)`, 끝난 공유면 `ShareGoneError` |
| `watch(token, cb)` | 메타가 바뀔 때마다 `cb(meta)`. 구독 해제 함수를 돌려준다 |
| `lock(token, by)` | 편집 잠금. 비었거나 내 것이거나 마지막 심장박동이 30분 넘게 지났으면 잡고 `true` |
| `heartbeat(token, by)` | 내 잠금이면 시각을 갱신하고 `true`, 아니면 `false` |
| `unlock(token, by)` | 내 잠금이면 푼다 |
| `updateSettings(token, adminKey, settings)` | 권한(`access`)·만료(`expiresAt`) 변경 |
| `revoke(token, adminKey)` | 공유 회수 |
| `listVersions(token)` | `[{ version, createdAt, by, byteSize }]` (최신 먼저) |
| `openVersion(token, version)` | 그 버전의 바이트 |
| `canCreate()` | `{ ok: true, by }` 또는 `{ ok: false, loginUrl? }` — 만들기 메뉴가 로그인 안내로 바뀐다 |

`meta`: `{ token, name, access: 'view'|'edit', expiresAt: number|null, revoked, version, byteSize, lock: { by, since, heartbeatAt }|null, createdBy?: { name } }`
— 관리키는 메타에 넣지 않는다.

`by` 는 편집기가 만드는 잠금 주인 식별자(`이름#탭ID`)다. 제공자는 그대로 저장·비교만 하고,
화면에는 편집기가 이름만 보여 준다.

## 오류는 이름으로

제공자는 별도로 빌드되므로 편집기의 오류 클래스를 쓸 수 없다. 오류 객체의 `name` 으로 구분한다.

| name | 추가 필드 | 뜻 |
|---|---|---|
| `ShareConflictError` | `serverVersion: number` | 저장 기준 버전이 최신이 아님(남이 먼저 저장) |
| `ShareGoneError` | — | 없거나 끝난 공유 |
| `ShareAuthRequiredError` | `loginUrl?: string` | 만들기에 로그인 필요 |

```js
throw Object.assign(new Error('conflict'), { name: 'ShareConflictError', serverVersion: 7 });
```

## 편집기 쪽 동작 요약

- 공유 링크: `<편집기 주소>?share=<token>`. 관리 링크: 거기에 `#admin=<adminKey>`(fragment 라 서버로 가지 않는다).
  관리키는 만든 브라우저의 localStorage 에도 저장되고, 관리 링크로 열면 주소창에서 지운다.
- 편집자는 60초마다 `heartbeat`, 30분 동안 입력이 없으면 보내지 않는다(잠금이 저절로 만료).
- 「편집 가능」 링크라도 남이 잠금을 쥐고 있으면 보기 전용 + 「○○ 님이 편집 중」 띠, 그 사람이 저장하면 새 버전이 자동으로 열린다.
- 편집자의 「저장」(Ctrl+S)은 PC 파일이 아니라 `save` 다. 다른 이름으로 저장은 그대로 내려받기.
- 공유본 상한 20MB.
