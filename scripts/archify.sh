#!/usr/bin/env bash
# 構成図（docs/architecture/*.<type>.json）を archify で作り直す。
#
#   bun run archify <target>        （リポジトリ直下から）
#   bun run archify                 （apps/<tool> の中から）
#
# target はツール名（apps/<tool>/docs/architecture）か、`platform`（リポジトリ直下の
# docs/architecture。RimlTools 全体の図）。1 つの target に仕様がいくつあってもよい。
#
# 前提: archify スキルが入っていること（`bunx skills add tt-a1i/archify -g`）。
# 手順は仕様ごとに「showcase 品質で検証 → ビューア HTML を deliver → README 用 PNG を
# light / dark で書き出す」。仕様を直したら必ずこれを回し、生成物（HTML / PNG）は手で編集しない。
set -euo pipefail

GIT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  case "${PWD#"$GIT_ROOT"/}" in
    apps/*) TARGET="${PWD#"$GIT_ROOT"/apps/}"; TARGET="${TARGET%%/*}" ;;
  esac
fi
case "$TARGET" in
  platform) DIR="$GIT_ROOT" ;;
  "") echo "usage: archify <tool|platform>" >&2; exit 1 ;;
  *) DIR="$GIT_ROOT/apps/$TARGET" ;;
esac
if [ ! -d "$DIR/docs/architecture" ]; then
  echo "構成図の置き場所がありません: $DIR/docs/architecture" >&2
  exit 1
fi
cd "$DIR"

ARCHIFY="${ARCHIFY:-$HOME/.claude/skills/archify/bin/archify.mjs}"
if [ ! -f "$ARCHIFY" ]; then
  echo "archify が見つかりません: $ARCHIFY" >&2
  echo "  bunx skills add tt-a1i/archify -g   で導入するか、ARCHIFY=<path> を指定してください" >&2
  exit 1
fi

# 仕様は <name>.<type>.json（例: qrcc2.architecture.json、release.workflow.json）
shopt -s nullglob
specs=(docs/architecture/*.architecture.json docs/architecture/*.workflow.json docs/architecture/*.sequence.json docs/architecture/*.dataflow.json docs/architecture/*.lifecycle.json)
if [ "${#specs[@]}" -eq 0 ]; then
  echo "docs/architecture に仕様（*.<type>.json）がありません" >&2
  exit 1
fi

# 仕様の revision を現在の HEAD に揃える（source の実在チェックはこの revision で行われる）
HEAD_SHA="$(git rev-parse HEAD)"

for SPEC in "${specs[@]}"; do
  FILE="$(basename "$SPEC" .json)"
  TYPE="${FILE##*.}"
  NAME="${FILE%.*}"
  HTML="docs/architecture/$NAME-$TYPE.html"
  PNG_BASE="docs/architecture/$NAME-$TYPE"

  bun -e "
    const p = '$SPEC'
    const spec = JSON.parse(await Bun.file(p).text())
    if (spec.meta.repository !== undefined) spec.meta.repository.revision = '$HEAD_SHA'
    await Bun.write(p, JSON.stringify(spec, null, 2) + '\n')
  "
  bunx oxfmt --no-error-on-unmatched-pattern "$SPEC"

  # archify は --repo-root に git のトップを要求する。仕様の sources[].path もリポジトリ直下基準で書く
  node "$ARCHIFY" validate "$TYPE" "$SPEC" --quality showcase --repo-root "$GIT_ROOT"
  node "$ARCHIFY" deliver "$TYPE" "$SPEC" "$HTML" --quality showcase --repo-root "$GIT_ROOT"
  bun "$GIT_ROOT/scripts/archify-png.ts" "$HTML" "$PNG_BASE"
  echo "done: $DIR/$HTML / $PNG_BASE.{light,dark}.png"
done
