#!/usr/bin/env bash
# プロダクトの構成図（products/<tool>/docs/architecture/）を archify で作り直す。
#
#   bun run archify <tool>          （リポジトリ直下から）
#   bun run archify                 （products/<tool> の中から）
#
# 前提: archify スキルが入っていること（`bunx skills add tt-a1i/archify -g`）。
# 手順は「仕様 JSON を showcase 品質で検証 → ビューア HTML を deliver →
# README 用 PNG を light / dark で書き出す」。仕様を直したら必ずこれを回し、
# 生成物（HTML / PNG）は手で編集しない。
set -euo pipefail

GIT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOL="${1:-}"
if [ -z "$TOOL" ]; then
  case "${PWD#"$GIT_ROOT"/}" in
    products/*) TOOL="${PWD#"$GIT_ROOT"/products/}"; TOOL="${TOOL%%/*}" ;;
  esac
fi
if [ -z "$TOOL" ] || [ ! -d "$GIT_ROOT/products/$TOOL" ]; then
  echo "usage: archify <tool>" >&2
  exit 1
fi
cd "$GIT_ROOT/products/$TOOL"

ARCHIFY="${ARCHIFY:-$HOME/.claude/skills/archify/bin/archify.mjs}"
# 仕様はプロダクトごとに 1 つ（例: qrcc2.architecture.json / noter.architecture.json）
shopt -s nullglob
specs=(docs/architecture/*.architecture.json)
if [ "${#specs[@]}" -ne 1 ]; then
  echo "docs/architecture/*.architecture.json が 1 つではありません（${#specs[@]} 個）" >&2
  exit 1
fi
SPEC="${specs[0]}"
NAME="$(basename "$SPEC" .architecture.json)"
HTML="docs/architecture/$NAME-architecture.html"
PNG_BASE="docs/architecture/$NAME-architecture"

if [ ! -f "$ARCHIFY" ]; then
  echo "archify が見つかりません: $ARCHIFY" >&2
  echo "  bunx skills add tt-a1i/archify -g   で導入するか、ARCHIFY=<path> を指定してください" >&2
  exit 1
fi

# 仕様の revision を現在の HEAD に揃える（source の実在チェックはこの revision で行われる）
HEAD_SHA="$(git rev-parse HEAD)"
bun -e "
  const p = '$SPEC'
  const spec = JSON.parse(await Bun.file(p).text())
  spec.meta.repository.revision = '$HEAD_SHA'
  await Bun.write(p, JSON.stringify(spec, null, 2) + '\n')
"
bunx oxfmt --no-error-on-unmatched-pattern "$SPEC"

node "$ARCHIFY" validate architecture "$SPEC" --quality showcase --repo-root .
node "$ARCHIFY" deliver architecture "$SPEC" "$HTML" --quality showcase --repo-root .
bun e2e/archify-png.ts "$HTML" "$PNG_BASE"

echo "done: $HTML / $PNG_BASE.{light,dark}.png"
