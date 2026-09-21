# リリースの手引き（開発者向け）

設計の理由は ADR-0002（ブランチ）・ADR-0003（段階リリース）・ADR-0005（IaC との境界）。
障害時の手順は [`runbooks/rollback.md`](runbooks/rollback.md)。

## 1. ブランチと流れ

```
feature/* ──PR(squash)──▶ develop ──自動──▶ staging（<tool>-staging.tools.riml4i.com）
                             │
                             └─ Release PR（自動作成）──merge commit──▶ main ──自動──▶ production
hotfix/* ──PR──▶ main ──自動──▶ production、その後 main → develop の back-merge PR が自動で立つ
```

| いつ                   | 何が起きるか                                                                        | ワークフロー                            |
| ---------------------- | ----------------------------------------------------------------------------------- | --------------------------------------- |
| develop 宛て PR        | 変更のあったツールの preview 版を staging Worker に upload し、URL を PR にコメント | `preview.yml`                           |
| develop / main 宛て PR | 出入口の検査（下記）と CI（`gate`）                                                 | `release-guard.yml` / `ci.yml`          |
| develop に push        | staging へリリース、Release PR を作成・更新                                         | `deploy-staging.yml` / `release-pr.yml` |
| main に push           | production へ段階リリース                                                           | `deploy-production.yml`                 |
| main に hotfix が入る  | develop への back-merge PR                                                          | `backmerge.yml`                         |

`release-guard` が落とすもの:

- main 宛て PR の head が `develop` でも `hotfix/*` でもない
- `release-freeze` ラベル付きの Release PR に `fix:` / `revert:` 以外のコミットがある（エラーバジェット枯渇中。ADR-0007）
- `DROP` / `RENAME` を含む D1 migration に `-- contract:` 注記が無い（§4）

出すツールは「`products/<tool>/` 配下の変更（`*.md`・`docs/`・`plans/` を除く）」で決まる。
`package.json` / `bun.lock` / `bunfig.toml` / `mise.toml` / `tools.json` / `packages/**` が変わると全ツールを出す。

## 2. 本番リリースの段階（ADR-0003）

`deploy-production.yml` → `release.yml` → `scripts/release/release.ts`。Worker は **下流（internal）から順に** 出す。

1. **build** — プロダクトの `bun run build`
2. **prepare** — ビルド出力の `wrangler.json` を環境向けに書き換える（Worker 名・D1・service / DO 参照・`APP_ORIGIN`、`routes` 削除）。
   本番では `APP_LEGACY_ORIGINS` に `tools.json` の `legacyHosts` を入れる。ドメイン移行中（Terraform の `legacy_hosts_mode`）に旧ホストで開かれてもログインが成立する
3. **migrate** — `wrangler d1 migrations apply <db> --remote`（expand だけのはず。§4）
4. **upload** — `wrangler versions upload`。この時点では誰にも配信されない
5. **blue/green 検証** — 新版を **0%** で deployment に加え、`Cloudflare-Workers-Version-Overrides: <worker>="<version>"` を付けて本番ドメインで smoke（HTML と参照アセット全数が 200）
6. **canary** — `tools.json` の `release.steps`（既定 10% → 50%）。各段で `bakeMinutes` 待ち、GraphQL Analytics の `scriptVersion` 別の集計で判定
   - 不合格: 新版のエラー率 > max(旧版 + 1pt, 2%)。10 件以上で半数が失敗なら即不合格
   - 判定不能（新版へのリクエストが 200 未満）: public Worker なら override 付き synthetic で補う → 足りなければ bake を延長（最大 3 回）→ それでも足りなければ **割合を保ったまま停止**（`needs-human`、終了コード 3）
7. **100%** → 汎用 smoke → プロダクトの `smoke`（CLI）と `smoke:browser`（Playwright）
8. どこかで失敗 → **直前の安定版を 100% に戻して** 失敗扱い

例外:

