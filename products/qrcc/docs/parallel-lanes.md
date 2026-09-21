# 並行作業レーン

worktree で複数の作業（人／エージェント）を同時に走らせるための取り決め。
**レーン = 1 worktree = 1 ブランチ = 1 PR**。

## 1. 依存グラフ

**1 レーン = 1 トップレベルディレクトリ。** [ADR-0007](adr/0007-feature-colocation.md) の
co-location により、レーンの所有範囲がディレクトリ境界と一致する。

```
                 feat/shared-contract          ← 最優先。全レーンの先行条件
                 （shared/contract）
                    ┌───────┴────────┐
                    ▼                ▼
          feat/shared-kernel   feat/shared-ui
          （shared/kernel）    （shared/ui）
                    │                │
                    │                ▼
                    │           feat/shell ──────────▶ feat/auth
                    │        （features/shell,        （features/auth）
                    │          apps/web）                    │
                    ▼                                        │
              feat/generate ◀──────────────────┘             │
             （features/generate）                            │
              ┌────┬────┬──────────┐                         │
              ▼    ▼    ▼          ▼                         ▼
        feat/scan  │  feat/print  feat/wasm-bridge      feat/manage
                   │                                （features/manage）
                   └──────────────────────────────────────┘

          feat/api-worker（apps/api）… feat/shared-kernel の後、他とは独立
          chore/devops（.github, scripts, docs）… 随時
```

- **`feat/shared-contract` は必ず単独で先に終わらせる。** ここが動くと全レーンが壊れる
- `feat/shared-kernel` / `feat/shared-ui` は並行してよい
- feature レーン同士は独立。`@qrcc/<name>` の公開サブパス越しにしか依存しない

## 2. レーン一覧と所有ディレクトリ

**自分のレーンが所有していないディレクトリを編集しない。** 必要なら
「先にそのレーンにお願いする」か「main にマージしてから rebase する」。

| レーン          | ブランチ               | 所有ディレクトリ                      | 依存                     |
| --------------- | ---------------------- | ------------------------------------- | ------------------------ |
| shared-contract | `feat/shared-contract` | `shared/contract/**`                  | —                        |
| shared-kernel   | `feat/shared-kernel`   | `shared/kernel/**`                    | shared-contract          |
| shared-ui       | `feat/shared-ui`       | `shared/ui/**`                        | shared-contract          |
| shell           | `feat/shell`           | `features/shell/**`, `apps/web/**`    | shared-ui                |
| generate        | `feat/generate`        | `features/generate/**`                | shared-kernel, shared-ui |
| scan            | `feat/scan`            | `features/scan/**`                    | generate                 |
| print           | `feat/print`           | `features/print/**`                   | generate                 |
| auth            | `feat/auth`            | `features/auth/**`                    | shell                    |
| manage          | `feat/manage`          | `features/manage/**`                  | auth, generate           |
| wasm-bridge     | `feat/wasm-bridge`     | `shared/wasm/**`                      | generate                 |
| api-worker      | `feat/api-worker`      | `apps/api/**`                         | shared-kernel            |
| devops          | `chore/devops`         | `.github/**`, `scripts/**`, `docs/**` | —                        |

機械可読な定義は `scripts/lanes.tsv`。

各 feature ディレクトリの中は次の構成に従う（[ADR-0007](adr/0007-feature-colocation.md)）。

```
features/<name>/
├─ contract/   型・API 契約（TS）        ├─ engine/   純粋 Rust（worker 非依存）
├─ core/       純粋ロジック（TS）        └─ worker/   Rust I/O アダプタ（worker 可）
├─ ui/         React・CSS・テスト・<name>.route.tsx
└─ server/     server functions
```

### 横断点は「1 行追記」に限る

feature の実体はディレクトリ内に閉じるが、アプリに組み込むための宣言だけは
横断ファイルに集まる。設計上、いずれも **append-only の 1 行**で済むようにしてある。

