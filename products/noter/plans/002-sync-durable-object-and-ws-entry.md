# Plan 002: `DocumentRoom`（Durable Object）と `/ws/:documentId` の配線

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat <plan-001 のマージコミット>..HEAD -- features/sync apps/sync apps/web/src/server.ts apps/web/wrangler.jsonc shared/contract`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH（Hibernation API・auxiliary Worker 間の DO binding・カスタム server entry の 3 点が未検証）
- **Depends on**: 001
- **Category**: direction
- **Planned at**: commit `b110c53`, 2026-09-06（plan 001 のマージ後に着手する）

## Why this matters

noter の中核は「同じ文書を開いている全員に更新を届け、たまに保存する」DO。
ここが動けば、以降の auth / documents / editor は D1 と UI の話に閉じる。
逆にここで Hibernation・alarm・auxiliary Worker の DO binding が想定通り
動かないなら、設計（ADR-0002 / 0003 / 0005）を早期に見直す必要がある。
この plan は**同期の縦一本を最小構成で通すスパイク**を兼ねる。

## Current state

- plan 001 完了時点の状態を前提にする。`features/sync/worker/document-room.ts` は 501 を返すスタブ、
  `apps/sync/src/index.ts` はそれを re-export、`apps/web/wrangler.jsonc` に
  `DOCUMENT_ROOM`（`script_name: "noter-sync"`）binding と D1 `DB` が宣言済み。
- **仕様の唯一の定義は `docs/realtime-protocol.md`**（§1 接続確立、§2 メッセージ形式、
  §3 受信処理の擬似コード、§4 永続化、§5 `/kick`、§6 `/snapshot`、§7 クライアント）。
  実装前に全文を読むこと。要点:
  - web → DO ヘッダ: `X-Noter-Role` / `X-Noter-Actor` / `X-Noter-Name`（URL エンコード）
  - close code: 4400 `bad_request`, 4403 `forbidden`, 4404 `not_found`, 4413 `too_large`, 4429 `limit`
  - メッセージ種別: 0 sync（sub: 0 step1 / 1 step2 / 2 update）, 1 awareness, 3 queryAwareness、
    ≥100 予約。テキストフレームは 4400
  - viewer の sync update / awareness は**黙って捨てる**（返さない・切らない）
  - サーバに `Awareness` クラスを置かない。awareness は attachment に最後のバイト列を保存する中継。
    切断時は `awareness-bytes.ts` の純粋関数で removal update を組み立てて他へ送る
  - DO SQLite: `document_state(id=1, state BLOB, updated_at)` + `meta(key, value)`（`schema_version`）
  - `markDirty()` → alarm 無ければ `setAlarm(now + PERSIST_DELAY_MS(5000))`。alarm で `encodeStateAsUpdate` を
    `INSERT OR REPLACE`。最後のソケット close で即 flush。`touch(documentId, updatedAt)` は 60 秒スロットル、失敗無視
  - DO の `fetch`: `Upgrade: websocket` / `POST /kick` / `GET /snapshot` のみ。他は 404
- ADR-0004: `class` は `features/sync/worker/document-room.ts` だけ。**中身は `features/sync/core` の
  `makeRoom(deps)` への 1〜3 行の委譲**。ADR の委譲例:

```ts
export class DocumentRoom extends DurableObject<CloudflareEnv> {
  #room = makeRoom({
    storage: this.ctx.storage,
    sockets: this.ctx,
    now: () => Date.now(),
    touch: makeTouch(this.env.DB),
  })
  fetch = (request: Request) => this.#room.fetch(request)
  webSocketMessage = (ws: WebSocket, message: ArrayBuffer | string) =>
    this.#room.onMessage(ws, message)
  webSocketClose = (ws: WebSocket, code: number) => this.#room.onClose(ws, code)
  webSocketError = (ws: WebSocket) => this.#room.onClose(ws, 1011)
  alarm = () => this.#room.onAlarm()
}
```

（`#room` フィールド初期化子で `this.ctx` を使うには `constructor(ctx, env) { super(ctx, env); this.#room = … }` が
必要。`class` 内の `constructor` は許可されている。`blockConcurrencyWhile` で `room.init()` を呼ぶ。）

