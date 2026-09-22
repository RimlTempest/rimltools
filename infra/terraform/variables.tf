variable "cloudflare_api_token" {
  description = "Bootstrap token for Terraform itself (see README). Never the CI deploy token."
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID."
  type        = string
}

variable "github_token" {
  description = "Fine-grained PAT for RimlTempest/rimltools (see README for scopes)."
  type        = string
  sensitive   = true
}

variable "github_owner" {
  description = "GitHub owner of the repository."
  type        = string
  default     = "RimlTempest"
}

variable "github_repository" {
  description = "Repository name."
  type        = string
  default     = "rimltools"
}

variable "staging_domains_enabled" {
  description = "Attach <tool>-staging.<domain> Custom Domains. Turn on after the first staging deploy."
  type        = bool
  default     = false
}

variable "pending_tools" {
  description = "Tools whose production host is not attached yet (no code deployed). Remove a name after its first production deploy."
  type        = list(string)
  default     = []
}

variable "legacy_hosts_mode" {
  description = <<-EOT
    How legacy hosts (qrcc.riml4i.com, ...) are served. Move one step per apply:
      attached  - still a Custom Domain of the production Worker (migration period)
      detached  - Custom Domain removed (Cloudflare deletes its DNS record)
      redirect  - proxied DNS record + 301 to <tool>.<domain>, path and query kept
    Going attached -> redirect in one apply fails: the Custom Domain's DNS record
    still exists when Terraform creates the replacement record.
  EOT
  type        = string
  default     = "attached"

  validation {
    condition     = contains(["attached", "detached", "redirect"], var.legacy_hosts_mode)
    error_message = "legacy_hosts_mode must be attached, detached or redirect."
  }
}

variable "access_emails" {
  description = "Emails allowed through Cloudflare Access on staging hosts. Empty disables Access."
  type        = list(string)
  default     = []
}

variable "manage_zone_security_settings" {
  description = "Manage zone-wide TLS settings (always HTTPS, TLS 1.2+, HSTS). They affect every host in the zone."
  type        = bool
  default     = true
}

variable "hsts_max_age" {
  description = "HSTS max-age in seconds. includeSubDomains / preload stay off because other hosts share the zone."
  type        = number
  default     = 15552000
}

variable "ci_token_permission_groups" {
  description = "API permission group names for the CI deploy tokens (names as returned by the permission groups API)."
  type        = list(string)
  default = [
    "Workers Scripts Write",
    "D1 Write",
    "Account Analytics Read",
    "Workers Tail Read",
    # 段階リリースの判定（PR #7）が Observability API を使う。読み取りでも Write を要求される
    "Workers Observability Write",
  ]
}

variable "ci_token_zone_permission_groups" {
  description = "Zone-scoped API permission group names for the CI deploy tokens (limited to the tools zone)."
  type        = list(string)
  default = [
    # 段階リリースが Custom Domain / route の配信先を確認する（PR #7）
    "Workers Routes Read",
  ]
}


variable "auth_rate_limit_per_10s" {
  description = "Requests per 10 s per IP (and colo) allowed to auth endpoints before a 10 s block. Free plan: 1 rule, IP only, 10 s period and timeout."
  type        = number
  default     = 20
}

variable "ops_issues_enabled" {
  description = "Let the ops workflows (SLO, synthetic, free-tier budget) open and update Issues (repo variable OPS_ISSUES)."
  type        = bool
  default     = false
}

variable "ops_token_permission_groups" {
  description = "API permission group names for the ops (analytics) token."
  type        = list(string)
  default     = ["Account Analytics Read"]
}

variable "release_environments" {
  description = "Environments whose secrets and variables are in place, so the deploy and flags workflows may run there (repo variable RELEASE_ENVIRONMENTS). Workflows skip any environment not listed."
  type        = list(string)
  default     = ["staging", "production"]

  validation {
    condition     = alltrue([for e in var.release_environments : contains(["staging", "production", "preview"], e)])
    error_message = "release_environments may only contain staging, production and preview."
  }
}

variable "google_oauth_staging_json" {
  description = "Google OAuth client for staging as JSON ({\"client_id\": \"...\", \"client_secret\": \"...\"}). Passed only to apply (production environment secret TF_APPLY_GOOGLE_OAUTH_STAGING). Empty leaves the Google keys out of APP_SECRETS."
  type        = string
  default     = ""
  sensitive   = true
}

variable "state_passphrase" {
  description = "Passphrase for OpenTofu state and plan encryption (PBKDF2 → AES-GCM). Comes from the SOPS-encrypted infra/secrets file (ADR-0009). Losing it makes the state unreadable."
  type        = string
  sensitive   = true
  ephemeral   = true

  validation {
    condition     = length(var.state_passphrase) >= 32
    error_message = "state_passphrase must be at least 32 characters (generate with: openssl rand -base64 48)."
  }
}
