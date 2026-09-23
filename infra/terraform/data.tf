data "cloudflare_zone" "this" {
  filter = {
    name = local.zone
  }
}

# 既存リソースを import するために、名前から ID を引く。
data "cloudflare_workers" "all" {
  account_id = var.cloudflare_account_id
}

data "cloudflare_workers_custom_domains" "all" {
  account_id = var.cloudflare_account_id
}

data "cloudflare_account_api_token_permission_groups_list" "all" {
  account_id = var.cloudflare_account_id
}

data "cloudflare_d1_databases" "all" {
  account_id = var.cloudflare_account_id
}

data "cloudflare_rulesets" "zone" {
  zone_id = data.cloudflare_zone.this.id
}
