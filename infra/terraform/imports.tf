# 既存リソースを作り直さずに取り込む（ADR-0005）。
# 名前 → ID を data source で引き、存在するものだけ import する。新しいツールの
# リソースは存在しないので import されず、そのまま作成される。

locals {
  existing_workers        = { for w in data.cloudflare_workers.all.result : w.name => w.id }
  existing_d1             = { for d in data.cloudflare_d1_databases.all.result : d.name => d.uuid }
  existing_custom_domains = { for d in data.cloudflare_workers_custom_domains.all.result : d.hostname => d.id }
  existing_zone_rulesets  = { for r in data.cloudflare_rulesets.zone.rulesets : r.phase => r.id if r.kind == "zone" }

  import_workers = merge([
    for name, t in local.tools : {
      for w in t.workers : "${name}/${w.name}" => {
        tool = name
        key  = "production/${w.name}"
        id   = local.existing_workers[w.name]
      } if contains(keys(local.existing_workers), w.name)
    }
  ]...)

  import_d1 = merge([
    for name, t in local.tools : {
      for db in t.d1 : "${name}/${db.name}" => {
        tool = name
        key  = "production/${db.name}"
        id   = local.existing_d1[db.name]
      } if contains(keys(local.existing_d1), db.name)
    }
  ]...)

  import_production_domains = {
    for name, t in local.tools : name => local.existing_custom_domains["${t.subdomain}.${local.domain}"]
    if contains(keys(local.existing_custom_domains), "${t.subdomain}.${local.domain}")
  }

  import_legacy_domains = var.legacy_hosts_mode != "attached" ? {} : merge([
    for name, t in local.tools : {
      for h in t.legacyHosts : h => { tool = name, id = local.existing_custom_domains[h] }
      if contains(keys(local.existing_custom_domains), h)
    }
  ]...)

  zone_ruleset_phases = [
    "http_request_late_transform",
    "http_request_firewall_custom",
    "http_request_firewall_managed",
    "http_ratelimit",
    "http_request_dynamic_redirect",
  ]
  import_zone_rulesets = {
    for phase in local.zone_ruleset_phases : phase => local.existing_zone_rulesets[phase]
    if contains(keys(local.existing_zone_rulesets), phase)
  }
}

import {
  for_each = local.import_workers
  to       = module.tool[each.value.tool].cloudflare_worker.production[each.value.key]
  id       = "${var.cloudflare_account_id}/${each.value.id}"
}

import {
  for_each = local.import_d1
  to       = module.tool[each.value.tool].cloudflare_d1_database.production[each.value.key]
  id       = "${var.cloudflare_account_id}/${each.value.id}"
}

import {
  for_each = local.import_production_domains
  to       = module.tool[each.key].cloudflare_workers_custom_domain.production
  id       = "${var.cloudflare_account_id}/${each.value}"
}

import {
  for_each = local.import_legacy_domains
  to       = module.tool[each.value.tool].cloudflare_workers_custom_domain.legacy[each.key]
  id       = "${var.cloudflare_account_id}/${each.value.id}"
}

import {
  for_each = contains(keys(local.import_zone_rulesets), "http_request_late_transform") ? { x = local.import_zone_rulesets["http_request_late_transform"] } : {}
  to       = cloudflare_ruleset.version_affinity
  id       = "zones/${data.cloudflare_zone.this.id}/${each.value}"
}

import {
  for_each = contains(keys(local.import_zone_rulesets), "http_request_firewall_custom") ? { x = local.import_zone_rulesets["http_request_firewall_custom"] } : {}
  to       = cloudflare_ruleset.waf_custom
  id       = "zones/${data.cloudflare_zone.this.id}/${each.value}"
}

import {
  for_each = contains(keys(local.import_zone_rulesets), "http_request_firewall_managed") ? { x = local.import_zone_rulesets["http_request_firewall_managed"] } : {}
  to       = cloudflare_ruleset.waf_managed
  id       = "zones/${data.cloudflare_zone.this.id}/${each.value}"
}

import {
  for_each = contains(keys(local.import_zone_rulesets), "http_ratelimit") ? { x = local.import_zone_rulesets["http_ratelimit"] } : {}
  to       = cloudflare_ruleset.rate_limit
  id       = "zones/${data.cloudflare_zone.this.id}/${each.value}"
}

import {
  for_each = var.legacy_hosts_mode == "redirect" && contains(keys(local.import_zone_rulesets), "http_request_dynamic_redirect") ? { x = local.import_zone_rulesets["http_request_dynamic_redirect"] } : {}
  to       = cloudflare_ruleset.legacy_redirects[0]
  id       = "zones/${data.cloudflare_zone.this.id}/${each.value}"
}

# GitHub: 既存のリポジトリ・ruleset・environment
import {
  to = github_repository.this
  id = var.github_repository
}

import {
  to = github_repository_ruleset.develop
  id = "${var.github_repository}:23790765"
}

import {
  to = github_repository_ruleset.main
  id = "${var.github_repository}:23790766"
}

import {
  to = github_repository_environment.this["production"]
  id = "${var.github_repository}:production"
}
