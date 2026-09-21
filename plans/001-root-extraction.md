# plan 001: qrcc と noter の共通部分をルートへ抜き出す

- 状態: 段階 1 を実施（PR `refactor/root-extraction-1`）。段階 2・3 は未着手
- 目的: 2 つのプロダクトで同じもの・ほぼ同じものを 1 か所にし、3 つ目以降のツールが
  「products/<tool> を足すだけ」で同じ規約・道具に乗れるようにする（ADR-0001）
- 原則: **挙動を変えないリファクタ**。各段階で `bun run check` と `bun run test`
  （両プロダクト + ルート）が通ること。差分が大きいものは無理に共通化しない

類似度は、プロダクト名（qrcc / noter）を伏せて比べた値（1.00 = 同一）。

## 段階 1（このブランチ）

| 対象                                                    | 前                                              | 後                                                      | 備考                                                                  |
| ------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| 外部 skill（34 個）と `skills-lock.json`                | 各プロダクトに 1 組ずつ（同一）                 | ルートの `.agents/skills` + `.claude/skills`（symlink） | `rust-best-practices` は qrcc だけにあったのをルートへ                |
| `*-typescript` / `*-html-a11y` / `*-tdd` / `*-worktree` | プロダクトごとに 4 × 2                          | `rimltools-*` 4 本 + `<tool>-conventions` 2 本          | 固有の例・例外・レイヤは conventions に移し、落とした規則は無い       |
| `*-architecture`                                        | 各プロダクト                                    | 各プロダクト（据え置き）                                | 類似度 0.43。中身がプロダクト固有                                     |
| `tsconfig.base.json`                                    | 各プロダクト（同一）                            | ルート 1 つ                                             | ルートの `tsconfig.json` は emit を打ち消して scripts/packages を検査 |
| markuplint の隔離インストール（TS 6 固定）              | 各プロダクト（同一、lockfile なし）             | `tools/markuplint`（**lockfile をコミット**）           | postinstall は `--frozen-lockfile` のみ。推移的依存が固定された       |
| `.markuplintrc.json`                                    | 各プロダクト（同一）                            | 各プロダクト（据え置き）                                | ルートから読むと結果が変わる（下記「段階 2」）                        |
| oxlint plugin                                           | `oxlint-plugin-qrcc` / `-noter`（名前以外同一） | `tools/oxlint-plugin-rimltools`                         | 規則名は `rimltools/*` に統一                                         |
| `.claude/settings.json`                                 | 各プロダクト（cargo 以外同一）                  | ルート（共通）+ qrcc（cargo のみ）                      |                                                                       |
| `scripts/wt.sh` / `scripts/archify.sh`                  | 各プロダクト（0.99 / 同一）                     | ルート。`<tool>` を引数で受ける                         | wt は develop 基点・develop 宛て PR に変更（ADR-0002）                |

## 段階 2（前提: PR #2〜#7 と監視系 PR がマージ済み）

衝突を避けるため、`products/**` のコードと CI に触る統合は並行 PR がすべて入ってから行う。

1. **`packages/contract`（`@rimltools/contract`）** — `shared/contract` は 12 ファイル共通のうち 8 が同一。
   - 共通化: `result` / `brand` / 同一の 8 ファイル。
   - 据え置き: `id.ts`（0.73。ID の接頭辞と文字集合がプロダクトごと）は「生成関数を受け取る汎用版」を
     packages に置き、プロダクトは接頭辞だけ渡す。`rpc.ts`（qrcc のみ）、`document-kind` / `limits` / `role`（noter のみ）は
     プロダクトに残す。
   - `products/*/shared/contract` は packages を再 export する薄い層にし、import 元の一斉置換は別コミット。
