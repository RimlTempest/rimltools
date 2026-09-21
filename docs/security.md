# セキュリティ（多重防御）

RimlTools のセキュリティ対策を、**攻撃が通る経路の順に並べた層**としてまとめる。
1 つの層が破られても次の層で止まるように重ねている（ADR-0006）。
新しい対策を足すときは、どの層の何を止めるものかをこの表に書き足すこと。

```
 開発端末 ─▶ 依存の取得 ─▶ リポジトリ ─▶ CI ─▶ デプロイ ─▶ 実行時 ─▶ 監視
 (lefthook)  (bun/Dependabot) (ruleset)  (Actions) (environment) (WAF/headers) (alerts)
```

## 1. 開発端末

| 対策                                                                  | 止めるもの                                     | 設定場所                                                                    |
| --------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------- |
| lefthook `secrets`（gitleaks、無い端末では grep）                     | secret のコミット                              | `lefthook.yml`、`.gitleaks.toml`                                            |
| bun は依存の lifecycle script（`postinstall` など）を既定で実行しない | install 時に任意コードを実行する悪性パッケージ | bun の既定動作。許可するときだけ `trustedDependencies` に足す（現在は無し） |
| `.dev.vars` / `.env*` を gitignore                                    | ローカルの secret の混入                       | 各プロダクトの `.gitignore`                                                 |

## 2. 依存の取得（サプライチェーン）

| 対策                                                          | 止めるもの                                                    | 設定場所                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| `minimumReleaseAge = 7 日`                                    | 乗っ取られたアカウントから公開された直後の悪性版              | `bunfig.toml`                                     |
| Socket bun security scanner（free mode）                      | 既知のマルウェア・typosquat・難読化されたパッケージの install | `bunfig.toml` の `[install.security]`             |
| `bun install --frozen-lockfile`（CI）                         | lockfile に無い版の混入                                       | 各 workflow                                       |
| Dependabot（cooldown 7 日 / major 14 日、PR は develop 宛て） | 古い依存の放置。更新も「寝かせてから」入れる                  | `.github/dependabot.yml`                          |
| Dependabot security updates                                   | 既知の脆弱性の放置（cooldown なしで即 PR）                    | リポジトリ設定（有効）                            |
| `bun audit --audit-level=high`                                | npm の勧告（high 以上）が付いた依存                           | `package.json` の `audit`、`security.yml`         |
| osv-scanner（`bun.lock` / `Cargo.lock`）                      | OSV に載った脆弱性（npm と crates.io の両方）                 | `security.yml`、除外は `.github/osv-scanner.toml` |
| dependency-review（PR）                                       | PR で新たに入る high 以上の脆弱性・強いコピーレフト           | `security.yml`                                    |

注意:

- `minimumReleaseAge` は **bun.lock に既に載っている版には効かない**（oven-sh/bun#30525）。
  lockfile を書き換える経路は Dependabot だけにして、そちらに cooldown を掛けている。
- Socket scanner は free mode で、パッケージ名と版を Socket の公開 API に送る（コードは送らない）。

## 3. リポジトリ

