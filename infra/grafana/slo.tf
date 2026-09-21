# SLO（Grafana SLO）。作ると recording rule・ダッシュボード・burn rate アラート（fast / slow）が
# 自動で作られる。可用性は tools.json の slo、レイテンシは var.latency_p99_ms。
#
# 可用性:   成功した invocation の割合（イベント比）
# レイテンシ: 5 分窓ごとの wall time p99 が目標以下だった窓の割合（時間比）。
#            Workers の分位点は窓ごとの集計値しか取れないため（docs/observability-grafana.md）。

locals {
  slo_labels = { team = "rimltools" }
}

resource "grafana_slo" "availability" {
  for_each = local.worker_tools

  name        = "${each.key} 可用性"
  description = "${each.key} の Worker invocation の成功率（本番、${each.value.slo.windowDays} 日）"

  query {
    type = "freeform"
    freeform {
      query = "sum(sum_over_time(rimltools_worker_requests{${local.prod}, tool=\"${each.key}\", status_class=\"ok\"}[$__rate_interval])) / sum(sum_over_time(rimltools_worker_requests{${local.prod}, tool=\"${each.key}\"}[$__rate_interval]))"
    }
  }

  objectives {
    value  = each.value.slo.availability / 100
    window = "${each.value.slo.windowDays}d"
  }

  destination_datasource {
    uid = local.slo_destination_uid
  }

  dynamic "label" {
    for_each = merge(local.slo_labels, { tool = each.key })
    content {
      key   = label.key
      value = label.value
    }
  }

  alerting {
    # 数件の失敗で burn rate が跳ねないようにする（トラフィックが少ないため）
    advanced_options {
      min_failures = 5
    }
    label {
      key   = "team"
      value = "rimltools"
    }
    fastburn {
      annotation {
        key   = "name"
        value = "${each.key}: エラーバジェットを急速に消費している"
      }
      label {
        key   = "severity"
        value = "critical"
      }
    }
    slowburn {
      annotation {
        key   = "name"
        value = "${each.key}: エラーバジェットの消費が速い"
      }
      label {
        key   = "severity"
        value = "warning"
      }
    }
  }
}

resource "grafana_slo" "latency" {
  for_each = { for name, t in local.worker_tools : name => t if contains(keys(var.latency_p99_ms), name) }

  name        = "${each.key} レイテンシ p99"
  description = "${each.key} の wall time p99 が ${var.latency_p99_ms[each.key]}ms 以下だった時間の割合（本番）"

  query {
    type = "freeform"
    freeform {
      query = "avg_over_time((max(rimltools_worker_wall_time_ms{${local.prod}, tool=\"${each.key}\", quantile=\"0.99\"}) <= bool ${var.latency_p99_ms[each.key]})[$__rate_interval:5m])"
    }
  }

  objectives {
    value  = 0.99
    window = "${each.value.slo.windowDays}d"
  }

  destination_datasource {
    uid = local.slo_destination_uid
  }

  dynamic "label" {
    for_each = merge(local.slo_labels, { tool = each.key })
    content {
      key   = label.key
      value = label.value
    }
  }

  alerting {
    label {
      key   = "team"
      value = "rimltools"
    }
    slowburn {
      annotation {
        key   = "name"
        value = "${each.key}: レイテンシ SLO のバジェット消費が速い"
      }
      label {
        key   = "severity"
        value = "warning"
      }
    }
  }
}
