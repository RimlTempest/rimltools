# ADR-0004: feature flag は OpenFeature 互換の自前実装（D1）

- 状態: 採用（2026-09-22）

## 決定

- `packages/flags`（`@rimltools/flags`）に OpenFeature の Provider 形の評価器を置く。コードは OpenFeature のインターフェースだけに依存する。
- flag の定義は **リポジトリの `flags/<tool>.json`（GitOps）** が正本。main / develop へのマージで D1 の `feature_flags` 表へ同期する。
  評価側は D1 から読み、Cache API に 60 秒キャッシュする（D1 の rows read を抑える）。
- 緊急停止（kill switch）は `workflow_dispatch` で D1 を直接更新し、あとで PR で正本に反映する。
- 振り分けは `(flagKey, subjectId)` の一貫ハッシュ。subjectId はサインイン済みなら user id、未サインインなら匿名 cookie。
- 露出（exposure）は構造化ログ `{"event":"flag_exposure","flag","variant","tool"}` を Workers Logs に出し、集計スクリプトで読む。

## 理由

- Flagship（Cloudflare 公式）は public beta で、Free プランでの上限・料金が未公表。内部で KV を使う（KV は ADR-0009 で不使用）。
- OpenFeature に揃えておけば、Flagship が GA になったとき Provider の差し替えだけで移れる。
- flag の変更が PR に残る（誰が・いつ・なぜ）ので監査しやすい。

## 使い分け

| 目的           | 設定                                                           |
| -------------- | -------------------------------------------------------------- |
| ダークローンチ | `enabled: true`、`rules` で自分の user id だけ ON              |
| 機能のカナリア | `rollout: 1 → 10 → 50 → 100`（percentage）                     |
| A/B テスト     | `variants: { control: 50, treatment: 50 }`、`experiment: <id>` |
| kill switch    | `enabled: false`                                               |
