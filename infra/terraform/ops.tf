# ops（SLO・synthetic 監視・無料枠の監視、ADR-0007）用の資格情報と設定。
# 読み取り専用の Analytics トークンだけを、develop に限定した environment `ops` に置く。

locals {
  ops_permission_groups = [
    for g in data.cloudflare_account_api_token_permission_groups_list.all.result : g
    if contains(var.ops_token_permission_groups, g.name) && contains(g.scopes, local.account_scope)
  ]
  ops_permission_group_names_found = distinct([for g in local.ops_permission_groups : g.name])

  # 移行期間（旧ホストが本番 Worker に付いている間）は旧ホストを監視する。
  # まだ本番にデプロイしていないツールは "" = 監視しない。それ以外は tools.json の既定ホスト。
  ops_host_overrides = merge(
    var.legacy_hosts_mode == "attached" ? {
      for name, t in local.tools : name => t.legacyHosts[0] if length(t.legacyHosts) > 0
    } : {},
    { for name in var.pending_tools : name => "" if contains(keys(local.tools), name) },
  )
}

check "ops_token_permission_groups_exist" {
  assert {
    condition     = length(setsubtract(var.ops_token_permission_groups, local.ops_permission_group_names_found)) == 0
    error_message = "Permission groups not found: ${join(", ", setsubtract(var.ops_token_permission_groups, local.ops_permission_group_names_found))}"
  }
}

resource "cloudflare_account_token" "ops" {
  account_id = var.cloudflare_account_id
  name       = "rimltools-ops-analytics"

  policies = [{
    effect            = "allow"
    permission_groups = [for g in local.ops_permission_groups : { id = g.id }]
    resources         = jsonencode({ "${local.account_scope}.${var.cloudflare_account_id}" = "*" })
  }]
}

resource "github_repository_environment" "ops" {
  repository  = github_repository.this.name
  environment = local.ops_environment.name

  deployment_branch_policy {
    protected_branches     = false
    custom_branch_policies = true
  }
}

resource "github_repository_environment_deployment_policy" "ops" {
  repository     = github_repository.this.name
  environment    = github_repository_environment.ops.environment
  branch_pattern = local.ops_environment.branch
}

resource "github_actions_environment_secret" "ops_analytics_token" {
  repository  = github_repository.this.name
  environment = github_repository_environment.ops.environment
  secret_name = "CLOUDFLARE_ANALYTICS_TOKEN"
  value       = cloudflare_account_token.ops.value
}

resource "github_actions_environment_secret" "ops_account_id" {
  repository  = github_repository.this.name
  environment = github_repository_environment.ops.environment
  secret_name = "CLOUDFLARE_ACCOUNT_ID"
  value       = var.cloudflare_account_id
}

resource "github_actions_variable" "ops_host_overrides" {
  repository    = github_repository.this.name
  variable_name = "OPS_HOST_OVERRIDES"
  value         = jsonencode(local.ops_host_overrides)
}

resource "github_actions_variable" "ops_issues" {
  repository    = github_repository.this.name
  variable_name = "OPS_ISSUES"
  value         = tostring(var.ops_issues_enabled)
}
