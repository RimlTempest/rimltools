# Runbook: 本番を戻す（ロールバック）

**まず戻す、原因はあとで。** Workers は直近 100 版を保持しており、戻すのは配信割合の切り替えだけ（数秒）。
コードの revert や再ビルドは要らない。

## 0. 状況を見る（1 分）

- Actions → 最新の **Deploy production** の Summary（Worker ごとの結果・版 ID・理由）
- `bunx wrangler deployments list --name <worker>` — いま何 % がどの版か
- Cloudflare dashboard → Workers → `<worker>` → Deployments / Metrics（版ごとのエラー）

## 1. 自動ロールバックが済んでいる場合

リリースの途中（0% 検証・canary・100% 後の smoke）で落ちたものは、ワークフローが **直前の安定版を 100%** に戻している。
Summary の「結果」が `rolled-back` なら、利用者への影響はすでに止まっている。§4 へ。

## 2. 手で戻す

GitHub → Actions → **Deploy production** → Run workflow（branch: `main`）

- tool: `qrcc` など
- action: `rollback`
- worker: 空（public → internal の順に全 Worker）または特定の Worker
- version: 空（直前の安定版）または戻したい版 ID

Actions が使えないとき（手元、トークンが要る）:

```bash
bunx wrangler deployments list --name qrcc-web           # 戻す先の版 ID を確認
bunx wrangler versions deploy <version-id>@100% --name qrcc-web --yes
# 上流（web）→ 下流（api）の順に戻す
```

最後の手段: dashboard → Workers → `<worker>` → Deployments → 版を選んで **Rollback**。

## 3. canary が `needs-human` で止まった

次のどれかで判定できず、割合（例: 10%）のまま止まっている。Summary の理由を見る。

- 新版へのトラフィックが少なすぎる（`only N/200 requests …`）
- 版ごとに数える手段が無い（`no analytics source …`）: トークンに `Account Analytics Read` / `Workers Observability Write` があるか確認（docs/release.md §6）
- 集計 API が失敗した（`analytics query failed: …`）

どれも「新版が悪い」根拠ではないので自動では戻していない。Metrics / Workers Logs を目で見て決める。

- 新版を信用できる → Deploy production を `resume`（tool / worker / version は Summary の値）
- 急がない・迷う → `rollback`（安全側）
- 明らかに大丈夫 → `promote`（その版を 100%）

## 4. 戻したあと

1. `main` は壊れた変更を含んだまま。**revert の PR を develop に**出す（急ぐなら `hotfix/*` から main へ）
   - 次の Release PR をマージすると、壊れた版がもう一度出てしまうため
2. D1 migration を含むリリースだった場合: expand だけなら旧版でも動くので DB は戻さない
   （contract を含んでいたなら、それ自体が手順違反。`docs/release.md` §4）
3. noter-sync（Durable Object）は `wrangler deploy` で一括で出ている。戻すときは DO の migration が
   含まれていないか確認する（新しい DO クラスの追加を戻すと、そのクラスのオブジェクトに届かなくなる）
4. 障害の記録を Issue（`incident` ラベル）に残す: 時刻・影響・検知・戻した方法・原因・再発防止
