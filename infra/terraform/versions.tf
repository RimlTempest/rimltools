terraform {
  required_version = ">= 1.10"

  # state は HCP Terraform Free に置く（ADR-0005）。実行は GitHub Actions の runner（local
  # execution mode）なので、Cloudflare / GitHub のトークンは HCP には置かない。
  # organization は環境変数 TF_CLOUD_ORGANIZATION で渡す（README のブートストラップ参照）。
  cloud {
    workspaces {
      name = "rimltools-production"
    }
  }

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "5.25.0"
    }
    github = {
      source  = "integrations/github"
      version = "6.13.0"
    }
  }
}
