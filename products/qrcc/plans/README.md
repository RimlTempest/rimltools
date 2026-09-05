# Implementation Plans

improve スキルが 2026-09-03 に作成。依存関係が無い限り下の順に実行する。
実行者は計画を最後まで読んでから着手し、STOP conditions を守り、
終わったら自分の行を更新すること。

## Execution order & status

| Plan | Title                                                                      | Priority | Effort | Depends on | Status |
| ---- | -------------------------------------------------------------------------- | -------- | ------ | ---------- | ------ |
| 001  | トップページの生成と読み取りを WebMCP のツールとしてエージェントに公開する | P2       | M      | —          | TODO   |

Status の値: TODO / IN PROGRESS / DONE / BLOCKED（理由を 1 行）/ REJECTED（理由を 1 行）

## Dependency notes

- 001 は独立している。他の計画に依存しない。

## この計画で決めたこと（オーナーの判断）

- **公開範囲は生成と読み取りのみ。** 保存・一覧・共有はツールにしない。
  認証が要り、D1 書き込みと Worker リクエストで無料枠を消費するため。
- **Origin Trial トークンは登録しない。** コードは入れるが、実ユーザーには
  仕様が正式化するまで効かない。API が無い環境で挙動が変わらないことを
  テストで固定する。

## Findings considered and rejected

- **`webmcp-types` を依存に追加する**: 見送り。2026-09-03 時点で 0.1.6 と
  変動が激しく、必要なのは構造型 3 つだけなので自前で持つほうが安い。
- **ツールから画面の状態を動かす（フォームを埋める）**: v1 では見送り。
  `GenerateScreen` の状態リフトアップが必要で、計画の範囲を超える。
  WebMCP の本来価値なので、次の一手として 001 の Maintenance notes に記録済み。
- **宣言的 API（HTML `<form>` ベースの WebMCP）**: 見送り。仕様側でエラー処理が
  TBD（webmcp Issue #182）で、命令的 API より不確実。
