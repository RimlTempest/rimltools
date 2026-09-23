output "hosts" {
  description = "Production and staging hostnames."
  value       = local.hosts
}

output "d1_ids" {
  description = "D1 database IDs per environment, keyed by the tools.json d1 name."
  value = {
    production = { for k, db in cloudflare_d1_database.production : split("/", k)[1] => db.id }
    staging    = { for k, db in cloudflare_d1_database.staging : split("/", k)[1] => db.id }
  }
}

output "worker_names" {
  description = "Worker names per environment."
  value = {
    production = [for w in cloudflare_worker.production : w.name]
    staging    = [for w in cloudflare_worker.staging : w.name]
  }
}
