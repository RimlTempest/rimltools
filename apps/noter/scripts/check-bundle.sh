#!/usr/bin/env bash
# ビルド後のサイズ予算（bundle-budget.json、docs/bundle.md）。CI の product-ci.yml が build の後に呼ぶ。
set -euo pipefail
cd "$(dirname "$0")/.."
bun ../../scripts/bundle-budget.ts .
