# Grafana の書き込み先と資格情報を GitHub Actions に渡す（リリース・メトリクス転送との契約）。
# environment（production / staging / ops）は infra/terraform が作る。先にあちらを apply する。
#
# 契約（docs/observability-grafana.md §契約）:
#   environment production / staging:
#     secret   GRAFANA_OTLP_HEADERS   "Authorization=Basic%20<base64(stack id:token)>"
#              （OTEL_EXPORTER_OTLP_HEADERS の形。OTel の仕様どおり値は URL エンコード済み = 空白は %20）
#     variable GRAFANA_OTLP_ENDPOINT  スタックの OTLP gateway（…/otlp。/v1/traces などはクライアントが足す）
#   environment ops:
#     secret   GRAFANA_METRICS_PUSH_URL / GRAFANA_METRICS_PUSH_USER / GRAFANA_METRICS_PUSH_TOKEN
#   repository variable:
#     FARO_URL_<TOOL>                  Faro の collector URL（公開されてよい値）

resource "github_actions_environment_secret" "otlp_headers" {
  for_each = var.otlp_environments

  repository  = var.github_repository
  environment = each.key
  secret_name = "GRAFANA_OTLP_HEADERS"
  # Worker（@rimltools/telemetry）はこの値を OTEL_EXPORTER_OTLP_HEADERS としてそのまま受け取り、
  # URL デコードしてからヘッダにする。空白は %20 で書く（docs/observability-grafana.md §Worker への受け渡し）。
  value = "Authorization=Basic%20${base64encode(
    "${local.stack.id}:${grafana_cloud_access_policy_token.this["otlp-write-${each.key}"].token}"
  )}"
}

resource "github_actions_environment_variable" "otlp_endpoint" {
  for_each = var.otlp_environments

  repository    = var.github_repository
  environment   = each.key
  variable_name = "GRAFANA_OTLP_ENDPOINT"
  value         = local.stack.otlp_url
}

resource "github_actions_environment_secret" "metrics_push" {
  for_each = {
    GRAFANA_METRICS_PUSH_URL   = local.stack.otlp_url
    GRAFANA_METRICS_PUSH_USER  = local.stack.id
    GRAFANA_METRICS_PUSH_TOKEN = grafana_cloud_access_policy_token.this["metrics-push"].token
  }

  repository  = var.github_repository
  environment = var.ops_environment
  secret_name = each.key
  value       = each.value
}

resource "github_actions_variable" "faro_url" {
  for_each = grafana_frontend_o11y_app.tool

  repository    = var.github_repository
  variable_name = "FARO_URL_${upper(each.key)}"
  value         = each.value.collector_endpoint
}

resource "github_actions_variable" "metrics_push_enabled" {
  repository    = var.github_repository
  variable_name = "GRAFANA_METRICS_PUSH_ENABLED"
  value         = tostring(var.metrics_push_enabled)
}
