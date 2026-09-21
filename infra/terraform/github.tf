# GitHub: リポジトリ設定・rulesets・environments・Actions の secret / variable。
# environment の secret / variable はリリース（C レーン）との契約。名前を変えるときは
# .github/workflows 側と同時に変える（docs/platform.md §2）。

resource "github_repository" "this" {
  #checkov:skip=CKV_GIT_1:Public on purpose. Branch rulesets, CodeQL and environment protection are free only for public repositories (ADR-0006).
  name        = var.github_repository
  description = "RimlTools — small web tools on Cloudflare Workers (${local.domain})"
  visibility  = "public"

  has_issues      = true
  has_projects    = true
  has_wiki        = false
  has_discussions = false

  allow_merge_commit     = true
  allow_squash_merge     = true
  allow_rebase_merge     = false
  allow_auto_merge       = false
  allow_update_branch    = false
  delete_branch_on_merge = true

  # GitHub が作るマージコミットも Conventional Commits になるよう、PR タイトルを使う
  squash_merge_commit_title   = "PR_TITLE"
  squash_merge_commit_message = "PR_BODY"
  merge_commit_title          = "PR_TITLE"
  merge_commit_message        = "PR_BODY"

  security_and_analysis {
    secret_scanning {
      status = "enabled"
    }
    secret_scanning_push_protection {
      status = "enabled"
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "github_repository_vulnerability_alerts" "this" {
  repository = github_repository.this.name
  enabled    = true
}

resource "github_repository_dependabot_security_updates" "this" {
  repository = github_repository.this.name
  enabled    = true

  depends_on = [github_repository_vulnerability_alerts.this]
}

# --- rulesets (ADR-0002) ---------------------------------------------------------

locals {
  # GitHub Actions の app id。status check をこの app が出したものに限る。
  github_actions_app_id = 15368

  required_checks = {
    develop = ["gate", "security-gate", "conventional"]
    main    = ["gate", "security-gate", "release-guard", "conventional"]
  }

  # CodeQL の結果が無い・high 以上のセキュリティアラートや error がある PR はマージできない（ADR-0006）
  required_code_scanning_tools = [
    { tool = "CodeQL", security_alerts_threshold = "high_or_higher", alerts_threshold = "errors" },
  ]
}

resource "github_repository_ruleset" "develop" {
  name        = "develop"
  repository  = github_repository.this.name
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["refs/heads/develop"]
      exclude = []
    }
  }

  rules {
    deletion                = true
    non_fast_forward        = true
    required_linear_history = true

    pull_request {
      required_approving_review_count   = 0
      dismiss_stale_reviews_on_push     = false
      require_code_owner_review         = false
      require_last_push_approval        = false
      required_review_thread_resolution = true
      allowed_merge_methods             = ["squash"]
    }

    required_status_checks {
      strict_required_status_checks_policy = false
      dynamic "required_check" {
        for_each = local.required_checks.develop
        content {
          context        = required_check.value
          integration_id = local.github_actions_app_id
        }
      }
    }

    required_code_scanning {
      dynamic "required_code_scanning_tool" {
        for_each = local.required_code_scanning_tools
        content {
          tool                      = required_code_scanning_tool.value.tool
          security_alerts_threshold = required_code_scanning_tool.value.security_alerts_threshold
          alerts_threshold          = required_code_scanning_tool.value.alerts_threshold
        }
      }
    }
  }
}

resource "github_repository_ruleset" "main" {
  name        = "main"
  repository  = github_repository.this.name
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["refs/heads/main"]
      exclude = []
    }
  }

  rules {
    deletion         = true
    non_fast_forward = true

    pull_request {
      required_approving_review_count   = 0
      dismiss_stale_reviews_on_push     = false
      require_code_owner_review         = false
      require_last_push_approval        = false
      required_review_thread_resolution = true
      allowed_merge_methods             = ["merge"]
    }

    required_status_checks {
      strict_required_status_checks_policy = false
      dynamic "required_check" {
        for_each = local.required_checks.main
        content {
          context        = required_check.value
          integration_id = local.github_actions_app_id
        }
      }
    }

    required_code_scanning {
      dynamic "required_code_scanning_tool" {
        for_each = local.required_code_scanning_tools
        content {
          tool                      = required_code_scanning_tool.value.tool
          security_alerts_threshold = required_code_scanning_tool.value.security_alerts_threshold
          alerts_threshold          = required_code_scanning_tool.value.alerts_threshold
        }
      }
    }
  }
}

