# Frontend Observability（Grafana Faro）。実利用者の Web Vitals（LCP / INP / CLS）と
# フロントエンドのエラー・trace を集める。app はツールごと、staging と本番の両方のオリジンを許可する。
# collector URL は GitHub の repository variable FARO_URL_<TOOL> に入る（github.tf）。

resource "grafana_frontend_o11y_app" "tool" {
  for_each = local.worker_tools

  stack_id = tonumber(local.stack.id)
  name     = each.key

  allowed_origins = concat(
    ["https://${each.value.host}", "https://${each.value.stagingHost}"],
    [for h in each.value.legacyHosts : "https://${h}"],
  )

  extra_log_attributes = {
    tool      = each.key
    namespace = "rimltools"
  }

  # 位置情報は取らない（個人に結び付く情報を増やさない）
  settings = {
    "combineLabData"      = "1"
    "geolocation.enabled" = "0"
  }
}