- ADR-0005: 損失窓 ≤ 5 秒、write 失敗は指数バックオフ（上限 60 秒）、v1 ではクライアントに通知しない。
- `docs/free-tier-budget.md`: 受信 20 通 = 1 リクエスト。DO は `setTimeout` / `setInterval` を使わない。
- `apps/web/src/server.ts`（**未作成**）: TanStack Start のカスタム server entry で `/ws/` を横取りする。
  qrcc には無いパターン。`@tanstack/react-start 1.168.x` の server entry は
  `import handler from '@tanstack/react-start/server-entry'` で得られ、`export default { fetch }` で包める
  （公式 docs "Server Entry Point"）。`wrangler.jsonc` の `main` を `./src/server.ts` に変える。
- 上限は `@noter/contract` の `MAX_WS_MESSAGE_BYTES`（262144）と `MAX_MEMBERS`（50）。
- **この時点で認証・文書テーブルは無い**（plan 003 / 004）。`/ws/` の認可は差し替え可能な関数として
  `apps/web/src/server/ws-authorize.ts` に置き、この plan では**ローカル専用の開発フラグ**でのみ通す
  （下記 Step 5）。plan 004 が実装を差し替える。

## Commands you will need

| Purpose    | Command                                                                                             | Expected on success            |
| ---------- | --------------------------------------------------------------------------------------------------- | ------------------------------ |
| Unit tests | `bun test features/sync`                                                                            | 全 pass                        |
| Check      | `bun run check`                                                                                     | exit 0                         |
| Build      | `bun run build`                                                                                     | exit 0                         |
| Dev        | `bun run dev`（background）                                                                         | 5173 で応答                    |
| WS 疎通    | `bun run scripts/ws-probe.ts ws://localhost:5173/ws/doc_0000000000000000000000000`（Step 6 で作る） | `open` → `sync step2 received` |
| e2e        | `bun run e2e -- --grep sync`                                                                        | pass                           |

## Suggested executor toolkit

- `.claude/skills/noter-typescript/SKILL.md`, `.claude/skills/noter-tdd/SKILL.md`
- `.claude/skills/workers-best-practices/` — DO Hibernation / alarm / SQLite の API 名
- `docs/realtime-protocol.md`, `docs/adr/0003-*.md`, `docs/adr/0004-*.md`, `docs/adr/0005-*.md`
- 参考実装（npm に入る）: `node_modules/y-websocket/bin/utils.cjs` の `messageListener` — サーバ側の
  sync/awareness 分岐の正解。ただし `Awareness` クラスは使わない

## Scope

**In scope**:

- `features/sync/contract/src/**`, `features/sync/core/src/**`, `features/sync/worker/**`, `features/sync/client/src/**`（provider のみ最小）
- `features/sync/package.json`, `features/sync/tsconfig.json`
- `apps/sync/src/index.ts`, `apps/sync/tsconfig.json`
- `apps/web/src/server.ts`, `apps/web/src/server/ws-authorize.ts`, `apps/web/src/server/container.ts`, `apps/web/wrangler.jsonc`（`main` のみ）
- `scripts/ws-probe.ts`
- `e2e/tests/sync.spec.ts`
- `.github/workflows/ci.yml`（guard に 1 検査追加）
- `plans/README.md`（status 行）

**Out of scope**: `docs/**`（矛盾したら STOP）、`features/{auth,documents,editor,formats}/**`、`shared/**`、
`apps/sync/wrangler.jsonc`（変更不要のはず。必要なら STOP）

## Git workflow

- Branch: `feat/sync`
- Commits: `feat(sync): add wire contract and close codes`, `feat(sync): add pure room core with inbound routing`,
  `feat(sync): persist with alarm coalescing`, `feat(sync): delegate DocumentRoom to core`,
  `feat(web): intercept /ws in custom server entry`, `test(e2e): two-context sync smoke`

## Steps

### Step 1: contract（型と定数）

`features/sync/contract/src/`:

