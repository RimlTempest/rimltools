#!/usr/bin/env bash
# worktree lane helper. See docs/parallel-lanes.md
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
LANES="$ROOT/scripts/lanes.tsv"
WT_DIR="$ROOT/.claude/worktrees"
BASE="${QRCC_BASE_REF:-origin/main}"

die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }
info() { printf '\033[36m==>\033[0m %s\n' "$*"; }

lane_field() { # $1=branch $2=column(2..4)
  awk -F'\t' -v b="$1" -v c="$2" '$1==b { print $c }' "$LANES"
}

slug() { printf '%s' "${1//\//-}"; }

lane_exists() { [ -n "$(lane_field "$1" 2)" ]; }

cmd_list() {
  printf '\033[1m%-22s %-34s %s\033[0m\n' BRANCH DEPENDS_ON SUMMARY
  awk -F'\t' '!/^#/ && NF { printf "%-22s %-34s %s\n", $1, $2, $4 }' "$LANES"
  echo
  info "existing worktrees:"
  git worktree list | sed 's/^/    /'
}

write_lane_md() { # $1=branch $2=worktree path
  local b="$1" p="$2" deps owned summary
  deps="$(lane_field "$b" 2)"; owned="$(lane_field "$b" 3)"; summary="$(lane_field "$b" 4)"
  cat > "$p/LANE.md" <<EOF
# レーン: $b

$summary

## 所有ディレクトリ（ここだけ編集する）

$(printf '%s' "$owned" | tr ',' '\n' | sed 's/^/- `/; s/$/`/')

## 依存レーン（main にマージ済みであること）

$(if [ "$deps" = "-" ]; then echo "- なし"; else printf '%s' "$deps" | tr ',' '\n' | sed 's/^/- /'; fi)

## 開始前チェック

- [ ] 依存レーンが main に入っているか確認した（\`git log --oneline origin/main\`）
- [ ] \`docs/parallel-lanes.md\` の共有ファイル規約を読んだ
- [ ] \`.claude/skills/qrcc-typescript\` / \`qrcc-tdd\` を読んだ（TS を書く場合）
- [ ] \`.claude/skills/qrcc-html-a11y\` を読んだ（UI を書く場合）
- [ ] 失敗するテストから始める（red → green → refactor）

## 進め方

\`\`\`bash
bun run wt sync    # main の更新を取り込む（毎日 / 依存レーンがマージされたら必ず）
bun run check      # コミット前の全チェック
bun run wt pr      # PR を作成
\`\`\`

このファイルはコミットしない（.gitignore 済み）。
EOF
}

cmd_new() {
  local b="${1:-}"; [ -n "$b" ] || die "usage: wt new <branch>  (see: wt list)"
  lane_exists "$b" || die "unknown lane '$b'. Add it to scripts/lanes.tsv first, or run: wt list"

  local path="$WT_DIR/$(slug "$b")"
  [ -e "$path" ] && die "worktree already exists: $path"

  info "fetching $BASE"
  git -C "$ROOT" fetch --quiet origin || info "fetch skipped (no remote yet)"
  local base_ref="$BASE"
  git -C "$ROOT" rev-parse --verify --quiet "$BASE" >/dev/null || base_ref="HEAD"

  info "creating worktree $path from $base_ref"
  mkdir -p "$WT_DIR"
  git -C "$ROOT" worktree add -b "$b" "$path" "$base_ref"

  info "installing toolchain and dependencies"
  ( cd "$path" && mise install >/dev/null 2>&1 || true )
  ( cd "$path" && mise exec -- bun install )
  [ -f "$ROOT/Cargo.toml" ] && ( cd "$path" && mise exec -- cargo fetch >/dev/null 2>&1 || true )
  ( cd "$path" && mise exec -- bunx lefthook install >/dev/null )

  for f in .dev.vars .env.local; do
    [ -f "$ROOT/$f" ] && cp "$ROOT/$f" "$path/$f" && info "copied $f"
  done

  write_lane_md "$b" "$path"
  info "ready: cd $path"
  echo
  sed -n '1,12p' "$path/LANE.md"
}

cmd_sync() {
  local b; b="$(git rev-parse --abbrev-ref HEAD)"
  [ "$b" = "main" ] && die "already on main"
  info "rebasing $b onto $BASE"
  git fetch origin
  if ! git rebase "$BASE"; then
    cat >&2 <<'EOF'

rebase が止まりました。docs/parallel-lanes.md の「6. 競合したときのプロトコル」に従ってください:
  1. 所有ディレクトリ外を触っていないか確認する
  2. bun.lock      -> git checkout --ours bun.lock && bun install && git add bun.lock
     Cargo.lock    -> cargo update -w && git add Cargo.lock
  3. それ以外が競合するならレーンの切り方が間違っています。相談してから再開してください。
EOF
    exit 1
  fi
  mise exec -- bun install
  info "sync done"
}

cmd_pr() {
  local b; b="$(git rev-parse --abbrev-ref HEAD)"
  [ "$b" = "main" ] && die "refusing to open a PR from main"
  info "running full check"
  mise exec -- bun run check
  git push -u origin "$b"
  local summary; summary="$(lane_field "$b" 4)"
  command -v gh >/dev/null || { info "gh not found; pushed only"; return; }
  gh pr create --base main --head "$b" --title "$b: ${summary:-work}" --body "$(cat <<EOF
## レーン
\`$b\` — ${summary:-}

所有ディレクトリ: $(lane_field "$b" 3)

## 変更内容

## 確認

- [ ] \`bun run check\` が通る
- [ ] 失敗するテストから書いた（red → green）
- [ ] 所有ディレクトリ外を編集していない
- [ ] a11y 手動確認（UI 変更がある場合）: \`.claude/skills/qrcc-html-a11y/references/manual-checks.md\`

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01RYEvPgnfsU7bBcF5a55K6Y
EOF
)"
}

cmd_done() {
  local b="${1:-}"; [ -n "$b" ] || die "usage: wt done <branch>"
  local path="$WT_DIR/$(slug "$b")"
  [ -d "$path" ] || die "no worktree at $path"
  if [ -n "$(git -C "$path" status --porcelain)" ]; then
    die "worktree has uncommitted changes: $path"
  fi
  info "removing $path"
  git worktree remove "$path"
  git branch -d "$b" 2>/dev/null || info "branch $b kept (not merged)"
}

cmd_status() {
  git worktree list --porcelain | awk '/^worktree /{p=$2} /^branch /{gsub("refs/heads/","",$2); print p"\t"$2}' |
  while IFS=$'\t' read -r p b; do
    local dirty; dirty="$( [ -n "$(git -C "$p" status --porcelain 2>/dev/null)" ] && echo '*' || echo ' ' )"
    local ahead; ahead="$(git -C "$p" rev-list --count "$BASE..HEAD" 2>/dev/null || echo '?')"
    printf '%s %-24s +%-4s %s\n' "$dirty" "$b" "$ahead" "$p"
  done
}

case "${1:-}" in
  new)    shift; cmd_new "$@" ;;
  sync)   shift; cmd_sync "$@" ;;
  pr)     shift; cmd_pr "$@" ;;
  done)   shift; cmd_done "$@" ;;
  list)   shift; cmd_list "$@" ;;
  status) shift; cmd_status "$@" ;;
  *) cat <<'EOF'
usage: bun run wt <command>

  list            レーン一覧と現在の worktree を表示
  new <branch>    レーンの worktree を作成し、依存とフックまで用意する
  sync            main の更新を rebase で取り込む（worktree 内で実行）
  pr              bun run check を通してから PR を作成（worktree 内で実行）
  done <branch>   マージ済みレーンの worktree とブランチを片付ける
  status          全 worktree の状態（未コミット / main との差分）

詳細: docs/parallel-lanes.md
EOF
    exit 1 ;;
esac
