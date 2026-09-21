terraform {
  required_version = ">= 1.10"

  # state は HCP Terraform Free の別 workspace（ADR-0008）。実行は GitHub Actions の runner
  # （local execution mode）。organization は環境変数 TF_CLOUD_ORGANIZATION で渡す。
  cloud {
    workspaces {
      name = "rimltools-observability"
    }
  }

  required_providers {
    grafana = {
      source  = "grafana/grafana"
      version = "4.46.0"
    }
    github = {
      source  = "integrations/github"
      version = "6.13.0"
    }
  }
}
