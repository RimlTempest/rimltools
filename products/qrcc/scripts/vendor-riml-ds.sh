#!/usr/bin/env bash
# riml-ds が npm に公開されるまでのつなぎ。ローカルの riml-ds（ビルド済み）から
# tokens パッケージを tgz にして vendor/riml-ds/ に置く。公開後はこのスクリプトと vendor/ を消し、
# shared/ui/package.json の依存をバージョン指定に変える（docs/adr/0011-riml-ds-tokens.md）。
#
# 使い方: RIML_DS_DIR=/path/to/riml-ds bash scripts/vendor-riml-ds.sh && bun install
# （tgz が変わると bun.lock のハッシュも変わる。bun install を frozen 無しで回して bun.lock をコミットする）
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
SRC="${RIML_DS_DIR:-$ROOT/../riml-ds}"
DEST="$ROOT/vendor/riml-ds"

[ -f "$SRC/system/tokens/dist/tokens.css" ] \
  || { printf 'error: %s/system/tokens/dist が無い。riml-ds 側で bun run build を先に実行する\n' "$SRC" >&2; exit 1; }

mkdir -p "$DEST"
rm -f "$DEST"/*.tgz
( cd "$SRC/system/tokens" && bun pm pack --destination "$DEST" --quiet >/dev/null )
printf 'riml-ds %s\n' "$(git -C "$SRC" rev-parse --short HEAD)" > "$DEST/SOURCE"
printf '==> %s\n' "$DEST"
ls -1 "$DEST"
