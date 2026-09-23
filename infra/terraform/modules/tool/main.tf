# One RimlTools tool: D1, Worker shells and Custom Domains（production だけ）。
# Code versions and deployments are owned by wrangler, not Terraform (ADR-0005).

locals {
  # staging / preview は 2026-09-23 に廃止した（docs/release.md）
  environments = {
    production = { suffix = "" }
  }

  public_worker = one([for w in var.tool.services : w.name if w.role == "public"])

  d1 = merge([
    for env, e in local.environments : {
      for db in var.tool.d1 : "${env}/${db.name}" => {
        env  = env
        name = "${db.name}${e.suffix}"
      }
    }
  ]...)

  workers = merge([
    for env, e in local.environments : {
      for w in var.tool.services : "${env}/${w.name}" => {
        env  = env
        name = "${w.name}${e.suffix}"
        role = w.role
      }
    }
  ]...)

  # apex（ポータル）は RimlTools のドメインそのものに載る
  hosts = var.tool.apex ? {
    production = var.domain
    } : {
    production = "${var.tool.subdomain}.${var.domain}"
  }
}

# --- D1 ---------------------------------------------------------------------

resource "cloudflare_d1_database" "production" {
  for_each = { for k, v in local.d1 : k => v if v.env == "production" }

  account_id = var.account_id
  name       = each.value.name

  lifecycle {
    # 本番データを持つ。誤って消さない。
    prevent_destroy = true
    ignore_changes  = [primary_location_hint, read_replication]
  }
}

# --- Worker shells -------------------------------------------------------------
# wrangler が versions upload のたびに observability・workers.dev・preview_urls を
# wrangler.jsonc の値で上書きする。取り合いにならないよう、作成時の値だけを決めて
# 以後の差分は無視する。

resource "cloudflare_worker" "production" {
  for_each = { for k, v in local.workers : k => v if v.env == "production" }

  account_id = var.account_id
  name       = each.value.name
  tags       = ["rimltools", "tool:${var.tool.name}", "env:production"]

  observability = {
    enabled = true
  }

  subdomain = {
    enabled          = false
    previews_enabled = false
  }

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [observability, subdomain, logpush, tail_consumers, tags]
  }
}

# --- Custom Domains ------------------------------------------------------------

resource "cloudflare_workers_custom_domain" "production" {
  count = var.production_domain_enabled ? 1 : 0

  account_id = var.account_id
  zone_id    = var.zone_id
  hostname   = local.hosts.production
  service    = cloudflare_worker.production["production/${local.public_worker}"].name
}

resource "cloudflare_workers_custom_domain" "legacy" {
  for_each = var.legacy_hosts_attached ? toset(var.tool.legacyHosts) : toset([])

  account_id = var.account_id
  zone_id    = var.zone_id
  hostname   = each.value
  service    = cloudflare_worker.production["production/${local.public_worker}"].name
}

