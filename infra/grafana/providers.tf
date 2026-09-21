# Grafana Cloud のプロバイダは 3 つに分かれる（provider docs の「Creating a Grafana Cloud stack provider」）。
#
# - grafana.cloud: Cloud API（スタック・access policy・Synthetic Monitoring の導入）。
#   ブートストラップの access policy token で動く（README §1）。
# - grafana（既定）: スタック内の Grafana（data source・ダッシュボード・アラート・SLO・IRM・Faro）。
#   このファイルで作る service account のトークンで動く。
# - grafana.sm: Synthetic Monitoring の API。導入時に発行されるトークンで動く。

provider "grafana" {
  alias                     = "cloud"
  cloud_access_policy_token = var.grafana_cloud_access_policy_token
}

provider "grafana" {
  url  = local.stack.url
  auth = grafana_cloud_stack_service_account_token.terraform.key

  frontend_o11y_api_access_token = grafana_cloud_access_policy_token.this["frontend-o11y"].token
}

provider "grafana" {
  alias           = "sm"
  sm_access_token = grafana_synthetic_monitoring_installation.this.sm_access_token
  sm_url          = grafana_synthetic_monitoring_installation.this.stack_sm_api_url
}

provider "github" {
  owner = var.github_owner
  token = var.github_token
}
