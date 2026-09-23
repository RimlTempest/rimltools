# Synthetic Monitoring（外形監視）。Grafana の公開 probe から各ツールのトップを定期的に叩く。
# GitHub Actions の synthetic（ops.yml）は、Grafana 側が止まったときの予備として残す。
#
# 予算: 1 probe × 5 分間隔 = 288 回 / 日 / ツール。Workers Free（100k / 日、アカウント全体）の 0.3% 程度。

resource "grafana_synthetic_monitoring_installation" "this" {
  provider = grafana.cloud

  stack_id              = local.stack.id
  metrics_publisher_key = grafana_cloud_access_policy_token.this["synthetic-publish"].token
}

data "grafana_synthetic_monitoring_probes" "all" {
  provider   = grafana.sm
  depends_on = [grafana_synthetic_monitoring_installation.this]
}

resource "grafana_synthetic_monitoring_check" "home" {
  for_each = local.synthetic_targets
  provider = grafana.sm

  job       = "rimltools-${each.key}"
  target    = "https://${each.value}/"
  enabled   = true
  frequency = var.synthetic_frequency_ms
  timeout   = 10000
  probes    = [for name in var.synthetic_probe_names : data.grafana_synthetic_monitoring_probes.all.probes[name]]

  labels = {
    tool = each.key
  }

  settings {
    http {
      method             = "GET"
      fail_if_not_ssl    = true
      valid_status_codes = [200]
      ip_version         = "Any"
    }
  }
}
