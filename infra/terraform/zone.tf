# ゾーン（riml4i.com）全体に効く設定。zone の entry point ruleset は phase ごとに 1 つしか
# 作れないので、既存のもの（ダッシュボードで作ったもの）は imports.tf が取り込む。
# 取り込んだ ruleset のルールはここの定義で置き換わる。初回 plan で消えるルールを必ず確認する。

locals {
  hosts_in = "http.host in {${local.rimltools_hosts_expr}}"
}

# --- version affinity (ADR-0003) -------------------------------------------------
# 段階リリース中、同じ利用者を同じ Worker の版に固定する。後のルールが前のルールを
# 上書きするので、cookie `rt_vk` があればそれ、無ければ接続元 IP がキーになる。

resource "cloudflare_ruleset" "version_affinity" {
  zone_id     = data.cloudflare_zone.this.id
  name        = "rimltools: request header transforms"
  description = "Cloudflare-Workers-Version-Key for gradual deployments (ADR-0003)"
  kind        = "zone"
  phase       = "http_request_late_transform"

  rules = [
    {
      ref         = "version_key_from_ip"
      description = "Version affinity: default to the client IP"
      expression  = local.hosts_in
      action      = "rewrite"
      action_parameters = {
        headers = {
          "Cloudflare-Workers-Version-Key" = {
            operation  = "set"
            expression = "to_string(ip.src)"
          }
        }
      }
    },
    {
      ref         = "version_key_from_cookie"
      description = "Version affinity: prefer the anonymous id cookie rt_vk"
      expression  = "(${local.hosts_in}) and http.cookie contains \"rt_vk=\""
      action      = "rewrite"
      action_parameters = {
        headers = {
          "Cloudflare-Workers-Version-Key" = {
            operation  = "set"
            expression = "http.request.cookies[\"rt_vk\"][0]"
          }
        }
      }
    },
  ]
}

# --- WAF ------------------------------------------------------------------------

# Free プランで使えるマネージドルールは Cloudflare Free Managed Ruleset のみ。
resource "cloudflare_ruleset" "waf_managed" {
  zone_id     = data.cloudflare_zone.this.id
  name        = "rimltools: managed WAF"
  description = "Cloudflare Free Managed Ruleset"
  kind        = "zone"
  phase       = "http_request_firewall_managed"

  rules = [{
    ref         = "execute_free_managed_ruleset"
    description = "Execute Cloudflare Free Managed Ruleset"
    expression  = "true"
    action      = "execute"
    action_parameters = {
      id = "77454fe2d30c4220b5701f6fdfb893ba"
    }
  }]
}

# Free プランの custom rules は 5 本まで。RimlTools のホストだけに効かせる。
resource "cloudflare_ruleset" "waf_custom" {
  zone_id     = data.cloudflare_zone.this.id
  name        = "rimltools: custom WAF"
  description = "Block paths that only scanners ask for"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules = [{
    ref         = "block_scanner_paths"
    description = "RimlTools serves no PHP, WordPress or dotfiles"
    expression = join(" ", [
      "(${local.hosts_in}) and (",
      "starts_with(http.request.uri.path, \"/wp-\")",
      "or http.request.uri.path contains \"/.env\"",
      "or http.request.uri.path contains \"/.git/\"",
      "or ends_with(http.request.uri.path, \".php\")",
      ")",
    ])
    action = "block"
  }]
}

# Free プラン: 1 本、式に使えるのは path（と verified bot）だけ、IP 単位、10 秒。
# host で絞れないので、ツールの認証 API（Better Auth の既定パス）に限定する。
resource "cloudflare_ruleset" "rate_limit" {
  zone_id     = data.cloudflare_zone.this.id
  name        = "rimltools: rate limiting"
  description = "Slow down credential stuffing on auth endpoints"
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = [{
    ref         = "auth_endpoints"
    description = "Auth endpoints: ${var.auth_rate_limit_per_10s} req / 10 s / IP"
    expression  = "starts_with(http.request.uri.path, \"/api/auth/\")"
    action      = "block"
    ratelimit = {
      characteristics     = ["cf.colo.id", "ip.src"]
      period              = 10
      requests_per_period = var.auth_rate_limit_per_10s
      mitigation_timeout  = 10
    }
  }]
}

# --- TLS ------------------------------------------------------------------------
# ゾーン内のほかのホストにも効くため、HSTS の includeSubDomains / preload は付けない。

resource "cloudflare_zone_setting" "always_use_https" {
  count      = var.manage_zone_security_settings ? 1 : 0
  zone_id    = data.cloudflare_zone.this.id
  setting_id = "always_use_https"
  value      = "on"
}

resource "cloudflare_zone_setting" "min_tls_version" {
  count      = var.manage_zone_security_settings ? 1 : 0
  zone_id    = data.cloudflare_zone.this.id
  setting_id = "min_tls_version"
  value      = "1.2"
}

resource "cloudflare_zone_setting" "security_header" {
  count      = var.manage_zone_security_settings ? 1 : 0
  zone_id    = data.cloudflare_zone.this.id
  setting_id = "security_header"
  value = {
    strict_transport_security = {
      enabled            = true
      include_subdomains = false
      max_age            = var.hsts_max_age
      nosniff            = true
      preload            = false
    }
  }
}
