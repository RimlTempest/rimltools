locals {
  registry = jsondecode(file("${path.module}/../../tools.json"))
  domain   = local.registry.domain

  # tools.json の各ツール。apex（ポータル）は Worker を起動しない静的配信なので、
  # RED・SLO・Faro の対象外にする（外形監視だけ行う）。
  tools = {
    for t in local.registry.tools : t.name => {
      name        = t.name
      apex        = try(t.apex, false)
      host        = try(t.apex, false) ? local.domain : "${t.subdomain}.${local.domain}"
      stagingHost = try(t.apex, false) ? "staging.${local.domain}" : "${t.subdomain}-staging.${local.domain}"
      legacyHosts = try(t.legacyHosts, [])
      workers     = [for w in t.services : w.name]
      slo         = t.slo
    }
  }

  worker_tools = { for name, t in local.tools : name => t if !t.apex }

  # 外形監視のホスト。上書きが "" のツールは監視しない（未公開）。
  synthetic_targets = {
    for name, t in local.tools : name => lookup(var.synthetic_host_overrides, name, t.host)
    if lookup(var.synthetic_host_overrides, name, t.host) != ""
  }

  # Grafana 側で固定する data source の UID（ops/dashboards/*.json が参照する）
  ds = {
    mimir = "rt-mimir"
    loki  = "rt-loki"
    tempo = "rt-tempo"
  }

  # SLO が recording rule を書き込む先。Grafana Cloud の既定の Prometheus data source。
  slo_destination_uid = "grafanacloud-prom"
}
