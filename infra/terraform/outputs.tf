output "hosts" {
  description = "Production hostnames per tool."
  value       = { for name, m in module.tool : name => m.hosts }
}

output "d1_ids" {
  description = "D1 IDs per tool and environment (not secret: they need an API token to use)."
  value       = { for name, m in module.tool : name => m.d1_ids }
}

output "zone_id" {
  description = "Zone ID of the parent zone."
  value       = data.cloudflare_zone.this.id
}
