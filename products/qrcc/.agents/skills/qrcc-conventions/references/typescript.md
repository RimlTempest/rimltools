# qrcc の TypeScript 固有事項

共通の規約は `rimltools-typescript`（コード例は qrcc のドメインで書いてある）。ここには qrcc だけのレイヤと Rust との境界を置く（統合前の `qrcc-typescript` から移した）。

## モジュール境界（qrcc のレイヤ）

```
shared/contract  … 型と Result のみ。実装依存ゼロ。誰からも import される
features/<name>/core       … 純粋ドメインロジック。I/O 禁止
apps/*/src/server   … I/O（D1・R2・service binding）と composition root
apps/*/src/routes   … UI。ドメイン型をそのまま使う
```

`import/no-cycle` は error。境界を越える依存は必ず `contracts` 経由。

composition root は `apps/*/src/server/container.ts`。Rust の engine は `features/*/engine`、I/O つきの Rust は `features/*/worker`（ADR-0003 / ADR-0007）。

## Rust 側との対応

`features/*/engine` は Rust の `Result<T, E>` をそのまま使い、`E` は `thiserror` の enum。
Worker 境界で `{ "ok": false, "error": { "kind": "...", ... } }` の JSON にシリアライズし、
TS 側の `RenderError` と **同じ `kind` 文字列**で対応させる。
対応表は `shared/contract/src/api/errors.ts` に置き、Rust 側テストと TS 側テストの
両方で同じフィクスチャ JSON を読む。

## チェックリスト（qrcc 固有）

- [ ] 新しい symbology / payload 種別を「新ファイル + レジストリ 1 行」で足せる（OCP）
- [ ] 境界値（最大長、空、最小/最大バージョン）を含む
