# 並行作業レーン

worktree で複数の作業（人／エージェント）を同時に走らせるための取り決め。
**レーン = 1 worktree = 1 ブランチ = 1 PR**。

## 1. 依存グラフ

```
        L0 foundation (main に取り込み済み)
                 │
        ┌────────▼────────┐
        │  L1 contracts   │  ← すべてのレーンの先行条件。最優先で main にマージ
        └────────┬────────┘
     ┌───────────┼────────────┬──────────────┬───────────────┐
     ▼           ▼            ▼              ▼               ▼
 L2 rust-core  L7 ui     L8 web-shell    L9 auth        L14 devops
     │           │            │              │
  ┌──┼──┬────┐   │            │              │
  ▼  ▼  ▼    ▼   │            │              │
 L3 L4 L5   L6   │            │              │
decode print api wasm         │              │
     │       │    │           │              │
     └───┬───┴────┴─────┬─────┴──────┬───────┘
         ▼              ▼            ▼
   L11 scan-ui   L10 generate-ui  L12 manage-ui
                        │
                        ▼
                  L13 print-ui
```

- **L1 は必ず単独で先に終わらせる。** ここが動くと全レーンが壊れる。
- L2〜L9 は互いに独立。同時に走らせてよい。
- L10〜L13 は L1 + L7 + L8 がマージ済みであることが前提。

## 2. レーン一覧と所有ディレクトリ

**自分のレーンが所有していないファイルを編集しない。** 必要なら
「先にそのレーンにお願いする」か「main にマージしてから rebase する」。

| レーン           | ブランチ             | 所有ディレクトリ（ここだけ触る）                                                                                                   | 依存            |
| ---------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| L1 contracts     | `feat/contracts`     | `packages/contracts/**`                                                                                                            | —               |
| L2 rust-core     | `feat/rust-core`     | `crates/qrcc-core/**`, `crates/qrcc-render/**`, ルート `Cargo.toml`                                                                | L1              |
| L3 decode        | `feat/decode`        | `crates/qrcc-decode/**`                                                                                                            | L2              |
| L4 print-core    | `feat/print-core`    | `crates/qrcc-print/**`, `packages/core/src/print/**`                                                                               | L2              |
| L5 api-worker    | `feat/api-worker`    | `apps/api/**`                                                                                                                      | L2              |
| L6 wasm-bridge   | `feat/wasm-bridge`   | `crates/qrcc-wasm/**`, `packages/wasm/**`                                                                                          | L2              |
| L7 design-system | `feat/design-system` | `packages/ui/**`                                                                                                                   | L1              |
| L8 web-shell     | `feat/web-shell`     | `apps/web/src/routes/**`, `apps/web/src/styles/**`, `apps/web/src/server/**`, `apps/web/vite.config.ts`, `apps/web/wrangler.jsonc` | L1              |
| L9 auth          | `feat/auth`          | `apps/web/src/features/auth/**`, `apps/api/migrations/**`                                                                          | L1, L8          |
| L10 generate-ui  | `feat/generate-ui`   | `apps/web/src/features/generate/**`                                                                                                | L1,L6,L7,L8     |
| L11 scan-ui      | `feat/scan-ui`       | `apps/web/src/features/scan/**`                                                                                                    | L1,L3,L6,L7,L8  |
| L12 manage-ui    | `feat/manage-ui`     | `apps/web/src/features/manage/**`                                                                                                  | L1,L5,L7,L8,L9  |
| L13 print-ui     | `feat/print-ui`      | `apps/web/src/features/print/**`                                                                                                   | L1,L4,L7,L8,L12 |
| L14 devops       | `chore/devops`       | `.github/**`, `scripts/**`, `docs/**`                                                                                              | —               |

`packages/core/**`（print 以外）は L1 完了後に L2/L10 が分担して触るため、
**ファイル単位で事前に owner を宣言する**（PR 冒頭に書く）。

## 3. 共有ファイルの扱い（コンフリクト回避規約）