- `durableObjects: true` の Worker（noter-sync）は `wrangler deploy` で一括（DO はオブジェクトごとに同時 1 版しか動かず、DO の migration は versions upload で適用できない）
- `release.mode: "big-bang"` のツールは 0% 検証 → 100%（canary 無し）
- staging は 0% 検証 → 100%（canary 無し）。staging は Cloudflare Access の内側なので、smoke は service token（`CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`）付き
- internal Worker（qrcc-api など）は外から叩けないので 0% の smoke は省略。canary の判定は上流経由の実トラフィックだけ（少なければ `needs-human` で止まる）

## 3. ダークローンチ

**版ごと隠す（deploy は済んでいるが誰にも配らない）**

1. main へ入れる前に、`Deploy production` を手で実行しても良いが、通常は段階リリースの 0% 段階を使う
2. 0% の版は、override ヘッダを付けたリクエストにだけ応答する:

```bash
curl -H 'Cloudflare-Workers-Version-Overrides: qrcc-web="<version-id>"' https://qrcc.tools.riml4i.com/
```

ブラウザで見るなら ModHeader などでヘッダを付ける。版 ID はリリースの Summary と `wrangler versions list --name qrcc-web` に出る。

**機能ごと隠す（推奨）** — feature flag（`@rimltools/flags`、ADR-0004）で OFF のまま出し、自分だけ ON にする。

## 4. D1 migration は expand → contract

新旧の版が同時に同じ DB を読む。**1 回のリリースで壊す変更を入れない。**

| 段階                     | 入れてよい変更                                                   | 例                                         |
| ------------------------ | ---------------------------------------------------------------- | ------------------------------------------ |
| expand（先）             | 表・列・索引の追加。新しい列は NULL 可か既定値つき               | `ALTER TABLE codes ADD COLUMN label TEXT;` |
| コード                   | 新旧どちらの列でも動くコードを出し、全版が新コードになるのを待つ | 読み: 新列優先、無ければ旧列               |
| contract（後のリリース） | 旧い列・表の削除や改名                                           | 先頭行に注記が必須 ↓                       |

```sql
-- contract: codes.legacy_label は v2026-10-01 のリリース以降どの版も読まない
ALTER TABLE codes DROP COLUMN legacy_label;
```

`release-guard` の `check-migrations` が、注記の無い `DROP TABLE` / `DROP INDEX` / `ALTER TABLE … DROP` / `ALTER TABLE … RENAME` を落とす。

## 5. 手動操作

GitHub → Actions → **Deploy production** → Run workflow（`main` で実行）。

| action     | 入力                            | 用途                                                           |
| ---------- | ------------------------------- | -------------------------------------------------------------- |
| `rollback` | tool（worker / version は任意） | 直前の安定版に戻す。worker 省略で public → internal の順に全部 |
| `promote`  | tool, version（worker 任意）    | 指定版を 100% にして smoke                                     |
| `resume`   | tool, worker, version           | `needs-human` で止まった canary を、今の割合の次の段から続ける |

手元からは（`CLOUDFLARE_API_TOKEN` などを環境変数に入れて）:

```bash
bun scripts/release/release.ts rollout --tool qrcc --dry-run   # 計画だけ表示
bunx wrangler versions list --name qrcc-web                     # 版の一覧
bunx wrangler deployments list --name qrcc-web                  # 配信割合の履歴
```

## 6. 環境の契約（Terraform が設定する）

GitHub environment `staging` / `production` / `preview` ごとに:

| 種類                        | 名前                                             | 例                                   |
| --------------------------- | ------------------------------------------------ | ------------------------------------ |
| secret                      | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`  | 最小権限のトークン                   |
| secret（staging / preview） | `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | Access の service token              |
| variable                    | `RIMLTOOLS_ENV`                                  | `staging` / `production` / `preview` |
| variable                    | `BASE_DOMAIN`, `CF_ZONE_ID`                      | `tools.riml4i.com`                   |
| variable                    | `WORKER_SUFFIX`                                  | production は空、ほかは `-staging`   |
| variable                    | `D1_<TOOL>_ID`                                   | `D1_QRCC_ID`                         |

リポジトリ secret（任意）: `RELEASE_BOT_TOKEN` — Release PR / back-merge PR を作るトークン。
`GITHUB_TOKEN` で作った PR には `pull_request` のワークフロー（`release-guard`）が走らないため。
無い場合は、Release PR を一度 close → reopen すると検査が走る。