2. **`packages/ui`（`@rimltools/ui`）** — `shared/ui` は 25 ファイル共通のうち 9 が同一、9 がクラス名の接頭辞だけ違う。
   - コンポーネント（button / field / live-region / skip-link / visually-hidden / theme）と print / utilities の CSS を共通化し、
     クラス名の接頭辞（`qrcc-` / `noter-`）を `rt-` などの共通接頭辞に寄せる（見た目の差分が出ないことを a11y / e2e で確認）。
   - `tokens.css`（0.31）・`index.css`（0.47）・`components.css`（0.64）はデザインが分岐しているので据え置き。
     共通トークンは riml-ds（npm）に寄せる方針で、packages には持たない。
   - qrcc の `window`（mado UI）と noter の `avatar` はプロダクトに残す。
3. **`packages/shell`** — `features/shell/ui` のうち breadcrumbs / global-nav / link-renderer / router-link / app-shell /
   register-sw（0.97〜0.99）を共通化。`root.route.tsx`（0.69）・`nav-items.ts`（0.79）・`shell.css`（0.70）はプロダクトに残す。
4. **lint / fmt 設定の一本化** — ルートの `.oxlintrc.json` / `.oxfmtrc.json` に products の overrides を集約し、
   `ignorePatterns` の `products/**` を外す。lefthook のプロダクト別グループをルート 1 つに簡素化。
   - `.markuplintrc.json`: 同一ファイルでも、ルートに置く（または products から `extends` する）と
     qrcc でエラー 6 件・警告 73 件になる（プロダクト直下なら 0 件）。`overrides` の相対 glob と
     React spec の解決が設定ファイルの位置基準で変わるため。原因を切り分けてから一本化する。
5. **CI を tools.json 駆動の再利用ワークフロー 1 本に** — `qrcc-ci.yml` / `noter-ci.yml` の差分は
   guard（不変条件）と Rust ジョブだけ。`tools.json` に `rust` / guard の定義を持たせ、matrix で回す。
6. **smoke スクリプトの共通化** — `scripts/smoke*.ts`（smoke-cli は同一、smoke は 0.86）をルートの
   リリーススクリプト（PR #7）の汎用 smoke と統合する。
7. **archify** — モノレポ化後、archify は `--repo-root` に git のトップを要求するが、仕様 JSON の
   `source` はプロダクト相対。仕様のパスを `products/<tool>/...` に書き換えるか、archify に
   サブディレクトリ用の指定があるか確認して直す（現状 `bun run archify` は失敗する）。

## 段階 3（前提: 段階 2）

1. **`features/auth` の共通部分** — 37 ファイル共通だが同一は 0。類似度 0.88 以上は
   `server/auth.ts`（0.88）・`schema.ts`（0.88）・`sql.ts`（0.91）・`auth-options.ts`（0.95）・
   `current-actor.ts`（0.97）・`link-account.ts`（0.97）・`guest-guide.ts`（0.99）・`actor-wire.ts`（同一）。
   Better Auth の設定（Google + ゲスト + アカウント昇格）と actor の型を `packages/auth` にし、
   プロダクト固有（qrcc の `api-actor`・`share-policy`（0.17）、noter の `account-settings`・`promotion-store`（0.17））は残す。
   D1 のスキーマ（`schema.ts`）はプロダクトの migration と結びつくので、スキーマ定義は共通・migration はプロダクト、の形にする。
2. **ADR の重複をルートへ** — 両プロダクトの ADR-0006（TypeScript 7 と oxc）・0007（feature の同居）・
   0008（RSC の見送り）は同じ判断を扱っている（本文の類似度は平均 0.52 なので、統合時に差分を読み比べる）。ルート ADR に統合し、プロダクト側は「ルート ADR-00xx に移した」の
   スタブを残す（番号は変えない）。
3. `docs/free-tier-budget.md` / `docs/deployment.md` の共通部分（Workers Free の上限、デプロイの流れ）を
   ルートの `docs/platform.md` と `docs/release.md`（PR #7）に寄せ、プロダクト側は固有の試算だけにする。

## 共通化しないもの

- ドメイン（`features/*` のうち auth / shell 以外）、`docs/architecture.md`・`domain-model.md`
- PWA のアイコン・manifest（`apps/web/public`、0.23）
- `lanes.tsv`・`parallel-lanes.md`（プロダクトごとのレーン定義）
