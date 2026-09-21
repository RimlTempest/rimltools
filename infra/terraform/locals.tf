locals {
  # tools.json は台帳の正本（ADR-0001）。ツールの追加はそちらに 1 件足すだけ。
  registry = jsondecode(file("${path.module}/../../tools.json"))
  domain   = local.registry.domain
  zone     = local.registry.zone
  tools    = { for t in local.registry.tools : t.name => t }

  legacy_hosts = merge([
    for name, t in local.tools : {
      for h in t.legacyHosts : h => "${t.subdomain}.${local.domain}"
    }
  ]...)

  tool_hosts      = [for m in module.tool : m.hosts.production]
  staging_hosts   = [for m in module.tool : m.hosts.staging]
  rimltools_hosts = concat([local.domain], local.tool_hosts, local.staging_hosts, keys(local.legacy_hosts))

  # Cloudflare Rules の式で使う host の集合: {"a" "b"}
  rimltools_hosts_expr = join(" ", [for h in local.rimltools_hosts : jsonencode(h)])

  environments = {
    production = { suffix = "", branch = "main", d1 = "production" }
    staging    = { suffix = "-staging", branch = "develop", d1 = "staging" }
    # PR ごとの preview は staging の Worker と D1 を使う
    preview = { suffix = "-staging", branch = null, d1 = "staging" }
  }
}
