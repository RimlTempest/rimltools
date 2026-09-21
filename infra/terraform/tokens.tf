# CI（GitHub Actions）がデプロイに使う Cloudflare API トークン。environment ごとに発行し、
# 値は Terraform から GitHub の environment secret に直接書き込む。人は値を見ない（ADR-0005）。
#
# 制約: account-owned token の resources は「アカウント単位」までしか絞れない。
# production と staging でトークンを分けるのは、漏洩時に片方だけ失効させるため。

locals {
  account_scope = "com.cloudflare.api.account"

  ci_permission_groups = [
    for g in data.cloudflare_account_api_token_permission_groups_list.all.result : g
    if contains(var.ci_token_permission_groups, g.name) && contains(g.scopes, local.account_scope)
  ]

  ci_permission_group_names_found = distinct([for g in local.ci_permission_groups : g.name])

  ci_token_environments = toset(["production", "staging"])
}

check "ci_token_permission_groups_exist" {
  assert {
    condition     = length(setsubtract(var.ci_token_permission_groups, local.ci_permission_group_names_found)) == 0
    error_message = "Permission groups not found (check names in the permission groups API): ${join(", ", setsubtract(var.ci_token_permission_groups, local.ci_permission_group_names_found))}"
  }
}

resource "cloudflare_account_token" "ci" {
  for_each = local.ci_token_environments

  account_id = var.cloudflare_account_id
  name       = "rimltools-ci-${each.key}"

  policies = [{
    effect            = "allow"
    permission_groups = [for g in local.ci_permission_groups : { id = g.id }]
    resources         = jsonencode({ "${local.account_scope}.${var.cloudflare_account_id}" = "*" })
  }]
}
