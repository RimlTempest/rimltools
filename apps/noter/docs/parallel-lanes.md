# 並行作業レーン

worktree で複数の作業（人／エージェント）を同時に走らせるための取り決め。
**レーン = 1 worktree = 1 ブランチ = 1 PR**。

## 1. 依存グラフ

**1 レーン = 1 トップレベルディレクトリ。** [ADR-0007](adr/0007-feature-colocation.md) の
co-location により、レーンの所有範囲がディレクトリ境界と一致する。

```
                     feat/contracts                ← 最優先。全レーンの先行条件
                   （shared/contract）
        ┌──────────────┬───────┴────────┬───────────────┐
        ▼              ▼                ▼               ▼
feat/design-system  feat/web-shell   feat/sync      feat/formats
（shared/ui）      （features/shell, （features/sync, （features/formats）
        │            apps/web）        apps/sync）        │
        │              │                │               │
        │              ▼                │               │
        │          feat/auth            │               │
        │        （features/auth）      │               │
        │              │                │               │
        │      ┌───────┴────────┐       │               │
        │      ▼                ▼       │               │
        └▶ feat/documents   feat/editor ◀┴───────────────┘
         （features/documents）（features/editor）
               │                │
               └───────┬────────┘
                       ▼
             feat/webmcp（shared/webmcp）
             feat/e2e（e2e）
             chore/devops（.github, scripts, docs, tools）… 随時
```

- **`feat/contracts` は必ず単独で先に終わらせる。** ここが動くと全レーンが壊れる
- `feat/design-system` / `feat/web-shell` / `feat/sync` / `feat/formats` は並行してよい
- `feat/sync` は **web Worker → DO のヘッダ契約**（`docs/realtime-protocol.md` §2）を
  `features/sync/contract` に固定してから着手する。web 側（`apps/web/src/server.ts`）
  は `feat/web-shell` が所有するため、契約変更は両レーンの合意が要る
- feature レーン同士は独立。`@noter/<name>` の公開サブパス越しにしか依存しない

## 2. レーン一覧と所有ディレクトリ

**自分のレーンが所有していないディレクトリを編集しない。** 必要なら
「先にそのレーンにお願いする」か「main にマージしてから rebase する」。

| レーン        | ブランチ             | 所有ディレクトリ                                           | 依存                         |
| ------------- | -------------------- | ---------------------------------------------------------- | ---------------------------- |
| contracts     | `feat/contracts`     | `shared/contract/**`                                       | —                            |
| design-system | `feat/design-system` | `shared/ui/**`                                             | contracts                    |
| web-shell     | `feat/web-shell`     | `features/shell/**`, `apps/web/**`                         | design-system                |
| sync          | `feat/sync`          | `features/sync/**`, `apps/sync/**`                         | contracts                    |
| formats       | `feat/formats`       | `features/formats/**`                                      | contracts                    |
| auth          | `feat/auth`          | `features/auth/**`, `apps/web/migrations/0001_*`           | web-shell                    |
| documents     | `feat/documents`     | `features/documents/**`, `apps/web/migrations/0002_*` 以降 | auth, sync                   |
| editor        | `feat/editor`        | `features/editor/**`                                       | sync, formats, design-system |
| webmcp        | `feat/webmcp`        | `shared/webmcp/**`                                         | documents, editor            |
| e2e           | `feat/e2e`           | `e2e/**`                                                   | documents, editor            |
| devops        | `chore/devops`       | `.github/**`, `scripts/**`, `docs/**`, `tools/**`          | —                            |

機械可読な定義は `scripts/lanes.tsv`。

各 feature ディレクトリの中は次の構成に従う（[ADR-0007](adr/0007-feature-colocation.md)）。

```
features/<name>/
├─ contract/   型・API 契約                ├─ worker/   Durable Object の薄い殻（sync のみ）
├─ core/       純粋ロジック（I/O なし）    └─ client/   ブラウザ側 I/O アダプタ（sync のみ）
├─ ui/         React・CSS・テスト・<name>.route.tsx
└─ server/     server functions / server routes（noter-web で動く）
```

### 横断点は「1 行追記」に限る

feature の実体はディレクトリ内に閉じるが、アプリに組み込むための宣言だけは
横断ファイルに集まる。いずれも **append-only の 1 行**で済むようにしてある。

| 何を足すか               | どこに 1 行                                 |
| ------------------------ | ------------------------------------------- |
| 画面の URL               | `apps/web/src/routes.ts`                    |
| 画面のスタイル           | `apps/web/src/styles/app.css`               |
| ナビの項目               | `features/shell/ui/nav-items.ts`            |
| 文書種別（フォーマット） | `shared/contract/src/document-kind.ts`      |
| DO 内部ルート            | `features/sync/core/src/internal-routes.ts` |

