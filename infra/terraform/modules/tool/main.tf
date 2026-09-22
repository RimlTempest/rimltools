# One RimlTools tool: D1, Worker shells, Custom Domains and Access for staging.
# Code versions and deployments are owned by wrangler, not Terraform (ADR-0005).

locals {
  environments = {
    production = { suffix = "" }
    staging    = { suffix = "-staging" }
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
    staging    = "staging.${var.domain}"
    } : {
    production = "${var.tool.subdomain}.${var.domain}"
    staging    = "${var.tool.subdomain}-staging.${var.domain}"
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

resource "cloudflare_d1_database" "staging" {
  for_each = { for k, v in local.d1 : k => v if v.env == "staging" }

  account_id            = var.account_id
  name                  = each.value.name
  primary_location_hint = "apac"

  lifecycle {
    ignore_changes = [read_replication]
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

resource "cloudflare_worker" "staging" {
  for_each = { for k, v in local.workers : k => v if v.env == "staging" }

  account_id = var.account_id
  name       = each.value.name
  tags       = ["rimltools", "tool:${var.tool.name}", "env:staging"]

  observability = {
    enabled = true
  }

  # PR ごとの preview（`wrangler versions upload --preview-alias pr-<N>`）は
  # staging の public Worker の preview URL で配る。internal は workers.dev に出さない。
  subdomain = {
    enabled          = false
    previews_enabled = each.value.role == "public"
  }

  lifecycle {
    ignore_changes = [observability, subdomain, logpush, tail_consumers, tags]
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

resource "cloudflare_workers_custom_domain" "staging" {
  count = var.staging_domains_enabled ? 1 : 0

  account_id = var.account_id
  zone_id    = var.zone_id
  hostname   = local.hosts.staging
  service    = cloudflare_worker.staging["staging/${local.public_worker}"].name
}

# 移行期間中だけ、旧ホスト（qrcc.riml4i.com など）を本番 Worker に付けたままにする。
# root の legacy_hosts_mode で外し、redirects.tf が 301 に切り替える。
resource "cloudflare_workers_custom_domain" "legacy" {
  for_each = var.legacy_hosts_attached ? toset(var.tool.legacyHosts) : toset([])

  account_id = var.account_id
  zone_id    = var.zone_id
  hostname   = each.value
  service    = cloudflare_worker.production["production/${local.public_worker}"].name
}

# --- Access (staging) ------------------------------------------------------------

resource "cloudflare_zero_trust_access_application" "staging" {
  count = length(var.access_policy_ids) > 0 ? 1 : 0

  account_id       = var.account_id
  name             = "${var.tool.name} (staging)"
  type             = "self_hosted"
  domain           = local.hosts.staging
  session_duration = "24h"

  policies = [for i, id in var.access_policy_ids : {
    id         = id
    precedence = i + 1
  }]
}