| ファイル                          | 規約                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| ルート `package.json`             | **触らない。** 依存は各ワークスペースの `package.json` に足す（Wrangler がアプリ単位で解決するため、そもそもこれが正しい） |
| `bun.lock`                        | 競合したら解決せず `git checkout --ours bun.lock && bun install` で再生成                                                  |
| ルート `Cargo.toml`               | L2 が最初にすべての `members` と `[workspace.dependencies]` を登録しておく。他レーンは追記しない                           |
| `Cargo.lock`                      | 競合したら `cargo update -w` で再生成                                                                                      |
| ルート `tsconfig.json`            | L1 が全 references を先に登録しておく                                                                                      |
| `routeTree.gen.ts`                | **git 管理しない**（`.gitignore` 済み）。`vite dev` / `build` で生成する                                                   |
| `worker-configuration.d.ts`       | 同上。`bun run cf-typegen` で生成                                                                                          |
| `.oxlintrc.json` / `lefthook.yml` | L14 のみ変更可。他レーンは Issue で依頼                                                                                    |
| `docs/**`                         | 各レーンは**自分の章のみ**追記。表への行追加は競合しにくい                                                                 |

## 4. 手順

```bash
# レーンを開始
bun run wt new feat/scan-ui        # .claude/worktrees/feat-scan-ui を作り、依存も入れる
cd .claude/worktrees/feat-scan-ui

# 作業中: main の更新を取り込む（毎日 / 依存レーンがマージされたら必ず）
bun run wt sync

# 完了
bun run wt pr                      # check を通してから PR を作成
bun run wt done feat/scan-ui       # マージ後に worktree を破棄
```

`wt new` は次を自動でやる:

- `origin/main` から新ブランチを切って worktree を作成
- `mise install` / `bun install` / `cargo fetch`
- `lefthook install`
- `.dev.vars` をルートからコピー（gitignore 済み）
- レーンの所有ディレクトリと依存を書いた `LANE.md` を worktree 直下に配置

## 5. マージ順序

1. **L1 contracts** — 単独でマージ。以降の全レーンが rebase する
2. L2 rust-core → L7 design-system → L8 web-shell（この 3 つは順不同だが早く）
3. L3 / L4 / L5 / L6 / L9（並行）
4. L10 → L11 → L12 → L13（UI は依存順）
5. L14 devops は随時

**rebase を使う（merge commit を作らない）。** 履歴を直線に保ち、
どのレーンがいつ入ったかを追えるようにする。

## 6. 競合したときのプロトコル

1. まず「所有ディレクトリ外を触っていないか」を確認する。触っていたら差し戻す。
2. 共有ファイル（表 3）なら、その規約に従って**解決せず再生成**する。
3. それでも競合するなら、レーンの切り方が間違っている。
   `docs/parallel-lanes.md` を直してから作業を再開する（暗黙に握らない）。

## 7. CI

PR ごとに **変更されたレーンの範囲だけ**を実行して時間を節約する
（`.github/workflows/ci.yml` の `paths-filter`）。

| ジョブ                    | 実行条件                                                        |
| ------------------------- | --------------------------------------------------------------- |
| `fmt-lint`                | 常に                                                            |
| `typecheck`               | `**/*.ts(x)`, `tsconfig*`                                       |
| `test-ts`                 | `packages/**`, `apps/web/**`                                    |
| `test-rust`               | `crates/**`, `apps/api/**`                                      |
| `markuplint`              | `**/*.tsx`                                                      |
| `a11y` (Playwright + axe) | `apps/web/**`, `packages/ui/**`                                 |
| `wasm-size`               | `crates/**`（バンドルサイズ上限を守る）                         |
| `guard`                   | 常に（`qrcc-api` に `routes` が生えていないか等の不変条件検査） |

`main` へのマージは全ジョブ green が必須。

## 8. レーン開始時のチェックリスト

- [ ] `LANE.md` を読み、所有ディレクトリを把握した
- [ ] 依存レーンが main にマージ済みか確認した
- [ ] `.claude/skills/qrcc-typescript` と `qrcc-tdd` を読んだ（TS を書く場合）
- [ ] `.claude/skills/qrcc-html-a11y` を読んだ（UI を書く場合）
- [ ] 失敗するテストから始める
