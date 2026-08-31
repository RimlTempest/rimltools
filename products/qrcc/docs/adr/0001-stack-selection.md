# ADR-0001: TanStack Start (RSC) + Rust + Cloudflare を選ぶ

- 状態: Accepted
- 日付: 2026-09-01

> ディレクトリ構成はその後 [ADR-0007](0007-feature-colocation.md) で機能単位の
> co-location に変更されている。ここに出てくるパスは当時のもので、決定内容自体は有効。

## 文脈

QR / バーコードの生成・読み取り・管理・印刷を行う Web アプリを作る。
**無料で運用できることが絶対条件**。ドメインは `qrcc.riml4i.com`。
前身は Gatsby 製の静的サイト（生成と読み取りのみ、保存機能なし）。

今回は認証つきの管理機能が入るため、サーバサイドの状態が必要になる。

## 決定

- フロントエンド: **TanStack Start v1**（React 19 + RSC 有効）
- バックエンドのコア: **Rust**（`workers-rs` / WebAssembly）
- ホスティング: **Cloudflare Workers**（D1 / KV / R2 / Static Assets）
- monorepo: **Bun workspaces**

## 理由

**TanStack Start**

- ルーティングとローダが完全に型安全で、`packages/contracts` の型がそのまま
  URL・検索パラメータの型になる。この規模の管理画面で効く。
- RSC が「クライアント主導」。重い依存（デコーダ、PDF）をサーバに置きつつ、
  生成プレビューのような即応性が要る部分はクライアントに残せる。RSC を
  全面採用する必要がない設計は本アプリと相性がよい。
- Cloudflare が公式パートナーで、`@cloudflare/vite-plugin` 経由の
  Workers デプロイが一次サポートされている。

**Rust**

- 生成・デコード・PDF はいずれも CPU バウンド。Workers 無料枠の
  **1 リクエスト 10ms CPU** 制限下では実行速度が直接コストになる。
- `rxing`（zxing の Rust ポート）で 1D/2D の広い symbology を 1 実装で賄える。
- 同じ crate をブラウザ向け WASM にも出せる（→ [ADR-0003](0003-rust-core-dual-target.md)）。

**Cloudflare**

- 無料枠で完結する: Workers 100k req/日、D1 5GB、R2 10GB（エグレス無料）、
  KV 1GB、静的アセット無制限。
- カスタムドメインのサブドメイン運用が無料。
- エグレス課金がないため、PDF / PNG の配信でコストが跳ねない。

## 検討した代替案

| 案                              | 却下理由                                                                    |
| ------------------------------- | --------------------------------------------------------------------------- |
| Next.js on Vercel               | 無料枠の商用利用制限とサーバ実行時間の制約。Rust を同居させにくい           |
| SvelteKit / Remix               | 型安全ルーティングとローダの一体感で TanStack Start に劣る                  |
| バックエンドも TypeScript       | 生成/デコードの CPU コストが 10ms 制限に直撃する。既存の zxing 系 JS は重い |
| Rust を Fly.io / Shuttle に置く | 常時起動が無料枠を外れる。ドメイン分割で CORS とレイテンシも増える          |
| Cloudflare Pages Functions      | Workers に統合された。auxiliary Worker が使えない                           |

## 帰結

- Vite 7+ / Node 互換フラグが必須（RSC と Cloudflare plugin の要件）。
- RSC は TanStack Start でまだ experimental。API 変更に追随するコストを許容する。
  影響範囲を `apps/web/src/features/*/server/` に閉じ、UI から直接触らせない。
- Rust と TypeScript の 2 言語になるため、API 契約を `packages/contracts` に
  一元化し、両側のテストが同じフィクスチャを読む運用にする。
