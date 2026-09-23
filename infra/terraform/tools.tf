resource "cloudflare_zero_trust_access_policy" "staging" {
  count = length(var.access_emails) > 0 ? 1 : 0

  account_id = var.cloudflare_account_id
  name       = "RimlTools staging: owner only"
  decision   = "allow"
  include    = [for e in var.access_emails : { email = { email = e } }]
}

# リリースの smoke（CI）が staging を Access 越しに叩くための service token。
# 値は staging / preview の environment secret（CF_ACCESS_CLIENT_ID / _SECRET）に書く（github.tf）。
# 有効期限は 1 年。更新は `tofu apply -replace=cloudflare_zero_trust_access_service_token.ci[0]`
# （README「service token の更新」、docs/runbooks/secret-leak.md）。
resource "cloudflare_zero_trust_access_service_token" "ci" {
  count = length(var.access_emails) > 0 ? 1 : 0

  account_id = var.cloudflare_account_id
  name       = "rimltools-ci-staging-smoke"
  duration   = "8760h"
}

# service token を持つリクエストだけを、ログイン無しで通す（non_identity）
resource "cloudflare_zero_trust_access_policy" "staging_ci" {
  count = length(var.access_emails) > 0 ? 1 : 0

  account_id = var.cloudflare_account_id
  name       = "RimlTools staging: CI service token"
  decision   = "non_identity"
  include    = [{ service_token = { token_id = cloudflare_zero_trust_access_service_token.ci[0].id } }]
}

module "tool" {
  source   = "./modules/tool"
  for_each = local.tools

  account_id                = var.cloudflare_account_id
  zone_id                   = data.cloudflare_zone.this.id
  domain                    = local.domain
  tool                      = each.value
  staging_domains_enabled   = var.staging_domains_enabled
  production_domain_enabled = !contains(var.pending_tools, each.key)
  legacy_hosts_attached     = var.legacy_hosts_mode == "attached"
  access_policy_ids = length(var.access_emails) > 0 ? [
    cloudflare_zero_trust_access_policy.staging[0].id,
    cloudflare_zero_trust_access_policy.staging_ci[0].id,
  ] : []
}
