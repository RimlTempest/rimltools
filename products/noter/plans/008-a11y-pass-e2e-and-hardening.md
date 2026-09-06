# Plan 008: AAA 監査・3 状態の a11y e2e・縮退動作・ハードニング

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat <plan-007 のマージコミット>..HEAD -- features e2e shared/ui`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 007
- **Category**: test-coverage / correctness
- **Planned at**: commit `b110c53`, 2026-09-06

## Why this matters

`docs/accessibility.md` は WCAG 2.2 AAA を目標に掲げ、`bun run a11y` で
接続前・接続後・拒否の 3 状態を検査すると約束している。plan 005 では
`connected` しか検査していない。加えて `docs/design/ux.md` §6.3〜6.5 の
オフライン・デプロイ・上限到達は実装されたが e2e で固定されていない。
ここで「約束した振る舞い」を全部テストに落とし、手動チェックリストを一巡する。

## Current state

- `docs/accessibility.md` §2（達成計画表）§3（到達困難）§4（検証: 3 状態）§5（画面ごと）§6（更新ルール）。
- `.claude/skills/noter-html-a11y/references/manual-checks.md`（手動チェック手順）。
- `e2e/tests/a11y.spec.ts`: `/`（visitor / guest）、`/sign-in`、`/settings/account`、`/d/:id`（connected、markdown + json）を検査（plan 001〜006 の積み上げ）。
- `ConnectionState` の `rejected` は close code 4403/4404/4429 で発生（`docs/realtime-protocol.md` §1）。e2e で作るには
  「B が参加 → A が B を外す（`/kick`）→ B のピルが『権限がありません』」（4403）と「A が削除 → B の再接続が 4404」の 2 経路がある。
- `offline` は Playwright の `context.setOffline(true)`。
- `docs/free-tier-budget.md` §縮退表: `rejected(limit)` 時は入力を続けられ、「書き出し」を促すバナーを出す（`ux.md` §6.5）。
  DO 側の `4429` は `MAX_MEMBERS` 超過で出る（日次上限の検知は v1 では無い）。**バナーの UI は plan 005 で作られていない可能性がある** — 無ければこの plan で足す。

## Commands you will need

| Purpose | Command                         | Expected |
| ------- | ------------------------------- | -------- |
| a11y    | `bun run a11y`                  | pass     |
| e2e     | `bun run e2e`                   | pass     |
| Check   | `bun run check && bun run test` | exit 0   |

## Suggested executor toolkit

- `.claude/skills/noter-html-a11y/SKILL.md` + `references/manual-checks.md`
- `.claude/skills/better-accessibility/`, `fixing-accessibility/`
- `docs/accessibility.md`, `docs/design/ux.md` §5 §6

## Scope

**In scope**: `e2e/tests/**`, `features/*/ui/**`（a11y 修正のみ。ロジック変更は STOP）, `shared/ui/src/**`（同上）, `plans/README.md`,
**`docs/accessibility.md` §2/§3 の行追加のみ**（executor に例外的に許可: 監査結果の記録。他の docs は触らない）

**Out of scope**: `features/*/{core,server,contract}`、`features/sync/**`、`apps/**`、`.github/**`

## Git workflow

- Branch: `feat/e2e`
- Commits: `test(e2e): a11y in connecting, connected and rejected states`, `test(e2e): offline editing and reconnect`,
  `fix(editor): <個別の a11y 修正>`, `docs(a11y): record audit results`

## Steps

### Step 1: 3 状態の a11y

`e2e/tests/a11y.spec.ts` に:

- `connecting`: `page.route('**/ws/**', route => route.abort())` で WS を落として `/d/:id` を開き、ピルが「接続中…」または「再接続中…」の状態で axe。
- `rejected`: A が B を外す → B のピルが「権限がありません」→ axe。
- 既存の `connected` はそのまま。

**Verify**: `bun run a11y` → 3 状態とも違反 0。

### Step 2: 振る舞いの e2e

`e2e/tests/resilience.spec.ts`:

- オフライン: B を `setOffline(true)` → B が入力 → ピル「オフライン · 端末に保存」→ `setOffline(false)` → 「同期済み」→ A に B の入力が現れる。
- 削除: A が削除 → B のピルが「文書が見つかりません」→ B の `/d/:id` 再読み込みが 404 画面。
- viewer: viewer リンクで参加した C の `.cm-content` が `contenteditable="false"`、ツールバーに整形が無い、C の入力が A に**現れない**（`expect.poll` の否定は timeout 短めに）。
- 上限バナー: `MAX_MEMBERS` を超える接続は e2e で作れないので、`ConnectionState` を `rejected(limit)` に強制する**テスト用フック**は作らない。
  代わりに `status-text.test.ts`（ユニット）でバナー表示条件を固定し、UI は `features/editor/ui/limit-banner.test.tsx` で `rejected(limit)` を props で渡して検査。

**Verify**: `bun run e2e` → pass。

### Step 3: 手動チェックと記録

`manual-checks.md` を一巡（キーボードのみでホーム → 作成 → 入力 → Esc → Tab で抜ける → 共有ダイアログ → 閉じる、200% 拡大、
`prefers-reduced-motion`、スクリーンリーダーは VoiceOver で `role="status"` の読み上げが 1 回）。問題があれば `fix(...)` で直し、
直せないものは `docs/accessibility.md` §3 に理由と代替を**追記**（削除・改変はしない）。

**Verify**: `docs/accessibility.md` の diff が追記のみ（`git diff --stat docs/accessibility.md` で削除行 0）。

### Step 4: ハードニングの確認（読むだけ、必要なら STOP）

- `grep -rn 'dangerouslySetInnerHTML' features shared` → 1 箇所（plan 006）
- `grep -rn "Cookie\|session_token" features/*/ui` → クライアントで Cookie を読んでいない
- `grep -rn 'NOTER_DEV_OPEN_WS' . --exclude-dir=node_modules --exclude-dir=plans` → CI guard のみ
- `apps/sync/wrangler.jsonc` に `routes` / `workers_dev: true` が無い
- `docs/realtime-protocol.md` §1 の表と `ws-gate.ts` の HTTP コード（426 / 401 / 404）が一致

**Verify**: 上記が全て成立。不一致は STOP。

## Test plan

Step 1・2 のとおり。ユニット: `limit-banner.test.tsx`。

## Done criteria

- [ ] `bun run a11y` が 3 状態 × 全画面で違反 0
- [ ] `bun run e2e` に offline / delete / viewer のケースがあり pass
- [ ] `docs/accessibility.md` は追記のみ
- [ ] Step 4 のチェックが全て成立
- [ ] `git diff --name-only` が Scope 内のみ

## STOP conditions

- a11y 修正にロジック変更（server / core）が必要
- `connecting` 状態で axe が「ライブリージョンが 2 つ」を報告し、`LiveRegion` の設計変更が要る
- Step 4 のいずれかが不成立

## Maintenance notes

- 画面を足したら `a11y.spec.ts` に URL を足し、`docs/accessibility.md` §5 に行を足す（§6 更新ルール）
- `resilience.spec.ts` は DO の実機挙動に依存する。flaky になったら `expect.poll` の timeout を伸ばす前に、
  ピルの文言（`ux.md` §5）が変わっていないかを疑う