- `headers.ts`: `HEADER_ROLE = 'X-Noter-Role'`, `HEADER_ACTOR = 'X-Noter-Actor'`, `HEADER_NAME = 'X-Noter-Name'`;
  `type RoomIdentity = { readonly role: Role; readonly actorId: UserId; readonly name: string }`;
  `encodeIdentity(id): Headers` と `parseIdentity(headers): Result<RoomIdentity, IdentityParseError>`
  （`name` は `encodeURIComponent` / `decodeURIComponent`、`MAX_DISPLAY_NAME` で切る）
- `close-codes.ts`: `CLOSE_CODES = { badRequest: 4400, forbidden: 4403, notFound: 4404, tooLarge: 4413, limit: 4429 } as const`;
  `type RejectReason = 'bad_request' | 'forbidden' | 'not_found' | 'too_large' | 'limit'`; `reasonOf(code): RejectReason | null`
- `messages.ts`: `MESSAGE_SYNC = 0`, `MESSAGE_AWARENESS = 1`, `MESSAGE_QUERY_AWARENESS = 3`, `SYNC_STEP1 = 0`, `SYNC_STEP2 = 1`, `SYNC_UPDATE = 2`
- `constants.ts`: `PERSIST_DELAY_MS = 5000`, `TOUCH_THROTTLE_MS = 60_000`, `MAX_AWARENESS_BYTES = 16_384`,
  `PERSIST_BACKOFF_MAX_MS = 60_000`
- `connection-state.ts`: `docs/domain-model.md` §状態遷移のとおり
  `type ConnectionState = { kind: 'connecting' } | { kind: 'connected' } | { kind: 'reconnecting'; attempt: number } | { kind: 'offline' } | { kind: 'rejected'; reason: RejectReason }`
- `internal-routes.ts` は **core** に置く（`docs/parallel-lanes.md` の横断点表）: `INTERNAL_ROUTES = { kick: '/kick', snapshot: '/snapshot' } as const`
- `index.ts` で re-export。`features/sync/package.json` の `exports` に `./contract`, `./core`, `./client` を足す。

テスト: `headers.test.ts`（往復、日本語名、33 文字切り詰め、不正 role）、`close-codes.test.ts`。

**Verify**: `bun test features/sync/contract` → pass。

### Step 2: core（I/O 無しの Room）

依存は全て引数（`noter-typescript` の「依存は関数引数」）。`features/sync/core/src/`:

- `ports.ts`:
  ```ts
  export type RoomStorage = {
    // DurableObjectStorage の使う部分だけ
    readonly sql: {
      exec: (
        query: string,
        ...bindings: readonly SqlValue[]
      ) => { toArray: () => readonly Record<string, SqlValue>[] }
    }
    readonly getAlarm: () => Promise<number | null>
    readonly setAlarm: (at: number) => Promise<void>
    readonly deleteAll: () => Promise<void>
  }
  export type RoomSockets = {
    // DurableObjectState の使う部分だけ
    readonly acceptWebSocket: (ws: WebSocket) => void
    readonly getWebSockets: () => readonly WebSocket[]
    readonly setWebSocketAutoResponse: (pair: WebSocketRequestResponsePair) => void
  }
  export type RoomDeps = {
    readonly storage: RoomStorage
    readonly sockets: RoomSockets
    readonly now: () => number
    readonly touch: (updatedAt: number) => Promise<void>
  }
  ```
  `SqlValue` は `string | number | ArrayBuffer | null`。`WebSocket` は `lib.dom` ではなく workers の型なので、
  `features/sync/tsconfig.json` の `types` に `@cloudflare/workers-types` を入れず、**`worker/` を除外したままにする**ため、
  core では `WebSocket` を `ports.ts` で構造的型 `RoomSocket = { send(data: ArrayBuffer | string): void; close(code?: number, reason?: string): void; serializeAttachment(v: unknown): void; deserializeAttachment(): unknown }` として定義し、worker 側で実物を渡す。
- `attachment.ts`: `type Attachment = { identity: RoomIdentity; awareness: Uint8Array | null }`;
  `readAttachment(socket): Result<Attachment, …>`（`deserializeAttachment()` は `unknown`。型ガードで検証、`as` 禁止）、`writeAttachment(socket, a)`。
