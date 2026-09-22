#!/usr/bin/env bash
# riml-ds が npm に公開されるまでのつなぎ。ローカルの riml-ds（ビルド済み）から
# tokens / css パッケージを tgz にして vendor/riml-ds/ に置く。公開後はこのスクリプトと vendor/ を消し、
# shared/ui/package.json の依存をバージョン指定に変える（docs/adr/0011-riml-ds-tokens.md）。
#
# 使い方: RIML_DS_DIR=/path/to/riml-ds bash scripts/vendor-riml-ds.sh && bun install
# （tgz が変わると bun.lock のハッシュも変わる。bun install を frozen 無しで回して bun.lock をコミットする）
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
SRC="${RIML_DS_DIR:-$ROOT/../riml-ds}"
DEST="$ROOT/vendor/riml-ds"
PACKAGES=(system/tokens system/css)
# mise の shim は /tmp では解決できないので、実体のパスを先に控える
BUN_BIN="$(bun -e 'process.stdout.write(process.execPath)')"

for pkg in "${PACKAGES[@]}"; do
  [ -d "$SRC/$pkg/dist" ] \
    || { printf 'error: %s/%s/dist が無い。riml-ds 側で bun run build を先に実行する\n' "$SRC" "$pkg" >&2; exit 1; }
done
[ -f "$SRC/system/css/dist/patterns.css" ] \
  || { printf 'error: patterns.css が無い。riml-ds は plan 015 以降の main であること\n' >&2; exit 1; }

mkdir -p "$DEST"
rm -f "$DEST"/*.tgz
for pkg in "${PACKAGES[@]}"; do
  ( cd "$SRC/$pkg" && bun pm pack --destination "$DEST" --quiet >/dev/null )
done

# riml-ds-css は tokens を peerDependencies に持つ。`bun pm pack` が workspace:* を
# 実バージョン（0.2.0）に固定するので、bun がそれを npm に取りにいって 404 で止まる
# （tokens はまだ未公開）。tokens は shared/ui が file: で直接依存していて解決済みなので、
# vendor する tgz の中では peer を optional にして自動取得を止める。
# riml-ds が npm に公開されたらこのブロックごと消える（ADR-0011 §3）。
for tgz in "$DEST"/*.tgz; do
  case "$tgz" in
    *riml-ds-css-*) ;;
    *) continue ;;
  esac
  work="$(mktemp -d)"
  tar -xzf "$tgz" -C "$work"
  bun -e '
    const path = process.argv[1]
    const manifest = JSON.parse(await Bun.file(path).text())
    if (manifest.peerDependencies?.["@rimltempest/riml-ds-tokens"] === undefined) {
      throw new Error("peerDependencies に riml-ds-tokens が無い。この回避策はもう要らないかもしれない")
    }
    manifest.peerDependenciesMeta = {
      ...manifest.peerDependenciesMeta,
      "@rimltempest/riml-ds-tokens": { optional: true },
    }
    await Bun.write(path, `${JSON.stringify(manifest, null, 2)}\n`)
  ' "$work/package/package.json"
  # 詰め直しも bun pm pack で行う（tar だと mtime が入って毎回ハッシュが変わる）
  rm -f "$tgz"
  ( cd "$work/package" && "$BUN_BIN" pm pack --destination "$DEST" --quiet >/dev/null )
  rm -rf "$work"
done

printf 'riml-ds %s\n' "$(git -C "$SRC" rev-parse --short HEAD)" > "$DEST/SOURCE"
printf '==> %s\n' "$DEST"
ls -1 "$DEST"
