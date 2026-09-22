# qrcc のテスト固有事項

共通の規約は `rimltools-tdd`。ここには qrcc のツール・置き場所・手法を置く（統合前の `qrcc-tdd` から移した）。

## テストサイズ（qrcc のツール）

| サイズ     | 依存してよいもの                                                        | 目標時間     | ツール                                       | 置き場所                              |
| ---------- | ----------------------------------------------------------------------- | ------------ | -------------------------------------------- | ------------------------------------- |
| **Small**  | 自プロセスのメモリのみ。I/O・時計・乱数・ネットワーク禁止（すべて注入） | < 100ms / 件 | `bun test` / `cargo test`                    | 実装の隣 `*.test.ts` / `#[cfg(test)]` |
| **Medium** | localhost 内のプロセス。Miniflare の D1/KV/R2、WASM ロード、jsdom       | < 5s / 件    | `vitest` + `@cloudflare/vitest-pool-workers` | `apps/*/tests/integration/`           |
| **Large**  | 実ブラウザ、実 Worker、複数コンポーネント結合                           | < 60s / 件   | Playwright                                   | `e2e/`                                |

## 境界値（qrcc）

- 最小/最大バージョン、ペイロード長 0 / 上限 / 上限+1、未対応文字集合、EC レベルの組み合わせ。

## ゴールデンテスト（レンダリング）

QR / バーコードの出力は**モジュール行列**を固定値と比較する
（SVG 文字列ではなく）。SVG の書式が変わってもテストが壊れないため。

```rust
#[test]
fn qr_m_level_encodes_known_matrix() {
    let m = render_qr("HELLO", Ec::M).unwrap();
    assert_eq!(m.dimension(), 21);
    assert_eq!(m.to_bitstring_rows()[0], "1111111010101111111");
}
```

デコード側は「生成 → デコード → 元の文字列に戻る」ラウンドトリップを Small で回す。

## レイヤ別の指針（qrcc）

| 対象                                      | サイズ     | 方針                                                |
| ----------------------------------------- | ---------- | --------------------------------------------------- |
| `features/<name>/core`, `shared/contract` | Small のみ | 純粋関数。フェイクは素のオブジェクト                |
| `features/*/engine`                       | Small      | `cargo test`。wasm 依存を core に持ち込まない       |
| ユースケース関数 (`makeXxx`)              | Small      | 依存はインメモリのフェイク実装                      |
| D1 リポジトリ                             | Medium     | Miniflare の実 D1 にマイグレーションを当てて検証    |
| server function / API ルート              | Medium     | `vitest-pool-workers` で service binding ごと起動   |
| React コンポーネント                      | Small      | Testing Library。ロールとアクセシブル名で取得する   |
| 画面フロー・カメラ・印刷                  | Large      | Playwright。カメラは fake device で代替             |
| アクセシビリティ                          | Large      | Playwright + `@axe-core/playwright`（AAA タグ込み） |

## コマンド（products/qrcc 直下）

```
bun run test                 # 全ワークスペースの Small/Medium
bun test features/<name>/core       # Small だけ高速に回す
cargo test --workspace       # Rust Small
bun run --filter '@qrcc/web' test:integration   # Medium (Miniflare)
bun run --filter '@qrcc/web' e2e                # Large (Playwright)
bun run a11y                 # Large (axe-core, AAA)
```