| 対策                                          | 止めるもの                                                 | 設定場所                              |
| --------------------------------------------- | ---------------------------------------------------------- | ------------------------------------- |
| ruleset（main / develop）                     | 直接 push・force push・削除、CI を通っていない変更のマージ | GitHub（Terraform へ移行予定）        |
| required checks `gate` と `security-gate`     | テスト・検査が落ちた変更のマージ                           | ruleset                               |
| main へ入れられるのは develop / hotfix/* だけ | レビューを経ない本番反映                                   | ADR-0002（`release-guard`）           |
| secret scanning + push protection             | 既知形式のトークンの push                                  | リポジトリ設定（有効）                |
| Private vulnerability reporting               | 脆弱性が公開 Issue で晒されること                          | リポジトリ設定（有効）、`SECURITY.md` |
| CODEOWNERS                                    | 供給網・権限に効くファイルの無自覚な変更                   | `.github/CODEOWNERS`                  |

## 4. CI（GitHub Actions）

| 対策                                                    | 止めるもの                                                             | 設定場所                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| すべての `uses:` を 40 桁 SHA に固定（`# vX.Y.Z` 付き） | タグの付け替えによる action の乗っ取り（2026-03 の trivy-action 事件） | 全 workflow、検査は `scripts/security/pinned-actions.ts` |
| スキャナのバイナリは sha256 を照合してから実行          | 配布物の差し替え                                                       | `security.yml` の `env`                                  |
| 既定 `permissions: {}`、ジョブ単位で最小権限            | 乗っ取られたステップによるトークンの悪用                               | 全 workflow                                              |
| `persist-credentials: false`                            | checkout したトークンが後続ステップや成果物に残ること                  | 全 workflow                                              |
| `pull_request_target` を使わない                        | fork の PR から secret を読まれること                                  | 方針（zizmor が検出）                                    |
| zizmor（SARIF + ゲート）                                | テンプレートインジェクション・危険なトリガー・既知の脆弱な action      | `security.yml`、`.github/zizmor.yml`                     |
| actionlint                                              | workflow の構文・型・shellcheck の誤り                                 | `security.yml`                                           |
| CodeQL（js/ts・actions・rust、security-extended）       | コードの脆弱性（SAST）                                                 | `codeql.yml`                                             |
| gitleaks（PR 差分・push・週次で全履歴）                 | push protection をすり抜けた secret                                    | `security.yml`、`.gitleaks.toml`                         |

使っていないもの:

- **trivy-action**: 2026-03 にタグの改ざん事件があったため使わない（IaC の検査は checkov / tflint）。
- **step-security/harden-runner**: ランナーの外向き通信を監査できるが、通信先の情報を
  StepSecurity に送る。導入するなら audit モードから始める（今後の検討事項）。
- **zizmor の `self-repository`（`uses: $/...`）**: actionlint 1.7.12 が未対応のため無効（`.github/zizmor.yml`）。

## 5. デプロイ

| 対策                                                            | 止めるもの                               | 設定場所                      |
| --------------------------------------------------------------- | ---------------------------------------- | ----------------------------- |
| `staging` / `production` の GitHub environment に secret を分離 | 本番トークンが main 以外から読まれること | Terraform（B レーン）         |
| Cloudflare API トークンは用途ごとに最小権限で発行               | トークン漏洩時の被害範囲                 | Terraform（B レーン）         |
| 段階リリースと自動ロールバック                                  | 壊れた版が全利用者に届くこと             | ADR-0003（C レーン）          |
| 本番ビルドの来歴（attest-build-provenance）                     | 出所の分からない成果物のデプロイ         | リリース workflow（C レーン） |

## 6. 実行時

| 対策                                                           | 止めるもの                               | 設定場所                             |
| -------------------------------------------------------------- | ---------------------------------------- | ------------------------------------ |
| WAF マネージドルール（Free）・rate limiting ルール             | 既知の攻撃パターン・総当たり             | Terraform（B レーン）                |
| 内部 Worker に routes を持たせない（`workers_dev: false`）     | 認可をすり抜けた直接アクセス             | 各プロダクトの ADR-0002、CI の guard |
| セキュリティヘッダ（CSP / HSTS / X-Content-Type-Options など） | XSS・ダウングレード・MIME スニッフィング | 今後の plan（プロダクトごとに実装）  |
| staging を Cloudflare Access で閉じる                          | 未リリース機能・staging データの露出     | Terraform（B レーン）                |

## 7. 監視

| 対策                                                 | 止めるもの                                     | 設定場所                     |
| ---------------------------------------------------- | ---------------------------------------------- | ---------------------------- |
| secret scanning alerts                               | 過去に混入した secret の見落とし               | リポジトリ設定               |
| コードスキャン（CodeQL・zizmor・Scorecard の SARIF） | 検出の見落とし（Security タブに集約）          | 各 workflow                  |
| OpenSSF Scorecard（週次）                            | 供給網の衛生状態の劣化（固定・保護・権限など） | `scorecard.yml`              |
| 週次の security.yml（全履歴の gitleaks・osv・audit） | 公開後に見つかった勧告の見落とし               | `security.yml` の `schedule` |

## 除外（allowlist）の管理

除外は必ず **理由** と、可能なら **期限** を書く。期限が切れた除外は再び検出されるので、そのときに見直す。

| 除外                                                    | 理由                                                                               | 期限                     | 場所                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------ | ------------------------------------ |
| RUSTSEC-2024-0436（paste）                              | unmaintained の情報扱い。image → exr → pulp 経由の proc-macro でビルド時のみ       | 2026-12-22               | `.github/osv-scanner.toml`           |
| RUSTSEC-2026-0192（ttf-parser）                         | unmaintained の情報扱い。rxing → imageproc → ab_glyph 経由。フォント描画は使わない | 2026-12-22               | `.github/osv-scanner.toml`           |
| gitleaks: `abcdefghjkmnpqrstvwxyz0123456789`            | qrcc の共有トークンのテスト用固定値                                                | —                        | `.gitleaks.toml`                     |
| gitleaks: `.agents/skills/` `.claude/skills/`           | 取り込んだスキルの説明文にある架空の悪い例                                         | —                        | `.gitleaks.toml`                     |
| zizmor / pin 検査: `qrcc-deploy.yml` `noter-deploy.yml` | 段階リリースの workflow（C レーン）に置き換える予定の旧デプロイ                    | 置き換え時に削除         | `.github/zizmor.yml`、`security.yml` |
| `overrides.sharp = 0.35.4`                              | GHSA-rgj7-g3m4-5g8c。miniflare が 0.35.2 に完全固定しているため上書き              | miniflare の更新時に削除 | ルート `package.json`                |

## 既知の課題

- **markuplint の隔離インストールに lockfile が無い**（`products/*/tools/markuplint`）。
  直接依存は完全固定だが、推移的な依存は install のたびに解決される。`bun.lock` をコミットして
  Dependabot の対象に加えるべき（プロダクト側の変更）。
- セキュリティヘッダは未実装（上の「実行時」）。
