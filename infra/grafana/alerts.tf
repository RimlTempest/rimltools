# Grafana-managed のアラートルール。PromQL 側で閾値を超えた系列だけを返し、
# 式（B）は「系列があれば発火」にする（系列ごとに独立して発火・解決する）。
# 通知先は notification policy（oncall.tf）が severity で振り分ける。
#
# 注意: checkov の HCL パーサは属性名 `for`（grafana_rule_group の必須属性）を読めず、
# このファイルを黙ってスキップする（exit 0）。セキュリティ上の検査対象は含まない。

locals {
  prod = "environment=\"production\""

  alert_rules = concat(
    [
      {
        uid      = "rimltools-error-ratio"
        name     = "エラー率が高い（本番）"
        severity = "critical"
        pending  = "5m"
        paused   = false
        summary  = "{{ $labels.tool }} のエラー率が直近 30 分で 2% を超えた"
        expr     = "(sum by (tool) (sum_over_time(rimltools_worker_requests{${local.prod}, status_class=\"error\"}[30m])) / sum by (tool) (sum_over_time(rimltools_worker_requests{${local.prod}}[30m])) > 0.02) and on (tool) sum by (tool) (sum_over_time(rimltools_worker_requests{${local.prod}}[30m])) >= 50"
      },
      {
        uid      = "rimltools-canary-error-diff"
        name     = "新しい版のエラー率が旧版より高い（カナリア）"
        severity = "critical"
        pending  = "0m"
        paused   = false
        summary  = "{{ $labels.script }} の版 {{ $labels.version }} のエラー率が Worker 全体より 1pt 以上高い。段階リリースを止めてロールバックを検討（docs/runbooks/rollback.md）"
        expr     = "((sum by (script, version) (sum_over_time(rimltools_worker_requests{${local.prod}, status_class=\"error\"}[15m])) / sum by (script, version) (sum_over_time(rimltools_worker_requests{${local.prod}}[15m]))) - on (script) group_left () (sum by (script) (sum_over_time(rimltools_worker_requests{${local.prod}, status_class=\"error\"}[15m])) / sum by (script) (sum_over_time(rimltools_worker_requests{${local.prod}}[15m]))) > 0.01) and on (script, version) sum by (script, version) (sum_over_time(rimltools_worker_requests{${local.prod}}[15m])) >= 50 and on (script) count by (script) (count by (script, version) (rimltools_worker_requests{${local.prod}})) > 1"
      },
      {
        uid      = "rimltools-cpu-near-limit"
        name     = "CPU time p99 が Workers Free の上限（10ms）に近い"
        severity = "warning"
        pending  = "15m"
        paused   = false
        summary  = "{{ $labels.tool }} の CPU time p99 が 8ms を超えている。超えると invocation が失敗する"
        expr     = "max by (tool) (max_over_time(rimltools_worker_cpu_time_ms{${local.prod}, quantile=\"0.99\"}[15m])) > 8"
      },
      {
        uid      = "rimltools-free-tier-workers"
        name     = "Workers のリクエスト数が無料枠の 70% を超えた"
        severity = "warning"
        pending  = "0m"
        paused   = false
        summary  = "今日（UTC）の Workers リクエストが 70,000 を超えた（上限 100,000 / 日）。docs/runbooks/free-tier-exhausted.md"
        expr     = "max(rimltools_workers_requests_today) > 70000"
      },
      {
        uid      = "rimltools-free-tier-workers-critical"
        name     = "Workers のリクエスト数が無料枠の 90% を超えた"
        severity = "critical"
        pending  = "0m"
        paused   = false
        summary  = "今日（UTC）の Workers リクエストが 90,000 を超えた。上限に達すると全ツールが止まる"
        expr     = "max(rimltools_workers_requests_today) > 90000"
      },
      {
        uid      = "rimltools-free-tier-d1"
        name     = "D1 の行書き込みが無料枠の 70% を超えた"
        severity = "warning"
        pending  = "0m"
        paused   = false
        summary  = "今日（UTC）の D1 行書き込みが 70,000 を超えた（上限 100,000 / 日）"
        expr     = "sum(rimltools_d1_rows_written_today) > 70000"
      },
      {
        uid      = "rimltools-synthetic-failing"
        name     = "外形監視が失敗している"
        severity = "critical"
        pending  = "10m"
        paused   = false
        summary  = "{{ $labels.job }} の成功率が直近 15 分で 80% を下回った"
        expr     = "avg by (job) (avg_over_time(probe_success{job=~\"rimltools-.*\"}[15m])) < 0.8"
      },
      {
        uid      = "rimltools-metrics-push-stale"
        name     = "メトリクス転送が止まっている"
        severity = "warning"
        pending  = "0m"
        paused   = !var.metrics_push_enabled
        summary  = "ops-metrics.yml の最終成功から 30 分以上経過。GitHub Actions を確認"
        expr     = "(time() - max(rimltools_metrics_push_last_success_timestamp_seconds) > 1800) or absent(rimltools_metrics_push_last_success_timestamp_seconds)"
      },
    ],
    [
      for tool, threshold in var.latency_p99_ms : {
        uid      = "rimltools-latency-${tool}"
        name     = "${tool}: wall time p99 が ${threshold}ms を超えた"
        severity = "warning"
        pending  = "15m"
        paused   = false
        summary  = "${tool} の wall time p99 が ${threshold}ms を 15 分超え続けている"
        expr     = "max by (tool) (rimltools_worker_wall_time_ms{${local.prod}, tool=\"${tool}\", quantile=\"0.99\"}) > ${threshold}"
      }
    ],
  )
}