- `awareness-bytes.ts`: `readClientIds(update: Uint8Array): readonly { clientId: number; clock: number }[]` と
  `encodeRemoval(entries, now): Uint8Array`（`lib0/decoding` / `encoding` で y-protocols/awareness の形式を読む・書く。
  `state = null` の removal は `clock + 1`、JSON `'null'`）。**純粋関数**。
- `schema.ts`: `SCHEMA_VERSION = 1`, `migrate(storage)`（`meta` を見て段階適用）, `loadState(storage): Uint8Array | null`, `saveState(storage, state, updatedAt)`。
- `scheduler.ts`: `makePersistScheduler({ storage, now, persist })` → `{ markDirty(): Promise<void>; onAlarm(): Promise<void>; flush(): Promise<void> }`。
  `markDirty` は `getAlarm()` が null のときだけ `setAlarm(now + PERSIST_DELAY_MS)`。`onAlarm` は dirty なら `persist()`、
  失敗したら `setAlarm(now + backoff)`（1s → 2s → … → 60s、成功でリセット）。**`setTimeout` を使わない**。
- `inbound.ts`: `docs/realtime-protocol.md` §3 の擬似コードをそのまま関数に。
  `handleMessage({ doc, socket, attachment, bytes, broadcast, markDirty, sockets }): InboundResult`
  （`InboundResult = { kind: 'ok' } | { kind: 'close'; code: number; reason: RejectReason }`）。
  `y-protocols/sync` の `readSyncMessage` は使わず、**step1 / step2 / update を自前で分岐**する
  （viewer の判定のため）。step1 への返答は `writeSyncStep2`、update は `Y.applyUpdate(doc, update, socket)`。
- `room.ts`: `makeRoom(deps: RoomDeps): Room`。
  ```ts
  export type Room = {
    init(): Promise<void> // migrate + loadState + setWebSocketAutoResponse('ping','pong')
    fetch(request: Request): Promise<Response> // Upgrade → identity 検証 → MAX_MEMBERS 判定 → accept → step1 + 既存 awareness 送信 → 101
    // POST /kick → body {actorId} の socket を 4403 で close → 204
    // GET /snapshot → text/plain
    // 他 → 404
    onMessage(socket: RoomSocket, message: ArrayBuffer | string): Promise<void>
    onClose(socket: RoomSocket, code: number): Promise<void> // removal 送信、最後なら flush
    onAlarm(): Promise<void>
  }
  ```
  `Y.Doc` は `Room` のクロージャに 1 つ。`doc.on('update')` は使わず、inbound で明示的にブロードキャストする
  （origin の区別を単純にするため）。
  Upgrade の受け付けは `new WebSocketPair()` → `sockets.acceptWebSocket(server)` → `writeAttachment` →
  `new Response(null, { status: 101, webSocket: client })`。**`WebSocketPair` / `Response` の `webSocket` は
  workers ランタイム固有**なので、core では `deps.sockets.accept(request, attachment): Response` のように
  worker 側に閉じ込める（ports に `accept` を足す）。

テスト（`bun:test`、フェイクで）:

- `awareness-bytes.test.ts`: `y-protocols/awareness` の `Awareness` で実際に作った update から clientId を読める、removal を
  `applyAwarenessUpdate` で読むと state が消える
- `scheduler.test.ts`: markDirty 2 回で setAlarm 1 回、alarm で persist 1 回、失敗時は backoff で再 alarm、成功でリセット
- `inbound.test.ts`: step1 → step2 を返す、editor の update が doc に反映され他ソケットへ送られ markDirty される、
  viewer の update は無視、awareness 16KB 超は drop、テキストは close 4400、種別 7 は 4400、`MAX_WS_MESSAGE_BYTES` 超は 4413
- `room.test.ts`: `fetch` の 4 分岐（Upgrade 無し 404、identity 不正 4400、51 人目 4429、/snapshot、/kick）、
  最後の close で flush、`init` で保存済み state が復元される（インメモリ `RoomStorage` を `Map` で書く。SQL は
  `exec` の文字列を見て `document_state` / `meta` を扱う簡易実装でよい）

**Verify**: `bun test features/sync/core` → pass。`bunx oxlint --type-aware features/sync` → `no-throw-in-domain` 違反 0。

### Step 3: worker（殻）と touch

