#!/usr/bin/env bash
# ビルド後の wasm サイズ上限（ADR-0003）。CI の product-ci.yml が build の後に呼ぶ。
set -euo pipefail
cd "$(dirname "$0")/.."

# ブラウザ向けは生成用とデコード用の 2 チャンクに分かれている。
# 体感に直結するのは全画面で読む生成用なので、まとめて測らず別々に見る。
worker=$(find apps/web/dist/qrcc_api -name '*.wasm' -exec wc -c {} + | tail -1 | awk '{print $1}')
generate=$(find apps/web/dist/client -name 'qrcc_wasm_bg*.wasm' -exec gzip -c {} + | wc -c)
decode=$(find apps/web/dist/client -name 'qrcc_scan_wasm_bg*.wasm' -exec gzip -c {} + | wc -c)
echo "worker wasm: ${worker} bytes"
echo "browser wasm: generate ${generate} bytes gzip / decode ${decode} bytes gzip"
# 見つからないまま素通りすると、名前を変えた瞬間に検査が消える
if [ "$generate" -eq 0 ] || [ "$decode" -eq 0 ]; then
  echo "::error::A browser wasm chunk was not found. Check the wasm-pack out-name."
  exit 1
fi
if [ "$worker" -gt 3000000 ]; then
  echo "::error::Worker wasm exceeded 3MB. See ADR-0003."
  exit 1
fi
# 生成は全画面の初期体験に効く。gzip 200KB 以内（ADR-0003）
if [ "$generate" -gt 204800 ]; then
  echo "::error::Generation wasm exceeded 200KB gzip. See ADR-0003."
  exit 1
fi
# デコードは読み取り画面に入ったときだけ動的に読む。gzip 800KB 以内（ADR-0003）
if [ "$decode" -gt 819200 ]; then
  echo "::error::Decoding wasm exceeded 800KB gzip. See ADR-0003."
  exit 1
fi

# Worker（qrcc-web）の JS 全体の予算（bundle-budget.json）。上の wasm の検査とは別に見る。
bun ../../scripts/bundle-budget.ts .
