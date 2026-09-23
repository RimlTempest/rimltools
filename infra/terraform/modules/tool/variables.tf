variable "account_id" {
  description = "Cloudflare account ID."
  type        = string
}

variable "zone_id" {
  description = "Zone ID of the parent zone (e.g. riml4i.com)."
  type        = string
}

variable "tool" {
  description = "One entry of tools.json .tools[] (decoded)."
  type = object({
    name        = string
    subdomain   = string
    apex        = optional(bool, false)
    legacyHosts = list(string)
    services = list(object({
      name = string
      role = string
    }))
    d1 = list(object({
      name = string
    }))
  })
}

variable "domain" {
  description = "Base domain of RimlTools (tools.json .domain), e.g. tools.riml4i.com."
  type        = string
}

variable "production_domain_enabled" {
  description = "Attach the production host to the public Worker. false until the tool's first production deploy (a Custom Domain needs a Worker with code)."
  type        = bool
  default     = true
}

variable "legacy_hosts_attached" {
  description = "Keep legacy hosts attached to the production Worker as Custom Domains (migration period)."
  type        = bool
}

