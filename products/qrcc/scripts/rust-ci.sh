#!/usr/bin/env bash
# Rust の fmt / clippy / test と、ブラウザ向け wasm のビルド確認（ADR-0003）。
# CI の product-ci.yml の rust ジョブが呼ぶ。
set -euo pipefail
cd "$(dirname "$0")/.."

cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo test -p qrcc-wasm --features decode
cargo check -p qrcc-wasm --target wasm32-unknown-unknown
cargo check -p qrcc-wasm --features decode --target wasm32-unknown-unknown
