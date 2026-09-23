# Grafana Cloud のスタック。サインアップ時に作られたスタックを使う場合（create_stack = false）は
# data source で参照するだけにし、Terraform からは消せないようにする。

resource "grafana_cloud_stack" "this" {
  count    = var.create_stack ? 1 : 0
  provider = grafana.cloud

  name              = "${var.stack_slug}.grafana.net"
  slug              = var.stack_slug
  region_slug       = var.stack_region
  description       = "RimlTools observability (ADR-0008)"
  delete_protection = true
}

data "grafana_cloud_stack" "this" {
  count    = var.create_stack ? 0 : 1
  provider = grafana.cloud
  slug     = var.stack_slug
}

locals {
  # resource と data source は型が違うので、使う属性だけを同じ形に揃える
  stack = one(concat(
    [for s in grafana_cloud_stack.this : {
      id                 = s.id
      slug               = s.slug
      url                = s.url
      region_slug        = s.region_slug
      otlp_url           = s.otlp_url
      prometheus_url     = s.prometheus_url
      prometheus_user_id = s.prometheus_user_id
      logs_url           = s.logs_url
      logs_user_id       = s.logs_user_id
      traces_url         = s.traces_url
      traces_user_id     = s.traces_user_id
    }],
    [for s in data.grafana_cloud_stack.this : {
      id                 = s.id
      slug               = s.slug
      url                = s.url
      region_slug        = s.region_slug
      otlp_url           = s.otlp_url
      prometheus_url     = s.prometheus_url
      prometheus_user_id = s.prometheus_user_id
      logs_url           = s.logs_url
      logs_user_id       = s.logs_user_id
      traces_url         = s.traces_url
      traces_user_id     = s.traces_user_id
    }],
  ))
}

# スタック内の Grafana を操作する service account（Terraform 専用）
resource "grafana_cloud_stack_service_account" "terraform" {
  provider   = grafana.cloud
  stack_slug = local.stack.slug
  name       = "rimltools-terraform"
  role       = "Admin"
}

resource "grafana_cloud_stack_service_account_token" "terraform" {
  provider           = grafana.cloud
  stack_slug         = local.stack.slug
  name               = "rimltools-terraform"
  service_account_id = grafana_cloud_stack_service_account.terraform.id
}
