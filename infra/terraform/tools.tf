module "tool" {
  source   = "./modules/tool"
  for_each = local.tools

  account_id                = var.cloudflare_account_id
  zone_id                   = data.cloudflare_zone.this.id
  domain                    = local.domain
  tool                      = each.value
  production_domain_enabled = !contains(var.pending_tools, each.key)
  legacy_hosts_attached     = var.legacy_hosts_mode == "attached"
}
