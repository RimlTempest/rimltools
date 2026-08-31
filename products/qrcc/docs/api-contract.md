# API 契約（qrcc-web → qrcc-api）

`qrcc-api` は service binding からのみ到達できる（[ADR-0002](adr/0002-auxiliary-worker-split.md)）。
**認証は行わない。** 呼び出し側が検証済みの `UserId` を渡す。

契約の定義元:

- TypeScript: `packages/contracts/src/api/`
- Rust: `crates/qrcc-core/src/api/`
- 共有フィクスチャ: `packages/contracts/fixtures/*.json`
  （TS と Rust の両方のテストがこの同じファイルを読む）

## 1. 呼び出し形式

`fetch` ベースの JSON RPC。パスは `POST /rpc/<method>`。

```
POST /rpc/render
X-Qrcc-Actor: usr_...        ← qrcc-web が検証済みの UserId（匿名なら省略）
X-Qrcc-Request-Id: <uuid>    ← ログ相関用
Content-Type: application/json
```

レスポンスは常に 200 で、成否は本文の `ok` で表す（`Result` と 1:1 対応）。
トランスポート層の失敗（5xx）だけが例外。

```jsonc
// 成功
{ "ok": true, "value": { /* ... */ } }
// 失敗
{ "ok": false, "error": { "kind": "payload_too_long", "max": 2953, "actual": 4096 } }
```

`error.kind` は TS の `RenderError['kind']` と Rust の enum バリアント名が
**同一文字列**であること。フィクスチャテストがこれを検証する。

## 2. メソッド

| メソッド                               | 用途                       | 認証             | 備考                                                |
| -------------------------------------- | -------------------------- | ---------------- | --------------------------------------------------- |
| `render`                               | 仕様 → SVG/PNG             | 不要             | 通常はブラウザ側 wasm で行う。サーバは保存時とOGP用 |
| `decode`                               | 画像 → バーコード          | 不要             | ブラウザが対応しない形式のフォールバックのみ        |
| `print`                                | 仕様 + 台紙 → PDF          | 不要             | R2 キャッシュ前提                                   |
| `codes.list`                           | 一覧（カーソルページング） | 必須             | `CodeSummary` のみ返す                              |
| `codes.get`                            | 1 件取得                   | 条件付き         | 共有トークンでも可                                  |
| `codes.create` / `update` / `delete`   | CRUD                       | 必須             |                                                     |
| `folders.*`                            | フォルダ CRUD              | 必須             |                                                     |
| `shares.create` / `revoke` / `resolve` | 共有リンク                 | `resolve` は不要 |                                                     |

## 3. 各メソッドの型（抜粋）

```ts
export type RenderRequest = {
  readonly payload: CodePayload
  readonly symbology: Symbology
  readonly style: RenderStyle
  readonly output: OutputFormat // 'svg' | 'png'
}
export type RenderResponse = {
  readonly bytes: Base64 // SVG は UTF-8 の base64
  readonly contentType: string
  readonly dimension: { readonly width: number; readonly height: number }
  readonly specHash: SpecHash
  readonly warnings: readonly RenderWarning[] // 低コントラスト、ロゴ被覆過多など
}
export type RenderError =
  | { kind: 'payload_too_long'; max: number; actual: number }
  | { kind: 'unsupported_charset'; symbology: Symbology['kind'] }
  | { kind: 'invalid_option'; field: string; reason: string }
  | { kind: 'incompatible_payload'; payload: CodePayload['kind']; symbology: Symbology['kind'] }
```

**警告とエラーを分ける。** コントラスト不足は生成を止めず `warnings` で返し、
UI が「読み取れない可能性がある」と表示する。ユーザーの表現の自由を奪わない。

## 4. 契約を変更する手順

1. このファイルを先に更新する
2. `packages/contracts/fixtures/` にケースを追加する
   → この時点で TS 側と Rust 側の両方のテストが落ちる（red）
3. Rust 側を実装 → TS 側の型を更新（green）
4. 破壊的変更なら、メソッド名に `v2` を付けて並走させ、
   移行後に旧版を削除する（デプロイ中の不整合を避ける）

## 5. 冪等性とリトライ

- `render` / `decode` / `print` は純粋関数なので冪等。安全にリトライしてよい。
- `codes.create` は `Idempotency-Key` ヘッダを受け取り、
  同じキーの再送では既存の `CodeId` を返す（二重作成を防ぐ）。
- `shares.create` も同様。

## 6. 制限

| 項目                     | 上限    | 理由                       |
| ------------------------ | ------- | -------------------------- |
| リクエストボディ         | 4 MB    | サーバ側デコードの入力上限 |
| 画像の辺の長さ           | 4096 px | CPU 10ms に収めるため      |
| `codes.list` の 1 ページ | 50 件   | D1 行読み取りの節約        |
| PDF のページ数           | 100     | 生成時間の上限             |

超過は `{ "ok": false, "error": { "kind": "limit_exceeded", ... } }` で返す。