| 何を足すか     | どこに 1 行                      |
| -------------- | -------------------------------- |
| 画面の URL     | `apps/web/src/routes.ts`         |
| 画面のスタイル | `apps/web/src/styles/app.css`    |
| ナビの項目     | `features/shell/ui/nav-items.ts` |
| RPC メソッド   | `apps/api/src/dispatch.rs`       |

複数レーンを並行させると、この 4 ファイルは rebase で競合しうる。
**競合したら解決せず、両方の行を残す**（順序は問わない）。それ以外の場所で
競合したなら、レーンの切り方が間違っている。

## 3. 共有ファイルの扱い（コンフリクト回避規約）

| ファイル                                                 | 規約                                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| ルート `package.json`                                    | **触らない。** 依存は各ワークスペースの `package.json` に足す                                                             |
| `bun.lock`                                               | 競合したら解決せず `git checkout --ours bun.lock && bun install` で再生成                                                 |
| ルート `Cargo.toml`                                      | `[workspace.dependencies]` の追加は `feat/shared-kernel` のみ。`features/*/worker` の初回追加だけ例外（該当レーンが行う） |
| `Cargo.lock`                                             | 競合したら `cargo update -w` で再生成                                                                                     |
| ルート `tsconfig.json`                                   | `feat/shared-contract` が全 references を先に登録しておく                                                                 |
| `apps/web/src/routes.ts`                                 | `feat/shell` が所有。URL 1 行の追加のみ他レーンから依頼                                                                   |
| `routeTree.gen.ts` / `worker-configuration.d.ts`         | **git 管理しない**。`bun run --filter @qrcc/web gen` で生成                                                               |
| `.oxlintrc.json` / `lefthook.yml` / `.markuplintrc.json` | `chore/devops` のみ変更可                                                                                                 |
| `docs/**`                                                | 各レーンは**自分の章のみ**追記                                                                                            |

## 4. 手順

```bash
# レーンを開始
bun run wt new feat/scan-ui        # .claude/worktrees/qrcc/feat-scan-ui を作り、依存も入れる（リポジトリ直下からは bun run wt qrcc new …）
cd <リポジトリ直下>/.claude/worktrees/qrcc/feat-scan-ui/products/qrcc

# 作業中: develop の更新を取り込む（毎日 / 依存レーンがマージされたら必ず）
bun run wt sync

# 完了
bun run wt pr                      # check を通してから PR を作成
bun run wt done feat/scan-ui       # マージ後に worktree を破棄
```

`wt new` は次を自動でやる:

- `origin/develop` から新ブランチを切って worktree を作成（リポジトリ全体。ブランチ運用はルートの ADR-0002）
- `mise install` / `bun install` / `cargo fetch`
- `lefthook install`
- `.dev.vars` をルートからコピー（gitignore 済み）
- レーンの所有ディレクトリと依存を書いた `LANE.md` を worktree 直下に配置

### マージ済みブランチの片付け

リモートのブランチを消すときは、フックを止める。送るものが無いのに
pre-push の typecheck とテストが毎回走ってしまう。

```bash
LEFTHOOK=0 git push origin --delete feat/xxx
```

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
| `test-ts`                 | `features/**`, `shared/**`, `apps/web/**`                       | `bun test`（Small/Medium） |
| `test-rust`               | `crates/**`, `apps/api/**`                                      |
| `markuplint`              | `**/*.tsx`                                                      |
| `a11y` (Playwright + axe) | `apps/web/**`, `shared/ui/**`                                   |
| `wasm-size`               | `crates/**`（バンドルサイズ上限を守る）                         |
| `guard`                   | 常に（`qrcc-api` に `routes` が生えていないか等の不変条件検査） |

`main` へのマージは全ジョブ green が必須。

## 8. レーン開始時のチェックリスト

- [ ] `LANE.md` を読み、所有ディレクトリを把握した
- [ ] 依存レーンが main にマージ済みか確認した
- [ ] `.claude/skills/rimltools-typescript` と `rimltools-tdd` を読んだ（TS を書く場合）
- [ ] `.claude/skills/rimltools-html-a11y` を読んだ（UI を書く場合）
- [ ] 失敗するテストから始める
