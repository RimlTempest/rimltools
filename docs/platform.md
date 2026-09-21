# RimlTools プラットフォーム設計

リリース・インフラ・セキュリティ・運用を、プロダクトをまたいで 1 か所にまとめた全体図。
個々の判断の理由は `docs/adr/`、進め方は `plans/`。

**大前提: Cloudflare は Workers Free、GitHub は public リポジトリの無料機能だけで回す。**
（R2 / KV / Logpush / 有料 WAF などは使わない。各プロダクトの ADR-0009 と同じ方針）

## 1. 全体像

```
feature/*  ──PR──▶  develop  ──(自動) staging へデプロイ
                       │
                       └──Release PR──▶  main  ──(自動) production へ段階リリース
                                                  upload → 0%(blue/green 検証)
                                                  → canary 10% → 50% → 100%
                                                  → 失敗すればロールバック
hotfix/*   ──PR──▶  main（develop へも取り込み直す）
```

| 層                   | 道具                                                            | 何を持つか                                                           |
| -------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| コード・ビルド       | bun workspaces / cargo                                          | `products/<tool>/`                                                   |
| バージョン・デプロイ | wrangler（`versions upload` / `versions deploy`）               | Worker のコードと bindings                                           |
| インフラ             | Terraform（HCP Terraform Free で state 管理）                   | ドメイン・DNS・D1・Worker の枠・ルールセット・GitHub の設定と secret |
| 機能の出し分け       | `@rimltools/flags`（OpenFeature 互換、D1 に定義）               | dark launch・A/B・機能単位のカナリア・kill switch                    |
| セキュリティ         | GitHub Actions（CodeQL / gitleaks / osv-scanner / zizmor など） | PR と定期スキャン                                                    |
| 運用                 | GraphQL Analytics / Workers Logs / 定期 synthetic               | SLO・エラーバジェット・自動ロールバック                              |

## 2. 環境

| 環境       | ブランチ  | URL                                                                        | D1               | 用途                      |
| ---------- | --------- | -------------------------------------------------------------------------- | ---------------- | ------------------------- |
| local      | 任意      | `localhost`                                                                | Miniflare        | 開発                      |
| preview    | PR        | `pr-<N>-<worker>.<account>.workers.dev`（staging Worker の preview alias） | staging          | PR ごとの動作確認         |
| staging    | `develop` | `<tool>-staging.tools.riml4i.com`                                          | `<tool>-staging` | 結合・E2E・リリース前確認 |
| production | `main`    | `<tool>.tools.riml4i.com`                                                  | `<tool>`         | 本番                      |

- ポータル: `tools.riml4i.com`（ツール一覧）。
- 旧 URL（`qrcc.riml4i.com` / `noter.riml4i.com`）は 301 で新 URL へ（Single Redirect Rules、Terraform 管理）。
- staging は Cloudflare Access（Zero Trust Free、50 ユーザーまで無料）で本人だけに閉じる。

## 3. リリース戦略（Workers の versions を使う）

用語と Workers での実現方法の対応。詳細は ADR-0003。

| 戦略                          | 実現方法                                                                                                                                                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ブルーグリーン**            | `versions upload` で新版（green）を **0%** で並べ、`Cloudflare-Workers-Version-Overrides` ヘッダで本番ドメイン上の green だけを smoke する。合格したら切り替える。切り戻しは旧版（blue）を 100% に戻すだけ（直近 100 版まで保持）。 |
| **カナリア**                  | `versions deploy new@10% old@90%` → 分析 → 50% → 100%。同じ利用者を同じ版に固定するため、Transform Rule で `Cloudflare-Workers-Version-Key` を付ける（version affinity）。                                                          |
| **ダークローンチ**            | ① コードは 100% 出すが flag は OFF（本人だけ ON）。② 版ごと 0% に置き、override ヘッダを付けた内部リクエストだけを通す。                                                                                                            |
| **A/B テスト**                | flag の variant（例: `control` / `treatment`）を匿名 ID の一貫ハッシュで振り分け、露出イベントを Workers Logs に構造化ログで出して集計する。                                                                                        |
| **feature toggle のカナリア** | flag の percentage rollout（1% → 10% → 50% → 100%）。デプロイとリリースを分離する。                                                                                                                                                 |

自動分析: canary の各段で、GraphQL Analytics（`workersInvocationsAdaptive`、`scriptVersion` 別）から
新旧のエラー率を取得して比べる。閾値を超えたら **自動で旧版 100% に戻して** ワークフローを失敗させる。
トラフィックが少なく統計的に判定できないとき（最低サンプル未満）は、synthetic リクエストで補ってから判定する。

