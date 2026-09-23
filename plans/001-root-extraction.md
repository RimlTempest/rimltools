# plan 001: qrcc と noter の共通部分をルートへ抜き出す

- 状態: 段階 1 完了（#10）。段階 2 完了（#20 に #18 を含む。shell は 2b として #20、markuplint 設定の一本化は #22）。段階 2 の残り（smoke・archify・tools.d.ts）と段階 3（auth・ADR）は #26 / #28 / 段階 3c の PR。残課題は末尾
- 目的: 2 つのプロダクトで同じもの・ほぼ同じものを 1 か所にし、3 つ目以降のツールが
  「apps/<tool> を足すだけ」で同じ規約・道具に乗れるようにする（ADR-0001）
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

衝突を避けるため、`apps/**` のコードと CI に触る統合は並行 PR がすべて入ってから行う。

1. **`packages/contract`（`@rimltools/contract`）** — `shared/contract` は 12 ファイル共通のうち 8 が同一。
   - 共通化: `result` / `brand` / 同一の 8 ファイル。
   - 据え置き: `id.ts`（0.73。ID の接頭辞と文字集合がプロダクトごと）は「生成関数を受け取る汎用版」を
     packages に置き、プロダクトは接頭辞だけ渡す。`rpc.ts`（qrcc のみ）、`document-kind` / `limits` / `role`（noter のみ）は
     プロダクトに残す。
   - `apps/*/shared/contract` は packages を再 export する薄い層にし、import 元の一斉置換は別コミット。
2. **`packages/ui`（`@rimltools/ui`）** — `shared/ui` は 25 ファイル共通のうち 9 が同一、9 がクラス名の接頭辞だけ違う。
   - コンポーネント（button / field / live-region / skip-link / visually-hidden / theme）と print / utilities の CSS を共通化し、
     クラス名の接頭辞（`qrcc-` / `noter-`）を `rt-` などの共通接頭辞に寄せる（見た目の差分が出ないことを a11y / e2e で確認）。
   - `tokens.css`（0.31）・`index.css`（0.47）・`components.css`（0.64）はデザインが分岐しているので据え置き。
     共通トークンは riml-ds（npm）に寄せる方針で、packages には持たない。
   - qrcc の `window`（mado UI）と noter の `avatar` はプロダクトに残す。
3. **`packages/shell`** — `features/shell/ui` のうち breadcrumbs / global-nav / link-renderer / router-link / app-shell /
   register-sw（0.97〜0.99）を共通化。`root.route.tsx`（0.69）・`nav-items.ts`（0.79）・`shell.css`（0.70）はプロダクトに残す。
4. **lint / fmt 設定の一本化** — ルートの `.oxlintrc.json` / `.oxfmtrc.json` に products の overrides を集約し、
   `ignorePatterns` の `apps/**` を外す。lefthook のプロダクト別グループをルート 1 つに簡素化。
   - `.markuplintrc.json`: 同一ファイルでも、ルートに置く（または products から `extends` する）と
     qrcc でエラー 6 件・警告 73 件になる（プロダクト直下なら 0 件）。`overrides` の相対 glob と
     React spec の解決が設定ファイルの位置基準で変わるため。原因を切り分けてから一本化する。
5. **CI を tools.json 駆動の再利用ワークフロー 1 本に** — `qrcc-ci.yml` / `noter-ci.yml` の差分は
   guard（不変条件）と Rust ジョブだけ。`tools.json` に `rust` / guard の定義を持たせ、matrix で回す。
6. **smoke スクリプトの共通化** — ✅ 段階 3c。ページと `/assets/` の確認・表示・CLI を `scripts/smoke/`（`page.ts` / `cli.ts`）に集め、
   noter は WebSocket の入口（426）の確認をその上に足す。両プロダクトの `smoke.test.ts` は無変更で通り、本番に向けた実行の出力も
   共通化の前後で一致。**release（`scripts/release/smoke.ts`）と ops（`scripts/ops/synthetic.ts`）の資産抽出とは寄せていない**:
   release はデプロイ時にアイコン・manifest・画像まで確かめ、ops は 30 分ごとなので最小限に絞っている。1 つにすると
   どちらかの挙動が変わる。
7. **archify** — ✅ 段階 3c。`--repo-root` に git のトップを渡し、仕様の `sources[].path` を `apps/<tool>/...` に書き換えた
   （仕様の `repository.url` も rimltools に）。両プロダクトで validate / deliver / PNG 書き出しまで通る。
   あわせて lefthook の markuplint ジョブが archify の生成 HTML を拾って空振り防止のガード（#22）に落とされていたのを直した。
8. **`scripts/lib/tools.d.ts` の二重管理** — ✅ 段階 3c。`tsconfig.base.json` が `emitDeclarationOnly` なので、outDir の無い
   型検査が `.ts` の隣に出した `.d.ts` がコミットされていた（portal の 6 ファイルも同じ）。どこからも読まれていないので削除し、
   `.gitignore` で再発を防いだ。

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
- PWA のアイコン・manifest（`services/web/public`、0.23）
- `lanes.tsv`・`parallel-lanes.md`（プロダクトごとのレーン定義）

## 段階 3 の結果と残課題（2026-09-22）

| 項目                              | PR      | 結果                                                                                                                                                                                |
| --------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/auth` → `packages/auth` | #26     | Actor・actor-wire・Better Auth の設定・session → Actor・連携フック・D1 の入口・ブラウザの操作を共通化。schema（qrcc の `account.issuer`）と auth.ts（移譲の依存）はプロダクトに残す |
| ADR の重複                        | #28     | ルート ADR-0010（TS 7 + oxc）・0011（RSC）・0012（co-location）。プロダクトの 0006〜0008 は参照＋固有の補足                                                                         |
| smoke・archify・tools.d.ts        | 段階 3c | 上の段階 2 の 6〜8                                                                                                                                                                  |

残課題:

- `docs/free-tier-budget.md` / `docs/deployment.md`（プロダクト）の共通部分を `docs/platform.md` / `docs/release.md` に寄せる。
  `deployment.md` は `wrangler deploy` 時代の手順が残っており、`docs/release.md` と食い違っていた（解消済み: 各プロダクトの
  `deployment.md` はプロダクト固有の情報だけを残し、手順はルートの docs へリンクする形にした）
- qrcc ADR-0004 / noter ADR-0010（認証）、qrcc ADR-0009 / noter ADR-0009（Workers Free）、qrcc ADR-0010 / noter ADR-0012（WebMCP）は
  方針が近いが対象が違うので統合していない。3 つ目のツールで同じ判断が出たらルートに上げる
- ~~better-auth の版ずれ~~ → 1.7.5 に揃えた（`refactor/align-better-auth`）。`scripts/check-versions.ts` が以後のずれを CI で止める
- **qrcc の account.issuer の contract（0006）**: 1.7.5 が本番の全版に行き渡ったあとの次のリリースで、`account.issuer` 列と
  `account_issuer_account_id_unique` を消す（先頭に `-- contract:`、index を先に消してから列。
  https://better-auth.com/docs/guides/1-7-upgrade-guide#account-identity-keeps-the-provider-key）。
  消したら `schema.test.ts` の `PENDING_CONTRACT` から外す
- `scripts/release/smoke.ts` と `scripts/ops/synthetic.ts` の資産抽出（上の 6）
