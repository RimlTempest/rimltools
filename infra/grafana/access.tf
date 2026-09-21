# 用途ごとに access policy を分け、必要なスコープだけを持たせる（docs/security.md の最小権限）。
# どれもこのスタックだけに効く（realm = stack）。

locals {
  access_policies = {
    # Worker（@rimltools/telemetry）が traces / logs / metrics を OTLP で送る。環境ごとに分け、
    # 漏れたら片方だけ失効できるようにする。
    "otlp-write-production" = ["metrics:write", "logs:write", "traces:write"]
    "otlp-write-staging"    = ["metrics:write", "logs:write", "traces:write"]
    # GitHub Actions（observability.yml）が Cloudflare の指標を送る
    "metrics-push" = ["metrics:write"]
    # Terraform が作る data source（rt-mimir / rt-loki / rt-tempo）が読む
    "datasource-read" = ["metrics:read", "logs:read", "traces:read"]
    # Frontend Observability（Faro）の app を Terraform で管理する
    "frontend-o11y" = ["frontend-observability:read", "frontend-observability:write", "frontend-observability:delete", "stacks:read"]
    # Synthetic Monitoring が結果を書き込む（grafana_synthetic_monitoring_installation の要件）
    "synthetic-publish" = ["metrics:write", "logs:write", "traces:write", "stacks:read"]
  }
}

resource "grafana_cloud_access_policy" "this" {
  for_each = local.access_policies
  provider = grafana.cloud

  name         = "rimltools-${each.key}"
  display_name = "RimlTools ${each.key}"
  region       = local.stack.region_slug
  scopes       = each.value

  realm {
    type       = "stack"
    identifier = local.stack.id
  }
}

resource "grafana_cloud_access_policy_token" "this" {
  for_each = local.access_policies
  provider = grafana.cloud

  name             = "rimltools-${each.key}"
  region           = local.stack.region_slug
  access_policy_id = grafana_cloud_access_policy.this[each.key].policy_id
}
