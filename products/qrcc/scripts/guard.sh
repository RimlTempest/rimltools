#!/usr/bin/env bash
# qrcc の不変条件（ADR）の検査。CI の product-ci.yml の guard ジョブが呼ぶ。
set -euo pipefail
cd "$(dirname "$0")/.."

# --- qrcc-api は公開されていないこと (ADR-0002)
(
if grep -qE '^\s*"routes"\s*:' apps/api/wrangler.jsonc; then
  echo "::error file=apps/api/wrangler.jsonc::qrcc-api must not be reachable from the internet. Remove 'routes' (ADR-0002)."
  exit 1
fi
# workers_dev は既定が true。routes が無くても
# qrcc-api.<subdomain>.workers.dev で公開されるので、明示的な false を要求する。
if ! grep -qE '^\s*"workers_dev"\s*:\s*false\s*,?\s*$' apps/api/wrangler.jsonc; then
  echo "::error file=apps/api/wrangler.jsonc::qrcc-api must set \"workers_dev\": false. It defaults to true and publishes the Worker on workers.dev even without routes (ADR-0002)."
  exit 1
fi
)

# --- 従量課金されるバインディングを足していないこと (ADR-0009)
(
# R2 は Cloudflare 側で利用上限を設定できず、超過分が従量課金される。
# 「無料で運用する」を構造的に守るため、宣言そのものを禁じる。
# KV は課金されないが、用途が無いので併せて弾く（ADR-0009）。
for f in apps/web/wrangler.jsonc apps/api/wrangler.jsonc; do
  if grep -qE '^\s*"(r2_buckets|kv_namespaces)"\s*:' "$f"; then
    echo "::error file=$f::R2/KV bindings are forbidden. R2 has no spending cap and would break free-tier operation (ADR-0009)."
    exit 1
  fi
done
)

# --- engine crate は worker crate に依存しないこと (ADR-0003)
(
for f in features/*/engine/Cargo.toml shared/*/engine/Cargo.toml; do
  if grep -qE '^\s*worker(\s|\.|=)' "$f"; then
    echo "::error file=$f::engine crates must not depend on the 'worker' crate; put I/O in features/<name>/worker (ADR-0003)."
    exit 1
  fi
done
)

# --- ドメイン層に I/O が漏れていないこと
(
hits=$(find shared/contract/src features/*/contract features/*/core -name '*.ts' ! -name '*.test.ts' -print0 2>/dev/null \
  | xargs -0 -r grep -nE '\b(fetch|localStorage|process\.env)\b' || true)
if [ -n "$hits" ]; then
  echo "$hits"
  echo "::error::contract and core layers must stay I/O free. Inject dependencies instead."
  exit 1
fi
)

# --- feature 同士が内部を直接 import していないこと (ADR-0007)
(
hits=$(find features \( -name '*.ts' -o -name '*.tsx' \) -print0 2>/dev/null \
  | xargs -0 -r grep -nE "from '\\.\\./\\.\\./[a-z-]+/(contract|core|ui|server)/" || true)
if [ -n "$hits" ]; then
  echo "$hits"
  echo "::error::features must not reach into each other by relative path. Import via the '@qrcc/<feature>' entry points."
  exit 1
fi
)

echo "guard: ok"
