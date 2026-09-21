# ポータル（tools.riml4i.com）。コードは E レーン（products/portal）が wrangler で出す。

resource "cloudflare_worker" "portal" {
  account_id = var.cloudflare_account_id
  name       = "rimltools-portal"
  tags       = ["rimltools", "tool:portal", "env:production"]

  observability = {
    enabled = true
  }

  subdomain = {
    enabled          = false
    previews_enabled = false
  }

  lifecycle {
    ignore_changes = [observability, subdomain, logpush, tail_consumers, tags]
  }
}

resource "cloudflare_workers_custom_domain" "portal" {
  count = var.portal_domain_enabled ? 1 : 0

  account_id = var.cloudflare_account_id
  zone_id    = data.cloudflare_zone.this.id
  hostname   = local.domain
  service    = cloudflare_worker.portal.name
}

import {
  for_each = contains(keys(local.existing_workers), "rimltools-portal") ? { x = local.existing_workers["rimltools-portal"] } : {}
  to       = cloudflare_worker.portal
  id       = "${var.cloudflare_account_id}/${each.value}"
}

import {
  for_each = var.portal_domain_enabled && contains(keys(local.existing_custom_domains), local.domain) ? { x = local.existing_custom_domains[local.domain] } : {}
  to       = cloudflare_workers_custom_domain.portal[0]
  id       = "${var.cloudflare_account_id}/${each.value}"
}
