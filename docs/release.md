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

出すツールは「`apps/<tool>/` 配下の変更（`*.md`・`docs/`・`plans/` を除く）」で決まる。
`package.json` / `bun.lock` / `bunfig.toml` / `mise.toml` / `tools.json` / `packages/**` が変わると全ツールを出す。

## 2. 本番リリースの段階（ADR-0003）

`deploy-production.yml` → `release.yml` → `scripts/release/release.ts`。Worker は **下流（internal）から順に** 出す。

1. **build** — プロダクトの `bun run build`
2. **prepare** — ビルド出力の `wrangler.json` を環境向けに書き換える（Worker 名・D1・service / DO 参照・`APP_ORIGIN`、`routes` 削除）。
   本番では `APP_LEGACY_ORIGINS` に `tools.json` の `legacyHosts` を入れる。ドメイン移行中（Terraform の `legacy_hosts_mode`）に旧ホストで開かれてもログインが成立する
3. **migrate** — `wrangler d1 migrations apply <db> --remote`（expand だけのはず。§4）
4. **upload** — `wrangler versions upload`。この時点では誰にも配信されない
5. **blue/green 検証** — 新版を **0%** で deployment に加え、`Cloudflare-Workers-Version-Overrides: <worker>="<version>"` を付けて本番ドメインで smoke（HTML と参照アセット全数が 200）
6. **canary** — `tools.json` の `release.steps`（既定 10% → 50%）。各段で `bakeMinutes` 待ち、版ごとのエラー率で判定。
   版ごとの数字の出どころは実行時に選ぶ（`scripts/release/sources.ts`）:
   1. GraphQL Analytics — `workersInvocationsAdaptive` の dimensions に版の次元（`scriptVersion` など）があるか introspection で確かめ、あれば使う
   2. Workers Logs（Workers Observability Query API）— invocation log（`$metadata.type = cf-worker-event`）を版と outcome で group by。
      キー名は `telemetry/keys` で実在を確かめてから使う（候補: `$workers.scriptVersion.id` など）。outcome が `ok` / `canceled` / `unknown` 以外を失敗に数える
   3. どちらも使えない、または集計が失敗した — **ロールバックしない**。割合を保ったまま `needs-human` で止まる（§5 の promote / rollback / resume で決める）。
      ロールバックするのは「新版が悪い」根拠（smoke の失敗、エラー率の超過）があるときだけ
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

| 種類                        | 名前                                             | 例                                    |
| --------------------------- | ------------------------------------------------ | ------------------------------------- |
| secret                      | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`  | 最小権限のトークン                    |
| secret（staging / preview） | `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | Access の service token               |
| secret（staging / preview） | `APP_SECRETS`                                    | `{"qrcc": {"BETTER_AUTH_SECRET": …}}` |
| variable                    | `RIMLTOOLS_ENV`                                  | `staging` / `production` / `preview`  |
| variable                    | `BASE_DOMAIN`, `CF_ZONE_ID`                      | `tools.riml4i.com`                    |
| variable                    | `WORKER_SUFFIX`                                  | production は空、ほかは `-staging`    |
| variable                    | `D1_<TOOL>_ID`                                   | `D1_QRCC_ID`                          |

### CI 用 Cloudflare API トークンの権限

Terraform が発行するトークン（`CLOUDFLARE_API_TOKEN`）に必要な permission group:

| 対象               | permission group              | 使うところ                                                                                                                           |
| ------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Account            | `Workers Scripts Write`       | `versions upload` / `versions deploy` / `deploy`、deployments の参照                                                                 |
| Account            | `D1 Write`                    | `d1 migrations apply`                                                                                                                |
| Account            | `Account Analytics Read`      | GraphQL Analytics（canary 集計の第 1 候補）                                                                                          |
| Account            | `Workers Observability Write` | Workers Logs の `telemetry/keys` と `telemetry/query`（canary 集計の第 2 候補）。API に Read の権限は無く、query も Write を要求する |
| Zone（riml4i.com） | `Workers Routes Read`         | wrangler が zone のルートを確認するとき                                                                                              |

`Account Analytics Read` と `Workers Observability Write` の両方が無いと、canary は毎回 `needs-human` で止まる（ロールバックはしない）。
invocation log は `observability.enabled: true` で既定有効。`invocation_logs: false` の設定は prepare が拒否する。

### テレメトリ（任意、docs/ops/telemetry.md）

| 種類     | 名前                    | 入る先                                                                                                 |
| -------- | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| variable | `GRAFANA_OTLP_ENDPOINT` | `OTEL_EXPORTER_OTLP_ENDPOINT`（`OTEL_SERVICE_NAME` を宣言している Worker だけ）                        |
| variable | `FARO_URL_<TOOL>`       | そのツールの `FARO_URL`                                                                                |
| secret   | `GRAFANA_OTLP_HEADERS`  | `OTEL_EXPORTER_OTLP_HEADERS`。送り先が入った版にだけ `versions upload --secrets-file` で同じ版に載せる |

`DEPLOYMENT_ENV`（環境名）と `GIT_SHA`（コミット）は prepare が常に入れる。未設定の値は空のまま（テレメトリ無効）。
`wrangler versions secret put` は使わない（最新版から別の版を作るので、upload した版と食い違う）。

### アプリの secret（`BETTER_AUTH_SECRET` など）

どの secret が要るかは `tools.json` の `appSecrets`（public Worker が読むもの）。

- **staging / preview**: Terraform が値を作り（`BETTER_AUTH_SECRET` は生成、Google OAuth は人が用意した
  クライアント）、environment secret `APP_SECRETS` に書く。リリースは public Worker の版に
  `versions upload --secrets-file` で載せる（`scripts/release/secrets.ts`）
- **production**: 何も入れない。本番の Worker は自分の secret を持っていて、新しい版に引き継がれる。
  本番で `APP_SECRETS` が渡されたら、リリースは上書きせず失敗する

**`--secrets-file` と既存 secret の引き継ぎ**: `wrangler versions upload`（wrangler 4.127 の
`uploadWorkerVersion`）は常に `keepSecrets: true` で upload する。ソースのコメントは
"we never delete secret bindings when uploading, even if we are setting secrets from a file / so inherit
all unchanged secrets from the previous Worker Version"。つまり secrets-file に書いた名前だけが
追加・更新され、書いていない secret（本番の `BETTER_AUTH_SECRET` など）は前の版から引き継がれる。
wrangler を上げるときは、この挙動が変わっていないか `node_modules/wrangler/wrangler-dist/cli.js` の
`uploadWorkerVersion` を確認する。

リポジトリ secret（任意）: `RELEASE_BOT_TOKEN` — Release PR / back-merge PR を作るトークン。
`GITHUB_TOKEN` で作った PR には `pull_request` のワークフロー（`release-guard`）が走らないため。
無い場合は、Release PR を一度 close → reopen すると検査が走る。

## デプロイ先が未設定の間の動き

Deploy staging / Deploy production / Flags は、リポジトリ変数 `RELEASE_ENVIRONMENTS`（JSON の配列）に
含まれる environment にだけ出す。含まれていなければ、ビルドの前にジョブごとスキップする。
この変数は Terraform（`infra/terraform` の `release_environments`）が、その environment の secret と
variable を書き込んだあとに作る。Terraform を適用する前の push でワークフローが赤くならないのはこのため。