resource "grafana_rule_group" "rimltools" {
  name             = "rimltools"
  folder_uid       = grafana_folder.rimltools.uid
  interval_seconds = 60

  dynamic "rule" {
    for_each = local.alert_rules
    content {
      uid            = rule.value.uid
      name           = rule.value.name
      condition      = "B"
      for            = rule.value.pending
      is_paused      = rule.value.paused
      no_data_state  = "OK"
      exec_err_state = "Error"

      labels = {
        severity = rule.value.severity
        team     = "rimltools"
      }

      annotations = {
        summary       = rule.value.summary
        runbook_url   = "https://github.com/${var.github_owner}/${var.github_repository}/tree/develop/docs/runbooks"
        dashboard_url = "${local.stack.url}/d/rimltools-overview"
      }

      data {
        ref_id         = "A"
        datasource_uid = grafana_data_source.mimir.uid
        relative_time_range {
          from = 1800
          to   = 0
        }
        model = jsonencode({
          refId   = "A"
          expr    = rule.value.expr
          instant = true
          range   = false
        })
      }

      data {
        ref_id         = "B"
        datasource_uid = "-100"
        relative_time_range {
          from = 0
          to   = 0
        }
        model = jsonencode({
          refId      = "B"
          type       = "threshold"
          expression = "A"
          datasource = { type = "__expr__", uid = "-100" }
          conditions = [{ evaluator = { type = "gt", params = [0] } }]
        })
      }
    }
  }
}

# --- ログ（Loki）から作るアラート -------------------------------------------------------
#
# tfstate Worker（infra/tfstate）の認証失敗。Free の rate limiting は /api/auth/ に使っているので
# tfstate には掛かっていない。総当たりを資格情報の長さ（32 文字以上）で防ぎつつ、試行を検知する。
# ログは @rimltools/telemetry が OTLP で送る（全件。service_name = rimltools-tfstate）。
# 失敗が続くなら docs/runbooks/secret-leak.md §2-3 で資格情報を替える。

locals {
  log_alert_rules = [
    {
      uid      = "rimltools-tfstate-auth-failures"
      name     = "tfstate への認証失敗が多い（総当たりの疑い）"
      severity = "critical"
      pending  = "0m"
      summary  = "tfstate.tools.riml4i.com への認証失敗が 10 分で 20 回を超えた。資格情報の総当たりの疑い（docs/runbooks/secret-leak.md §2-3）"
      expr     = "sum(count_over_time({service_namespace=\"rimltools\", service_name=\"rimltools-tfstate\"} | event = `tfstate_auth_failed` [10m])) > 20"
    },
    {
      uid      = "rimltools-tfstate-retention-limit"
      name     = "tfstate が版の上限に達して書き込みを拒否した"
      severity = "critical"
      pending  = "0m"
      summary  = "tfstate が 507 を返した（7 日以内の版が 500 を超えた、または合計 1 GiB を超えた）。上書きの連打（資格情報の漏洩）を疑う。plan / apply は止まっている（docs/runbooks/tfstate-restore.md §7）"
      expr     = "sum(count_over_time({service_namespace=\"rimltools\", service_name=\"rimltools-tfstate\"} | event = `tfstate_retention_limit` [10m])) > 0"
    },
  ]
}

resource "grafana_rule_group" "rimltools_logs" {
  name             = "rimltools-logs"
  folder_uid       = grafana_folder.rimltools.uid
  interval_seconds = 60

  dynamic "rule" {
    for_each = local.log_alert_rules
    content {
      uid            = rule.value.uid
      name           = rule.value.name
      condition      = "B"
      for            = rule.value.pending
      is_paused      = false
      no_data_state  = "OK"
      exec_err_state = "Error"

      labels = {
        severity = rule.value.severity
        team     = "rimltools"
      }

      annotations = {
        summary     = rule.value.summary
        runbook_url = "https://github.com/${var.github_owner}/${var.github_repository}/tree/develop/docs/runbooks/secret-leak.md"
      }

      data {
        ref_id         = "A"
        datasource_uid = grafana_data_source.loki.uid
        relative_time_range {
          from = 600
          to   = 0
        }
        model = jsonencode({
          refId     = "A"
          expr      = rule.value.expr
          queryType = "instant"
        })
      }

      data {
        ref_id         = "B"
        datasource_uid = "-100"
        relative_time_range {
          from = 0
          to   = 0
        }
        model = jsonencode({
          refId      = "B"
          type       = "threshold"
          expression = "A"
          datasource = { type = "__expr__", uid = "-100" }
          conditions = [{ evaluator = { type = "gt", params = [0] } }]
        })
      }
    }
  }
}