# --- environments ----------------------------------------------------------------

resource "github_repository_environment" "this" {
  for_each = local.environments

  repository  = github_repository.this.name
  environment = each.key

  # branch が決まっている環境（staging=develop, production=main）はそのブランチからしか使えない。
  # preview は PR ごとなので制限しない（ただし staging の資格情報しか持たない）。
  dynamic "deployment_branch_policy" {
    for_each = each.value.branch == null ? [] : [1]
    content {
      protected_branches     = false
      custom_branch_policies = true
    }
  }
}

resource "github_repository_environment_deployment_policy" "this" {
  for_each = { for k, v in local.environments : k => v if v.branch != null }

  repository     = github_repository.this.name
  environment    = github_repository_environment.this[each.key].environment
  branch_pattern = each.value.branch
}

locals {
  # preview は staging のトークンを使う
  token_for_environment = { production = "production", staging = "staging", preview = "staging" }

  # D1 を持たないツール（ポータルなど）は変数を作らない
  d1_variables = merge([
    for env, e in local.environments : {
      for name, m in module.tool : "${env}/D1_${upper(name)}_ID" => {
        env   = env
        name  = "D1_${upper(name)}_ID"
        value = one(values(m.d1_ids[e.d1]))
      } if length(local.tools[name].d1) > 0
    }
  ]...)

  # WORKER_SUFFIX: production は空文字。GitHub の variable は空値を持てないので作らない
  # （workflow では未定義の `vars.WORKER_SUFFIX` は空文字として展開される）。
  plain_variables = merge([
    for env, e in local.environments : merge(
      {
        "${env}/RIMLTOOLS_ENV" = { env = env, name = "RIMLTOOLS_ENV", value = env }
        "${env}/BASE_DOMAIN"   = { env = env, name = "BASE_DOMAIN", value = local.domain }
        "${env}/CF_ZONE_ID"    = { env = env, name = "CF_ZONE_ID", value = data.cloudflare_zone.this.id }
      },
      e.suffix == "" ? {} : {
        "${env}/WORKER_SUFFIX" = { env = env, name = "WORKER_SUFFIX", value = e.suffix }
      },
    )
  ]...)
}

check "one_d1_per_tool" {
  assert {
    condition     = alltrue([for t in local.tools : length(t.d1) <= 1])
    error_message = "D1_<TOOL>_ID assumes at most one D1 database per tool. Extend the variable naming before adding a second one."
  }
}

resource "github_actions_environment_secret" "cloudflare_api_token" {
  for_each = local.environments

  repository  = github_repository.this.name
  environment = github_repository_environment.this[each.key].environment
  secret_name = "CLOUDFLARE_API_TOKEN"
  value       = cloudflare_account_token.ci[local.token_for_environment[each.key]].value
}

resource "github_actions_environment_secret" "cloudflare_account_id" {
  for_each = local.environments

  repository  = github_repository.this.name
  environment = github_repository_environment.this[each.key].environment
  secret_name = "CLOUDFLARE_ACCOUNT_ID"
  value       = var.cloudflare_account_id
}

resource "github_actions_environment_variable" "this" {
  for_each = merge(local.plain_variables, local.d1_variables)

  repository    = github_repository.this.name
  environment   = github_repository_environment.this[each.value.env].environment
  variable_name = each.value.name
  value         = each.value.value
}
