output "grafana_url" {
  description = "Grafana のURL。"
  value       = local.stack.url
}

output "otlp_endpoint" {
  description = "OTLP gateway（Worker と metrics push の送り先）。"
  value       = local.stack.otlp_url
}

output "faro_collector_urls" {
  description = "ツールごとの Faro collector URL（GitHub の FARO_URL_<TOOL> にも入る）。"
  value       = { for k, v in grafana_frontend_o11y_app.tool : k => v.collector_endpoint }
}

output "oncall_integration_link" {
  description = "IRM の Grafana Alerting integration（oncall_usernames が空なら null）。"
  value       = local.oncall_enabled ? grafana_oncall_integration.alerting[0].link : null
  sensitive   = true
}

output "tfstate_otlp_headers" {
  description = "tfstate Worker の OTEL_EXPORTER_OTLP_HEADERS（wrangler secret put で入れる。infra/tfstate/README.md「監視」）。"
  value       = "Authorization=Basic%20${base64encode("${local.stack.id}:${grafana_cloud_access_policy_token.this["otlp-write-tfstate"].token}")}"
  sensitive   = true
}
