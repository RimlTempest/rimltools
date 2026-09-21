# セルフレビュー チェックリスト

書き終えたコードに対して上から順に確認する。

## 型

- [ ] `any` / `as` / `!` / `enum` / `class` を使っていない
- [ ] 外部入力（HTTP body、URL param、localStorage、フォーム）は `unknown` から
      パース関数を通している
- [ ] 「A のときだけ B がある」を optional ではなく discriminated union で表している
- [ ] 取り違えうる ID・検証済み文字列が Branded type になっている
- [ ] 派生型を手書きせず Utility Types で導出している
- [ ] union にメンバーを足したとき、コンパイルエラーで実装漏れが検出される
      （`switch` + `assertNever`、または Mapped Type のレジストリ）

## エラー

- [ ] ドメイン層で `throw` していない
- [ ] エラー型が `kind` 付きの判別可能ユニオンで、UI が分岐できる情報を持つ
- [ ] `Result` → 例外/HTTP への変換が境界 1 箇所だけで起きている

## 依存

- [ ] I/O（fetch, D1, KV, R2, Date, crypto, random）を引数で受け取っている
- [ ] 依存の型を「利用側」で定義している（実装モジュールを import していない）
- [ ] 配線が composition root に集約されている
- [ ] テストがモックライブラリなしで書けている

## 設計

- [ ] 1 ファイルの責務が 1 つ（SRP）
- [ ] 新しい symbology / payload 種別を「新ファイル + レジストリ 1 行」で足せる（OCP）
- [ ] 抽象を「2 回目の重複」より前に導入していない（KISS / YAGNI）
- [ ] 消した重複が「形」ではなく「知識」の重複である（DRY）
- [ ] `features/<name>/core` に I/O が漏れていない、`import/no-cycle` を踏んでいない

## テスト

- [ ] 失敗するテストを先に書いた（red → green）
- [ ] テストサイズが適切（`.claude/skills/qrcc-tdd` 参照）
- [ ] 境界値（最大長、空、最小/最大バージョン）を含む
