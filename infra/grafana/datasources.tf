# ダッシュボードとアラートが使う data source。Grafana Cloud が自動で作る data source は
# 編集できない（provisioned）ことがあるため、相関の設定を持たせた自前の 3 つを作る。
# UID は固定（ops/dashboards/*.json と scripts/ops/dashboards.ts の契約）。
#
# 相関（ADR-0008）:
#   Mimir の exemplar（trace_id）→ Tempo
#   Tempo の span → Loki（同じ trace_id のログ）/ Mimir（span metrics）/ service graph
#   Loki のログ（trace_id）→ Tempo

locals {
  read_token = grafana_cloud_access_policy_token.this["datasource-read"].token
}

resource "grafana_data_source" "mimir" {
  type                = "prometheus"
  name                = "RimlTools Mimir"
  uid                 = local.ds.mimir
  url                 = "${local.stack.prometheus_url}/api/prom"
  basic_auth_enabled  = true
  basic_auth_username = tostring(local.stack.prometheus_user_id)

  json_data_encoded = jsonencode({
    httpMethod     = "POST"
    prometheusType = "Mimir"
    timeInterval   = "60s"
    exemplarTraceIdDestinations = [
      { name = "trace_id", datasourceUid = local.ds.tempo },
      { name = "traceID", datasourceUid = local.ds.tempo },
    ]
  })

  secure_json_data_encoded = jsonencode({ basicAuthPassword = local.read_token })
}

resource "grafana_data_source" "loki" {
  type                = "loki"
  name                = "RimlTools Loki"
  uid                 = local.ds.loki
  url                 = local.stack.logs_url
  basic_auth_enabled  = true
  basic_auth_username = tostring(local.stack.logs_user_id)

  json_data_encoded = jsonencode({
    maxLines = 1000
    derivedFields = [
      {
        # OTLP で送ったログは trace_id を structured metadata に持つ
        name            = "TraceID"
        matcherType     = "label"
        matcherRegex    = "trace_id"
        datasourceUid   = local.ds.tempo
        url             = "$${__value.raw}"
        urlDisplayLabel = "trace を開く"
      },
      {
        # 本文の JSON に trace_id を書いているログ（Workers Logs 由来など）
        name            = "TraceID (本文)"
        matcherType     = "regex"
        matcherRegex    = "\"trace_?[iI][dD]\"\\s*:\\s*\"([0-9a-f]{32})\""
        datasourceUid   = local.ds.tempo
        url             = "$${__value.raw}"
        urlDisplayLabel = "trace を開く"
      },
    ]
  })

  secure_json_data_encoded = jsonencode({ basicAuthPassword = local.read_token })
}

resource "grafana_data_source" "tempo" {
  type                = "tempo"
  name                = "RimlTools Tempo"
  uid                 = local.ds.tempo
  url                 = "${local.stack.traces_url}/tempo"
  basic_auth_enabled  = true
  basic_auth_username = tostring(local.stack.traces_user_id)

  json_data_encoded = jsonencode({
    tracesToLogsV2 = {
      datasourceUid      = local.ds.loki
      spanStartTimeShift = "-5m"
      spanEndTimeShift   = "5m"
      filterByTraceID    = true
      filterBySpanID     = false
      tags = [
        { key = "service.name", value = "service_name" },
        { key = "deployment.environment.name", value = "deployment_environment_name" },
      ]
    }
    tracesToMetrics = {
      datasourceUid      = local.ds.mimir
      spanStartTimeShift = "-10m"
      spanEndTimeShift   = "10m"
      tags               = [{ key = "service.name", value = "service" }]
      queries = [
        {
          name  = "p99"
          query = "histogram_quantile(0.99, sum by (le) (rate(traces_spanmetrics_latency_bucket{$$__tags}[5m])))"
        },
        {
          name  = "エラー率"
          query = "sum(rate(traces_spanmetrics_calls_total{$$__tags, status_code=\"STATUS_CODE_ERROR\"}[5m])) / sum(rate(traces_spanmetrics_calls_total{$$__tags}[5m]))"
        },
      ]
    }
    serviceMap = { datasourceUid = local.ds.mimir }
    nodeGraph  = { enabled = true }
    lokiSearch = { datasourceUid = local.ds.loki }
    search     = { hide = false }
    traceQuery = {
      timeShiftEnabled   = true
      spanStartTimeShift = "-30m"
      spanEndTimeShift   = "30m"
    }
  })

  secure_json_data_encoded = jsonencode({ basicAuthPassword = local.read_token })
}
