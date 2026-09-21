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

variable "portal_domain_enabled" {
  description = "Attach the portal Worker to the bare RimlTools domain. Turn on after the portal's first deploy."
  type        = bool
  default     = false
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
    "Workers Observability Read",
  ]
}


variable "auth_rate_limit_per_10s" {
  description = "Requests per 10 s per IP (and colo) allowed to auth endpoints before a 10 s block. Free plan: 1 rule, IP only, 10 s period and timeout."
  type        = number
  default     = 20
}
