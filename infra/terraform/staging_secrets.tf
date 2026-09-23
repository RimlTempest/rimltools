# staging / preview の Worker（`<name>-staging`）が使うアプリの secret と、CI の Access 資格情報。
#
# - どの secret が要るかは tools.json の appSecrets（public Worker が読むもの）
# - BETTER_AUTH_SECRET はここで生成する。Google OAuth のクライアントは人が作り、apply のときだけ
#   SOPS の infra/secrets/apply.sops.yaml（TF_VAR_google_oauth_staging_json）から apply にだけ渡す
# - 値は staging / preview の environment secret `APP_SECRETS`（`{ "<tool>": { "<NAME>": "..." } }`）に
#   書き、リリースが public Worker の版に `--secrets-file` で載せる（scripts/release/secrets.ts）
# - 本番の environment には書かない。本番の Worker は自分の secret を持っていて、versions upload は
#   それを引き継ぐ（docs/release.md「secret の扱い」）

locals {
  staging_environments = toset(["staging", "preview"])

  google_oauth_staging = try(jsondecode(var.google_oauth_staging_json), null)

  # 名前 → 値。値が用意できないもの（Google のクライアントが未登録など）は null
  staging_secret_values = {
    for name, t in local.tools : name => {
      for key in try(t.appSecrets, []) : key => (
        key == "BETTER_AUTH_SECRET" ? random_password.better_auth_staging[name].result :
        key == "GOOGLE_CLIENT_ID" ? try(local.google_oauth_staging.client_id, null) :
        key == "GOOGLE_CLIENT_SECRET" ? try(local.google_oauth_staging.client_secret, null) :
        null
      )
    }
  }

  app_secrets_staging = {
    for name, values in local.staging_secret_values : name => {
      for key, value in values : key => value if value != null
    } if length([for v in values : v if v != null]) > 0
  }

  known_app_secrets = ["BETTER_AUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]
}

check "app_secrets_known" {
  assert {
    condition = alltrue(flatten([
      for t in local.tools : [for key in try(t.appSecrets, []) : contains(local.known_app_secrets, key)]
    ]))
    error_message = "tools.json appSecrets has a name staging_secrets.tf does not know how to fill. Add it to staging_secret_values."
  }
}

check "google_oauth_staging_json" {
  assert {
    condition     = var.google_oauth_staging_json == "" || local.google_oauth_staging != null
    error_message = "google_oauth_staging_json is not valid JSON ({\"client_id\": \"...\", \"client_secret\": \"...\"})."
  }
}

resource "random_password" "better_auth_staging" {
  for_each = { for name, t in local.tools : name => t if contains(try(t.appSecrets, []), "BETTER_AUTH_SECRET") }

  length  = 48
  special = false
}

resource "github_actions_environment_secret" "app_secrets" {
  for_each = length(local.app_secrets_staging) > 0 ? local.staging_environments : toset([])

  repository  = github_repository.this.name
  environment = github_repository_environment.this[each.key].environment
  secret_name = "APP_SECRETS"
  value       = jsonencode(local.app_secrets_staging)
}

resource "github_actions_environment_secret" "access_client_id" {
  for_each = length(cloudflare_zero_trust_access_service_token.ci) > 0 ? local.staging_environments : toset([])

  repository  = github_repository.this.name
  environment = github_repository_environment.this[each.key].environment
  secret_name = "CF_ACCESS_CLIENT_ID"
  value       = cloudflare_zero_trust_access_service_token.ci[0].client_id
}

resource "github_actions_environment_secret" "access_client_secret" {
  for_each = length(cloudflare_zero_trust_access_service_token.ci) > 0 ? local.staging_environments : toset([])

  repository  = github_repository.this.name
  environment = github_repository_environment.this[each.key].environment
  secret_name = "CF_ACCESS_CLIENT_SECRET"
  value       = cloudflare_zero_trust_access_service_token.ci[0].client_secret
}