- `features/sync/worker/document-room.ts` を「Current state」の委譲形に書き換える。`blockConcurrencyWhile(() => room.init())` を constructor で。
- `features/sync/worker/touch.ts`: `makeTouch(db: D1Database, documentId: string, now)` → 60 秒スロットル、
  `UPDATE document SET updated_at = ?1 WHERE id = ?2`。**テーブルは plan 004 まで存在しない**ので、失敗は握りつぶす
  （`try/catch` はここ = I/O 境界でのみ可。`docs/realtime-protocol.md` §4）。documentId は DO 名（`ctx.id.name`）から得る。
- `features/sync/worker/sockets.ts`: `RoomSockets` の実装（`accept` で `WebSocketPair` を作る）。

**Verify**: `bun run typecheck` → exit 0。`grep -c 'class ' features/sync/worker/document-room.ts` → `1`。
`grep -rn 'class ' features/sync/core features/sync/contract` → なし。

### Step 4: `apps/web/src/server.ts`（カスタム server entry）

```ts
import startHandler from '@tanstack/react-start/server-entry'
import { handleWebSocketUpgrade } from './server/ws-gate.ts'

export default {
  fetch: async (request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> => {
    const url = new URL(request.url)
    const match = /^\/ws\/([^/]+)$/.exec(url.pathname)
    if (match) return handleWebSocketUpgrade(request, env, match[1])
    return startHandler.fetch(request, env, ctx)
  },
}
```

- `apps/web/src/server/ws-gate.ts`: `Upgrade` が `websocket` でなければ 426、`parseDocumentId` 失敗は 404、
  `authorizeWs(request, env, documentId)` が `err` なら 401/404、`ok` なら `env.DOCUMENT_ROOM.getByName(documentId).fetch(new Request(request, { headers: encodeIdentity(identity) を足したもの }))` を返す。
- `apps/web/src/server/ws-authorize.ts`（plan 004 が差し替える）:
  ```ts
  /** plan 004 でセッション + document_member による認可に置き換える。 */
  export const authorizeWs = async (
    request: Request,
    env: CloudflareEnv,
    documentId: DocumentId,
  ): Promise<Result<RoomIdentity, 'unauthorized' | 'not_found'>> => {
    if (env.NOTER_DEV_OPEN_WS !== '1') return err('unauthorized')
    const url = new URL(request.url)
    const name = url.searchParams.get('name') ?? 'dev'
    return ok({ role: 'editor', actorId: devActorId(name), name })
  }
  ```
  `NOTER_DEV_OPEN_WS` は **`.dev.vars` にだけ**書く（`.dev.vars.example` にキーを追加、値は空）。
  `apps/web/wrangler.jsonc` の `vars` には**絶対に書かない**。CI の `guard` に
  `if grep -q NOTER_DEV_OPEN_WS apps/web/wrangler.jsonc; then …exit 1; fi` を足す。
  `wrangler types` が `NOTER_DEV_OPEN_WS` を型に出さない場合は `env` を `{ NOTER_DEV_OPEN_WS?: string }` を含む
  構造的型で受ける（`as` 禁止）。
- `apps/web/wrangler.jsonc`: `"main": "./src/server.ts"`。
- `e2e/playwright.config.ts` の `webServer.env` に `NOTER_DEV_OPEN_WS: '1'` を足す（e2e のみ）。

**Verify**: `bun run build` → exit 0。`bun run dev` を起動し
`curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/ws/doc_0000000000000000000000000` → `426`、
`curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/` → `200`（通常ルートが壊れていない）。

### Step 5: client（provider の最小版）

`features/sync/client/src/provider.ts`:

```ts
export type ProviderDeps = { readonly origin: string; readonly documentId: DocumentId; readonly doc: Y.Doc; readonly onState: (s: ConnectionState) => void }
export const makeDocumentProvider = (deps: ProviderDeps): { readonly awareness: Awareness; readonly destroy: () => void }
```

`WebsocketProvider(`${wsScheme(origin)}//${host}/ws`, documentId, doc, { disableBc: true })`。`status` / `connection-close` /
`connection-error` を `ConnectionState` に変換。`connection-close` の `event.code` が 4000〜4999 なら
`provider.shouldConnect = false` として `rejected(reasonOf(code))`。`navigator.onLine` / `online` / `offline` イベントで `offline`。
（`WebsocketProvider` の型が `shouldConnect` を公開していなければ、`provider.disconnect()` を呼ぶ。）

