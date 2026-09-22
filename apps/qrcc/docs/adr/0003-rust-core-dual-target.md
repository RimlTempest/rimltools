# ADR-0003: Rust コアを Worker とブラウザの 2 ターゲットに配る

- 状態: Accepted
- 日付: 2026-09-01

> ディレクトリ構成はその後 [ADR-0007](0007-feature-colocation.md) で機能単位の
> co-location に変更されている。ここに出てくるパスは当時のもので、決定内容自体は有効。

## 文脈

無料枠の制約は **Workers 100k リクエスト/日** が最も厳しい。
生成プレビューはユーザーが設定を触るたびに走るため、これをサーバで処理すると
1 ユーザーが数十リクエストを消費してしまう。

一方、生成・デコードのロジックをクライアントとサーバで二重実装すると、
出力が食い違い、テストも二重になる。

## 決定

`crates/qrcc-core` / `qrcc-render` / `qrcc-decode` を **プラットフォーム非依存**に保ち、
2 つの薄いアダプタから使う。

```
crates/qrcc-core, qrcc-render, qrcc-decode, qrcc-print   … 純粋ロジック
   ├─ services/api        (workers-rs)      → Worker で実行
   └─ crates/qrcc-wasm (wasm-bindgen)   → packages/wasm → ブラウザで実行
```

**既定の実行場所はブラウザ。** サーバ実行は次の場合だけ:

- 保存・共有・一覧など永続化が絡む操作
- PDF 生成（フォントを含むため wasm バンドルが大きい）
- ブラウザが対応していない symbology のデコード（フォールバック）

## 理由

- 生成プレビューが Worker リクエストを 1 件も消費しない。無料枠を守る最大の手段。
- オフラインでも生成と読み取りが動く（PWA 化の余地）。
- ロジックが 1 つなので、サーバとクライアントの出力が定義上一致する。
- 同じテストスイート（`cargo test`）が両方を検証する。

## 帰結

- `qrcc-core` / `qrcc-render` / `qrcc-decode` は `worker` crate に依存してはならない。
  依存の向きは Cargo の workspace で強制し、CI で `cargo tree` を検査する。
- wasm バンドルサイズが UX に直結する。目標と**実測（2026-09-01 時点）**:

  | チャンク                        | 目標       | 実測 (gzip) |
  | ------------------------------- | ---------- | ----------- |
  | 生成（`qrcc-generate`）         | 200KB 以下 | **86KB**    |
  | デコード（`qrcc-scan` / rxing） | 800KB 以下 | **781KB**   |

  Cargo の feature で 2 つの wasm に焼き分け、デコード側は読み取り画面に入って、
  かつ `BarcodeDetector` が使えないときだけ動的に読み込む。1 つにまとめると
  生成しか使わない利用者にも 9 倍を配ることになる。
  CI はチャンクごとに上限を検査し、**チャンクが見つからない場合も失敗**させる
  （名前を変えた瞬間に検査が消えるのを防ぐ）。

- `wasm-opt -Oz` を CI のビルドに入れる。symbology は Cargo の feature フラグで
  絞れるようにし、ブラウザ向けビルドは利用頻度の高いものだけを含める。
- PDF（`qrcc-print`）はフォント埋め込みでサイズが大きいためブラウザには配らない。
- **rxing は wasm32 でそのままだと panic する。** 検出結果に `chrono::Utc::now()` が
  入っており、wasm32 にはプラットフォーム時計が無い。`wasm_support` feature
  （`chrono/wasmbind`）で解決する。`bun test`（ホスト）では露見せず、
  実ブラウザで初めて分かった。Worker 側でデコードする場合も同じ対応が要る。
