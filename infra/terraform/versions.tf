terraform {
  required_version = ">= 1.12.0"

  # state は自前の http backend（infra/tfstate の Worker、D1 に保存）に置く（ADR-0009）。
  # 資格情報は環境変数 TF_HTTP_USERNAME / TF_HTTP_PASSWORD（SOPS の infra/secrets から。README）。
  # plan は読み取り専用の資格情報で -lock=false、apply は書き込み用の資格情報でロックを取る。
  backend "http" {
    address        = "https://tfstate.tools.riml4i.com/states/rimltools-production"
    lock_address   = "https://tfstate.tools.riml4i.com/states/rimltools-production"
    unlock_address = "https://tfstate.tools.riml4i.com/states/rimltools-production"
    lock_method    = "LOCK"
    unlock_method  = "UNLOCK"
  }

  # state と plan は backend に送る前に手元で暗号化する（AES-GCM、鍵は PBKDF2 でパスフレーズから導出）。
  # backend（Worker と D1）は暗号文しか持たない。enforced で平文の書き出しを禁止する。
  # 既存の平文 state から移すときだけ、state / plan に fallback { method = method.unencrypted.migrate } が要る（README）。
  encryption {
    key_provider "pbkdf2" "state" {
      passphrase = var.state_passphrase
    }
    method "aes_gcm" "state" {
      keys = key_provider.pbkdf2.state
    }
    state {
      method   = method.aes_gcm.state
      enforced = true
    }
    plan {
      method   = method.aes_gcm.state
      enforced = true
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
    random = {
      source  = "hashicorp/random"
      version = "3.9.1"
    }
  }
}