テスト: `state-machine.test.ts` に遷移を純粋関数 `nextState(prev, event)` として切り出してテストする。

**Verify**: `bun test features/sync/client` → pass。

### Step 6: 疎通スクリプトと e2e

- `scripts/ws-probe.ts`: Bun の `WebSocket` で `ws://localhost:5173/ws/<id>?name=probe` に繋ぎ、
  `open` で `sync step1`（`y-protocols/sync` の `writeSyncStep1`）を送り、種別 0 / sub 1（step2）を受け取ったら
  `sync step2 received` を出力して exit 0。10 秒で timeout exit 1。`NOTER_DEV_OPEN_WS=1` を `.dev.vars` に書いて実行。
- `e2e/tests/sync.spec.ts`: Playwright の `browser.newContext()` を 2 つ作り、両方で
  `page.evaluate` から `y-websocket` を使うのは重いので、**`/d/:id` がまだ無いこの時点では**
  `page.evaluate(() => new WebSocket(...))` で生の WS を開き、片方で update を送ってもう片方で受信する
  （テストヘルパで `Y.Doc` の update を `lib0` でエンコードするのは `e2e` パッケージに `yjs` / `y-protocols` / `lib0` を devDependency で入れて `page.evaluate` に文字列化して渡す）。
  plan 005 で `/d/:id` 経由の本物のテストに置き換えるので、最小でよい。

**Verify**: `bun run e2e -- --grep sync` → pass。`bun run scripts/ws-probe.ts ws://localhost:5173/ws/doc_0000000000000000000000000` → `sync step2 received`。

### Step 7: 全体

`bun run check && bun run test && bun run build`。

## Test plan

Step 2・5・6 のとおり。パターン: `bun:test` + フェイク（`shared/contract/src/result.test.ts` を参照）。
Hibernation の実機挙動（`webSocketMessage` が起こすか）は e2e で確認する。

## Done criteria

- [ ] `bun run check` / `bun run test` / `bun run build` exit 0
- [ ] `grep -rln '^\s*\(export \)\?class ' features apps shared scripts --include='*.ts'` → `features/sync/worker/document-room.ts` のみ
- [ ] `grep -rn 'setTimeout\|setInterval' features/sync/core features/sync/worker` → なし
- [ ] `grep -n 'NOTER_DEV_OPEN_WS' apps/web/wrangler.jsonc` → なし; `.github/workflows/ci.yml` にその guard がある
- [ ] `curl … /ws/doc_…` が 426、`ws-probe` が step2 を受信、`e2e -- --grep sync` pass
- [ ] `features/sync/core` に `throw` が無い（`no-throw-in-domain` が通る）

## STOP conditions

- `@tanstack/react-start/server-entry` の default export に `fetch` が無い、または `wrangler.jsonc` の `main` を
  `./src/server.ts` にすると `bun run build` / `bun run dev` が失敗する（エラー全文を報告。代替は advisor が判断）
- `bun run dev` で `env.DOCUMENT_ROOM.getByName` が「class not found」等で失敗する（auxiliary Worker 間の
  `script_name` binding が vite-plugin dev で解決できない）
- `webSocketMessage` が呼ばれず `ws.addEventListener('message')` でしか受け取れない（Hibernation が効いていない）
- `y-websocket 3.x` の `WebsocketProvider` が `disableBc` や `connection-close` の code を公開していない
- `docs/realtime-protocol.md` と矛盾する挙動が必要になった

## Maintenance notes

- `apps/web/src/server/ws-authorize.ts` は**plan 004 が必ず置き換える**。`NOTER_DEV_OPEN_WS` は plan 004 で削除する
- メッセージ種別を足すときは `docs/realtime-protocol.md` §8 の手順（contract → core → worker → web → client）
- レビュー観点: viewer の update が本当に落ちているか（`inbound.test.ts`）、alarm が二重に張られないか、
  `deserializeAttachment` の結果を型ガード無しで使っていないか
