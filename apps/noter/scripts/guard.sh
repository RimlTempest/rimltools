#!/usr/bin/env bash
# noter の不変条件（ADR）の検査。CI の product-ci.yml の guard ジョブが呼ぶ。
set -euo pipefail
cd "$(dirname "$0")/.."

# --- noter-sync は公開されていないこと (ADR-0002)
(
if grep -qE '^\s*"routes"\s*:' services/sync/wrangler.jsonc; then
  echo "::error file=services/sync/wrangler.jsonc::noter-sync must not be reachable from the internet. Remove 'routes' (ADR-0002)."
  exit 1
fi
# workers_dev は既定が true。routes が無くても
# noter-sync.<subdomain>.workers.dev で公開されるので、明示的な false を要求する。
if ! grep -qE '^\s*"workers_dev"\s*:\s*false\s*,?\s*$' services/sync/wrangler.jsonc; then
  echo "::error file=services/sync/wrangler.jsonc::noter-sync must set \"workers_dev\": false. It defaults to true and publishes the Worker on workers.dev even without routes (ADR-0002)."
  exit 1
fi
)

# --- 従量課金されるバインディングを足していないこと (ADR-0009)
(
# R2 は Cloudflare 側で利用上限を設定できず、超過分が従量課金される。
# 「無料で運用する」を構造的に守るため、宣言そのものを禁じる。
# KV は課金されないが、用途が無いので併せて弾く（ADR-0009）。
for f in services/web/wrangler.jsonc services/sync/wrangler.jsonc; do
  if grep -qE '^\s*"(r2_buckets|kv_namespaces)"\s*:' "$f"; then
    echo "::error file=$f::R2/KV bindings are forbidden. R2 has no spending cap and would break free-tier operation (ADR-0009)."
    exit 1
  fi
done
)

# --- Durable Object は SQLite backed であること (ADR-0009)
(
# new_classes（key-value backed）は Paid プラン限定。Free では
# new_sqlite_classes しか使えない。
if grep -qE '"new_classes"' services/sync/wrangler.jsonc; then
  echo "::error file=services/sync/wrangler.jsonc::use new_sqlite_classes (ADR-0009)"
  exit 1
fi
)

# --- class は Durable Object の殻だけであること (ADR-0004)
(
# .d.ts は生成物・型定義なので対象外（wrangler types / @types/react が class を含む）
hits=$(grep -rlE '^\s*(export\s+)?(abstract\s+)?class\s' \
  --include='*.ts' --include='*.tsx' --exclude='*.d.ts' \
  --exclude-dir=node_modules --exclude-dir=dist \
  shared features apps scripts \
  | grep -v 'features/sync/worker/document-room.ts' || true)
if [ -n "$hits" ]; then
  echo "$hits"
  echo "::error::class is only allowed in features/sync/worker/document-room.ts (ADR-0004)"
  exit 1
fi
)

# --- 開発用の WS 開放フラグが設定に混ざっていないこと (plan 002)
(
# NOTER_DEV_OPEN_WS は認可を丸ごと素通りさせる。.dev.vars と e2e の
# 起動環境にだけ置き、デプロイされる設定には絶対に載せない。
if grep -q 'NOTER_DEV_OPEN_WS' services/web/wrangler.jsonc services/sync/wrangler.jsonc; then
  echo "::error file=services/web/wrangler.jsonc::NOTER_DEV_OPEN_WS must never be declared in wrangler config. It bypasses authorization for /ws."
  exit 1
fi
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
  | xargs -0 -r grep -nE "from '\\.\\./\\.\\./[a-z-]+/(contract|core|ui|server|client|worker)/" || true)
if [ -n "$hits" ]; then
  echo "$hits"
  echo "::error::features must not reach into each other by relative path. Import via the '@noter/<feature>' entry points."
  exit 1
fi
)

echo "guard: ok"
