locals {
  # tools.json は台帳の正本（ADR-0001）。ツールの追加はそちらに 1 件足すだけ。
  registry = jsondecode(file("${path.module}/../../tools.json"))
  domain   = local.registry.domain
  zone     = local.registry.zone
  tools    = { for t in local.registry.tools : t.name => t }

  # apex（ポータル）は RimlTools のドメインそのもの。ホスト名の規則は scripts/lib/tools.ts と同じ
  production_hosts = { for name, t in local.tools : name => try(t.apex, false) ? local.domain : "${t.subdomain}.${local.domain}" }

  legacy_hosts = merge([
    for name, t in local.tools : {
      for h in t.legacyHosts : h => local.production_hosts[name]
    }
  ]...)

  tool_hosts      = [for m in module.tool : m.hosts.production]
  rimltools_hosts = distinct(concat([local.domain], local.tool_hosts, keys(local.legacy_hosts)))

  # Cloudflare Rules の式で使う host の集合: {"a" "b"}
  rimltools_hosts_expr = join(" ", [for h in local.rimltools_hosts : jsonencode(h)])

  # staging / preview は 2026-09-23 に廃止した。検証は本番の段階リリースが担う（docs/release.md）
  environments = {
    production = { suffix = "", branch = "main", d1 = "production" }
  }

  # ops（SLO・synthetic・無料枠の監視）。cron は既定ブランチ（develop）で動く
  ops_environment = { name = "ops", branch = "develop" }
}
