# 障害対応（incident）

`incident` ラベルの Issue は synthetic 監視が 2 回連続（60 秒間隔）で失敗すると自動で立ち、回復すると自動で close される。
人が気づいた場合も同じ流れで対応する（Issue が無ければ `incident` ラベルで手で立てる）。

## 1. 最初の 5 分（止血を優先する）

1. **影響を確かめる** — Issue の失敗内容（どの URL が何を返したか）と、実際にブラウザで開いた結果。
2. **直前の変更を疑う** — 直近の本番リリース（`main` の Actions の release ワークフロー、Cloudflare の Deployments）。
   リリース直後なら、原因を調べる前に **[rollback.md](rollback.md) で直前の版に戻す**。版の切り替えは数秒で、データは失わない。
3. **無料枠を疑う** — 1027 エラーや全ツール同時の失敗は日次上限の枯渇が多い。[free-tier-exhausted.md](free-tier-exhausted.md)。
4. **Cloudflare 側を疑う** — https://www.cloudflarestatus.com/ を確認する。

## 2. 記録する

Issue に時系列でコメントする（何を見て、何をしたか、結果どうなったか）。あとで振り返りに使う。

## 3. 直す

- 戻したら、修正は通常どおり `develop` → Release PR で出す。急ぐなら `hotfix/*` → `main`（ADR-0002）。
- 版を戻しても D1 のスキーマは戻らない。expand → contract の規則（docs/platform.md §3）を守っていれば旧版でも動く。

## 4. 振り返り（close 後 1 週間以内）

Issue に次のテンプレートでコメントし、再発防止のタスクを Issue に切り出す。

```markdown
## 振り返り

- 影響: いつからいつまで / どのツール / 何ができなかったか
- 検知: 何で気づいたか（synthetic / 利用者 / 自分）、発生から検知までの時間
- 原因: 直接の原因と、それを防げなかった理由（テスト・canary・監視のどこで止められたはずか）
- 対応: 何をして回復したか、回復までの時間
- エラーバジェットへの影響: ダッシュボードの消費率
- 再発防止: #issue, #issue
```

責める相手ではなく仕組みを直す（blameless）。
