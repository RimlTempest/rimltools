resource "cloudflare_zero_trust_access_policy" "staging" {
  count = length(var.access_emails) > 0 ? 1 : 0

  account_id = var.cloudflare_account_id
  name       = "RimlTools staging: owner only"
  decision   = "allow"
  include    = [for e in var.access_emails : { email = { email = e } }]
}

module "tool" {
  source   = "./modules/tool"
  for_each = local.tools

  account_id              = var.cloudflare_account_id
  zone_id                 = data.cloudflare_zone.this.id
  domain                  = local.domain
  tool                    = each.value
  staging_domains_enabled = var.staging_domains_enabled
  legacy_hosts_attached   = var.legacy_hosts_mode == "attached"
  access_policy_id        = length(var.access_emails) > 0 ? cloudflare_zero_trust_access_policy.staging[0].id : null
}