### 共有データとの整合（必須ルール）

新旧の版が同時に動くので、**D1 のマイグレーションは expand → contract の 2 段階に分ける**。

1. expand（列・表の追加だけ）を先に出す → 新旧どちらのコードでも動く
2. 全版が新コードになったあとのリリースで contract（削除・改名）

CI の guard が `DROP` / `RENAME` を含む migration を `-- contract:` 注記なしで弾く。
noter の Durable Object は「1 オブジェクトにつき同時に 1 版」なので、DO クラスの migration を含む
リリースは canary を飛ばして一括切り替えにする（ADR-0003）。

## 4. IaC（Terraform）

`infra/terraform/` に置き、HCP Terraform Free（500 リソースまで）で state を管理する。

| Terraform が持つ                                                | wrangler が持つ                                                |
| --------------------------------------------------------------- | -------------------------------------------------------------- |
| Worker の枠（`cloudflare_worker`）、Custom Domain、DNS          | コードの版（`versions upload`）とデプロイ（`versions deploy`） |
| D1 データベースそのもの                                         | D1 の migration の適用                                         |
| Transform / Redirect / WAF / Rate limit ルール                  | wrangler.jsonc の bindings                                     |
| Cloudflare Access（staging）                                    |                                                                |
| CI 用の Cloudflare API トークン（権限を最小化）                 |                                                                |
| GitHub: リポジトリ設定・rulesets・environments・Actions secrets |                                                                |

- 変更は PR で `terraform plan` の結果をコメントし、`main` へのマージで apply する。
- 手で作るのは **HCP Terraform の組織と workspace、Terraform 用のブートストラップトークン 2 本だけ**（`infra/terraform/README.md`）。

## 5. DevSecOps

| タイミング         | 検査                                                                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| commit（lefthook） | secret 検出、oxlint / oxfmt / markuplint、cargo fmt / clippy                                                                                                           |
| PR                 | 既存 CI、CodeQL（JS/TS・Actions）、dependency-review、gitleaks、osv-scanner、zizmor（workflow の静的解析）、actionlint、`terraform validate` / tflint / checkov（IaC） |
| main マージ        | 上記がすべて green でないとマージできない（ruleset の required checks）                                                                                                |
| 定期（週次）       | CodeQL・osv-scanner の全体スキャン、OpenSSF Scorecard                                                                                                                  |
| 実行時             | セキュリティヘッダ（CSP / HSTS など）、WAF マネージドルール（Free）、rate limiting ルール（Free で 1 本）                                                              |

供給網の対策:

- すべての `uses:` を **コミット SHA に固定**（Dependabot が SHA のまま更新する）。
- `permissions:` をジョブ単位で最小化し、既定は `contents: read`。
- 本番 secret は `production` environment にだけ置き、`main` からのデプロイだけが読める。
- ビルド成果物には `actions/attest-build-provenance` で来歴を付ける（public は無料）。

## 6. SRE

- **SLO**（ツールごと、28 日窓）: 可用性 99.5%（5xx と Worker 例外を失敗とみなす）、ページ表示の p75 は各プロダクトの予算に従う。
- **エラーバジェット**: 消費が 100% を超えたら、`main` へのリリースは修正のみ（`release-freeze` ラベルで CI が機能 PR を止める）。
- **Synthetic 監視**: GitHub Actions の cron（30 分ごと）で本番の smoke を叩き、失敗したら Issue を起票する。
  1 回あたり数リクエストなので、100k req/日 の予算への影響は無視できる。
- **ロールバック手順・障害対応**: `docs/runbooks/`。
- **無料枠の監視**: 日次で Workers requests / D1 rows written を GraphQL から取得し、70% を超えたら Issue を起票する。

## 7. プラットフォームエンジニアリング（golden path）

新しいツールを足す手順を 1 コマンドにする。

```bash
bun run new-tool <name>
```

1. `products/<name>/` をテンプレートから作る（qrcc / noter と同じ構成）
2. `infra/terraform/tools.tf` にツールを 1 行足す（ドメイン・D1・Access・リダイレクトはモジュールが作る）
3. `.github/workflows` はツール一覧（`tools.json`）から生成されるので、手で書かない

ツールの台帳は `tools.json`（名前・サブドメイン・Worker 名・D1・SLO）。
ポータル・CI・Terraform・監視はすべてこれを読む。
