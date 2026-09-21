# ADR-0001: TanStack Start + Cloudflare Workers/DO を TypeScript 一本で組む

- 状態: Accepted
- 日付: 2026-09-06
- 関連: qrcc ADR-0001 を移植・改訂

## 文脈

noter は markdown（mermaid 対応）/ yaml / toml / json を複数人でリアルタイムに
作成・編集・読み込みする Web アプリ。絶対条件は次の 3 つ。

1. **完全無料で運用する**（Cloudflare Free プラン）
2. `noter.riml4i.com` に Cloudflare でデプロイする
3. qrcc で確立したスキル・コーディング規約・AI ネイティブな仕組みを引き継ぐ

qrcc は TanStack Start（TS）+ workers-rs（Rust）の 2 言語構成だった。
noter ではリアルタイム同期が主機能なので「並行処理に適した言語」への変更も
検討対象だった。

## 決定

- フロントエンドと SSR は **TanStack Start v1（React 19、RSC 無効）**、
  ビルドは `@cloudflare/vite-plugin`
- バックエンドは **Cloudflare Workers + Durable Objects を TypeScript** で書く。
  **Rust / cargo は入れない**
- 同期は **Yjs**（[ADR-0003](0003-realtime-yjs-on-durable-objects.md)）
- ストレージは **D1 + DO SQLite**（[ADR-0009](0009-free-tier-d1-and-do-only.md)）
- 認証は Better Auth（[ADR-0010](0010-auth-guest-and-google.md)）
- ツールチェーンは qrcc と同じ: Bun workspaces / TS 7 / oxlint / oxfmt / mise / lefthook /
  Playwright + axe

## 理由

### 「並行処理に適した言語」を選ばなかった理由

リアルタイム共同編集の難しさは並行処理ではなく**収束**（誰がどの順で
編集しても同じ結果になること）で、これは CRDT（Yjs）が解く。そのうえで
Cloudflare の Durable Object は「1 文書 = 1 インスタンス、シングルスレッド」
なので、1 文書内の並行性の問題は構造的に存在しない。複数文書は別 DO が
別々に動く。Go / Elixir のような並行処理向け言語のメリットが出る場面が
無い。

Rust を DO で使うと wasm 経由になり、Yjs（JS ライブラリ）との橋渡しが
最大のボトルネックになる。yrs（Rust 実装）を使えば回避できるが、クライアント
（yjs）とサーバ（yrs）で実装が割れ、ツールチェーンも 2 倍になる。

### 無料枠

Workers Free で Durable Object（SQLite backed）が使えるようになったため、
WebSocket を持てるバックエンドが無料で手に入る。Workers Free は上限に達しても
課金されず止まるだけ（[ADR-0009](0009-free-tier-d1-and-do-only.md)）。

## 帰結

- `mise.toml` から Rust を外す。`bun run check` に cargo 系は無い
- qrcc の `rust-best-practices` スキルは移植しない。代わりに `workers-best-practices`
  （Cloudflare 公式）を入れる
- 「`class` を書かない」規約と DO（クラスでしか定義できない）が衝突する →
  [ADR-0004](0004-durable-object-class-exception.md)
- CPU の重い処理（構文解析・Markdown 変換・mermaid 描画）は**すべてブラウザ**で行う。
  Worker は認可と中継だけ
