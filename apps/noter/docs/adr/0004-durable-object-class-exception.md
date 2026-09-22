# ADR-0004: `class` 禁止の唯一の例外を DO の殻に限定する

- 状態: Accepted
- 日付: 2026-09-06
- 関連: [ADR-0001](0001-stack.md) / [ADR-0006](0006-typescript-7-and-oxc.md)

## 文脈

qrcc から引き継いだ規約は「`class` を書かない」（oxlint `rimltools/no-class`）。
一方 Cloudflare の Durable Object は **`class X extends DurableObject` でしか定義できない**。
`wrangler` はエクスポートされたクラス名で DO を引くため、関数で代替する手段が無い。

## 決定

- `class` を許すのは **`features/sync/worker/document-room.ts` の 1 ファイルだけ**。
  `.oxlintrc.json`（2026-09 以降はリポジトリ直下に一本化）の `overrides` でこのパスのみ `rimltools/no-class` を `off` にする
- そのクラスは **各メソッドが 1〜3 行の委譲**であること。ロジックは
  `features/sync/core` の `makeRoom(deps)` が持ち、クラスは `ctx.storage` /
  `ctx.getWebSockets()` / `Date.now` を注入するだけ
- テストは `makeRoom` に対してフェイクの storage / sockets を注入して書く。
  クラスそのものはテストしない（Miniflare で e2e が通れば足りる）

```ts
export class DocumentRoom extends DurableObject<CloudflareEnv> {
  #room = makeRoom({
    storage: this.ctx.storage,
    sockets: this.ctx,
    now: () => Date.now(),
    touch: makeTouch(this.env.DB),
  })
  fetch(request: Request) {
    return this.#room.fetch(request)
  }
  webSocketMessage(ws: WebSocket, msg: ArrayBuffer | string) {
    return this.#room.onMessage(ws, msg)
  }
  webSocketClose(ws: WebSocket, code: number) {
    return this.#room.onClose(ws, code)
  }
  webSocketError(ws: WebSocket) {
    return this.#room.onClose(ws, 1011)
  }
  alarm() {
    return this.#room.onAlarm()
  }
}
```

## 理由

- 例外を「DO のクラス」ではなく「**この 1 ファイル**」に限定することで、
  例外が滲まない。新しい DO を足すときは ADR を追加する
- 委譲だけにすることで、クラス内に状態やロジックが溜まらない。
  規約の目的（状態と振る舞いの分離、DI によるテスト容易性）は保たれる

## 帰結

- CI の `guard` が「`class ` を含む `.ts` が `features/sync/worker/document-room.ts` 以外に無い」
  ことを検査する（`.oxlintrc.json` の override と二重に守る）
- constructor に置いてよいのは **配線と初期化の呼び出しだけ**: `super(ctx, env)`、
  `makeRoom(makeRoomDeps(ctx, env))`、`ctx.blockConcurrencyWhile(() => room.init())`。
  条件分岐・状態・try/catch は置かない（2026-09-06 改訂。当初は「constructor を
  自前で書かず各エントリで `ensureLoaded()` を await する」としていたが、5 本の
  エントリ全部に await と分岐が散り、かえってクラスが厚くなる。wake 時に
  `blockConcurrencyWhile` で復元するのは Cloudflare が推奨する形でもある。
  `init()` が reject すると DO はリセットされ、壊れた状態のまま進まない）
