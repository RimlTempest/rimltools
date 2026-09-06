# ADR-0009: Workers Free に留まり、D1 と DO SQLite 以外のストレージを使わない

- 状態: Accepted
- 日付: 2026-09-06
- 関連: qrcc ADR-0009 を移植・改訂 / [ADR-0001](0001-stack.md) /
  [ADR-0005](0005-persistence-alarm-coalescing.md)

## 文脈

絶対条件は「**こちらが許可しない限り絶対に課金されない**」こと。

|                                                 | 超過したときの挙動                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| Workers Free（Workers / DO / D1 / KV を含む）   | **課金されない。** 上限に達するとリクエストがエラーになって止まる   |
| R2                                              | **従量課金される。** しかも利用上限（ハードキャップ）を設定できない |

R2 を有効化した時点で「絶対に課金されない」は成立しなくなる。

## 決定

- **Workers Free プランに留まる。** Workers Paid を契約しない
- **R2 を使わない。有効化もしない**（有効化には支払い方法の登録が要る）
- **KV を使わない**
- **Durable Object は SQLite backed（`new_sqlite_classes`）のみ**。KV backed は Paid 限定
- 使うのは **D1・DO（SQLite）・Cache API** だけ

## 理由

- 文書本文は DO の SQLite に 1 行（[ADR-0005](0005-persistence-alarm-coalescing.md)）。
  メタデータは D1。画像やファイルの添付は v1 のスコープ外なので R2 の用途が無い
- KV の無料枠は書き込み 1,000/日で、noter で書きたいもの（セッション・文書）は
  すべて D1 のほうが上限が緩い
- Free の DO は **100k req/日、13,000 GB-s/日、行書き込み 100k/日、5 GB**。
  リアルタイム編集をこの中に収める設計が `docs/free-tier-budget.md`

## 帰結

- 支払い方法を登録しない限り、構造的に課金されない
- `wrangler.jsonc` に `r2_buckets` / `kv_namespaces` を書かない。CI の `guard` が検査する
- 枯渇の順序は **DO 行書き込み → DO/Workers リクエスト → D1 行書き込み**。
  最初のレバーは `PERSIST_DELAY_MS`
- 添付ファイルが要件になったら、この ADR を読み直して「R2 にハードキャップが
  実装されたか」を確認し、新しい ADR で決め直す。**黙って有効化しない**