複数レーンを並行させると、これらは rebase で競合しうる。
**競合したら解決せず、両方の行を残す**（順序は問わない）。それ以外の場所で
競合したなら、レーンの切り方が間違っている。

## 3. 共有ファイルの扱い（コンフリクト回避規約）

| ファイル                                                                           | 規約                                                                                    |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| ルート `package.json`                                                              | **触らない。** 依存は各ワークスペースの `package.json` に足す                           |
| `bun.lock`                                                                         | 競合したら解決せず `git checkout --ours bun.lock && bun install` で再生成               |
| ルート `tsconfig.json`                                                             | `feat/contracts` が全 references を先に登録しておく                                     |
| `apps/web/src/routes.ts`                                                           | `feat/web-shell` が所有。URL 1 行の追加のみ他レーンから依頼                             |
| `apps/web/wrangler.jsonc`                                                          | `feat/web-shell` が所有。binding の追加は依頼（DO binding は `feat/sync` の契約に従う） |
| `apps/sync/wrangler.jsonc`                                                         | `feat/sync` が所有。**`routes` / `workers_dev` を書かない**                             |
| `apps/web/migrations/`                                                             | 連番はレーン順（auth = 0001、documents = 0002〜）。番号衝突は rebase 時に後発が振り直す |
| `routeTree.gen.ts` / `worker-configuration.d.ts`                                   | **git 管理しない**。`bun run --filter @noter/web gen` で生成                            |
| ルートの `.oxlintrc.json` / `.oxfmtrc.json` / `lefthook.yml`、`.markuplintrc.json` | `chore/devops` のみ変更可                                                               |
| `docs/**`                                                                          | 各レーンは**自分の章のみ**追記                                                          |

## 4. 手順

```bash
# レーンを開始
bun run wt new feat/editor         # .claude/worktrees/noter/feat-editor を作り、依存も入れる（リポジトリ直下からは bun run wt noter new …）
cd <リポジトリ直下>/.claude/worktrees/noter/feat-editor/products/noter

# 作業中: develop の更新を取り込む（毎日 / 依存レーンがマージされたら必ず）
bun run wt sync

# 完了
bun run wt pr                      # check を通してから PR を作成
bun run wt done feat/editor        # マージ後に worktree を破棄
```

`wt new` は次を自動でやる:

- `origin/develop` から新ブランチを切って worktree を作成（リポジトリ全体。ブランチ運用はルートの ADR-0002）
- `mise install` / `bun install`
- `lefthook install`
- `.dev.vars` をルートからコピー（gitignore 済み）
- レーンの所有ディレクトリと依存を書いた `LANE.md` を worktree 直下に配置

### マージ済みブランチの片付け

```bash
LEFTHOOK=0 git push origin --delete feat/xxx
```

## 5. マージ順序

1. **contracts** — 単独でマージ。以降の全レーンが rebase する
2. design-system / web-shell / sync / formats（並行、順不同）
3. auth
4. documents / editor（並行）
5. webmcp / e2e
6. devops は随時

**rebase を使う（merge commit を作らない）。**

## 6. 競合したときのプロトコル

1. まず「所有ディレクトリ外を触っていないか」を確認する。触っていたら差し戻す。
2. 共有ファイル（表 3）なら、その規約に従って**解決せず再生成**する。
3. それでも競合するなら、レーンの切り方が間違っている。
   `docs/parallel-lanes.md` を直してから作業を再開する（暗黙に握らない）。

## 7. CI

PR ごとに **変更されたレーンの範囲だけ**を実行する（`.github/workflows/ci.yml` の `paths-filter`）。

| ジョブ                    | 実行条件                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `fmt-lint`                | 常に                                                                                                               |
| `typecheck`               | `**/*.ts(x)`, `tsconfig*`                                                                                          |
| `test`                    | `features/**`, `shared/**`, `apps/**`（`bun test`、Small/Medium）                                                  |
| `markuplint`              | `**/*.tsx`                                                                                                         |
| `a11y` (Playwright + axe) | `apps/web/**`, `shared/ui/**`, `features/*/ui/**`                                                                  |
| `guard`                   | 常に（`apps/sync` に `routes` / `workers_dev` が無い、`new_classes` を使っていない、`class` が許可場所以外に無い） |

`main` へのマージは全ジョブ green が必須。

## 8. レーン開始時のチェックリスト

- [ ] `LANE.md` を読み、所有ディレクトリを把握した
- [ ] 依存レーンが main にマージ済みか確認した
- [ ] `.claude/skills/rimltools-typescript` と `rimltools-tdd` を読んだ（TS を書く場合）
- [ ] `.claude/skills/rimltools-html-a11y` を読んだ（UI を書く場合）
- [ ] `docs/realtime-protocol.md` を読んだ（sync / editor / documents を触る場合）
- [ ] 失敗するテストから始める
