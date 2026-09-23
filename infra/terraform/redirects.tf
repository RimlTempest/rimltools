# 旧ホスト（qrcc.riml4i.com など）→ 新ホスト（qrcc.tools.riml4i.com）の 301。
# legacy_hosts_mode = "redirect" のときだけ作る（手順は README の「ドメイン移行」）。

resource "cloudflare_dns_record" "legacy" {
  for_each = var.legacy_hosts_mode == "redirect" ? local.legacy_hosts : {}

  zone_id = data.cloudflare_zone.this.id
  name    = each.key
  type    = "AAAA"
  content = "100::"
  proxied = true
  ttl     = 1
  comment = "rimltools: legacy host, 301 to ${each.value}"
}

resource "cloudflare_ruleset" "legacy_redirects" {
  count = var.legacy_hosts_mode == "redirect" && length(local.legacy_hosts) > 0 ? 1 : 0

  zone_id     = data.cloudflare_zone.this.id
  name        = "rimltools: legacy host redirects"
  description = "301 legacy tool hosts to <tool>.${local.domain}"
  kind        = "zone"
  phase       = "http_request_dynamic_redirect"

  rules = [
    for from, to in local.legacy_hosts : {
      ref         = "legacy_${replace(from, ".", "_")}"
      description = "${from} -> ${to}"
      expression  = "http.host eq \"${from}\""
      action      = "redirect"
      action_parameters = {
        from_value = {
          status_code           = 301
          preserve_query_string = true
          target_url = {
            expression = "concat(\"https://${to}\", http.request.uri.path)"
          }
        }
      }
    }
  ]
}
