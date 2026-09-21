# ダッシュボードの正本は observability/dashboards/*.json（scripts/observability/dashboards.ts が検査する）。

resource "grafana_folder" "rimltools" {
  uid   = "rimltools"
  title = "RimlTools"
}

resource "grafana_dashboard" "this" {
  for_each = fileset("${path.module}/../../observability/dashboards", "*.json")

  folder      = grafana_folder.rimltools.uid
  config_json = file("${path.module}/../../observability/dashboards/${each.value}")
  overwrite   = true
  message     = "Managed by Terraform (infra/grafana)"

  depends_on = [grafana_data_source.mimir, grafana_data_source.loki, grafana_data_source.tempo]
}
