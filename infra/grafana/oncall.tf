# オンコール（Grafana Cloud IRM、Free は 3 ユーザーまで）。
#
#   Grafana Alerting ─(contact point: IRM)→ IRM integration ─ route ─→ escalation chain
#                                                                         └ schedule（週替わりのローテーション）
#
# oncall_usernames が空の間は IRM を作らず、アラートは alert_emails にメールで送る。

locals {
  oncall_enabled = length(var.oncall_usernames) > 0
}

data "grafana_oncall_user" "members" {
  for_each = toset(var.oncall_usernames)
  username = each.value
}

resource "grafana_oncall_on_call_shift" "weekly" {
  count = local.oncall_enabled ? 1 : 0

  name       = "RimlTools 週替わり"
  type       = "rolling_users"
  start      = var.oncall_rotation_start
  duration   = 60 * 60 * 24 * 7
  frequency  = "weekly"
  interval   = 1
  week_start = "MO"
  time_zone  = var.oncall_timezone

  # 1 人ずつのグループを順番に回す（先頭から）
  rolling_users                  = [for name in var.oncall_usernames : [data.grafana_oncall_user.members[name].id]]
  start_rotation_from_user_index = 0
}

resource "grafana_oncall_schedule" "primary" {
  count = local.oncall_enabled ? 1 : 0

  name                 = "RimlTools"
  type                 = "calendar"
  time_zone            = var.oncall_timezone
  shifts               = [grafana_oncall_on_call_shift.weekly[0].id]
  enable_web_overrides = true

  dynamic "slack" {
    for_each = var.oncall_slack_channel_id == "" ? [] : [var.oncall_slack_channel_id]
    content {
      channel_id = slack.value
    }
  }
}

# warning: 当番に通知 → 30 分応答が無ければ important（音・電話など、各自の設定）で再通知
resource "grafana_oncall_escalation_chain" "default" {
  count = local.oncall_enabled ? 1 : 0
  name  = "rimltools-default"
}

# critical: 最初から important、10 分応答が無ければもう一度
resource "grafana_oncall_escalation_chain" "critical" {
  count = local.oncall_enabled ? 1 : 0
  name  = "rimltools-critical"
}

locals {
  escalation_steps = local.oncall_enabled ? {
    "default-0"  = { chain = "default", position = 0, type = "notify_on_call_from_schedule", important = false, duration = null }
    "default-1"  = { chain = "default", position = 1, type = "wait", important = false, duration = 1800 }
    "default-2"  = { chain = "default", position = 2, type = "notify_on_call_from_schedule", important = true, duration = null }
    "critical-0" = { chain = "critical", position = 0, type = "notify_on_call_from_schedule", important = true, duration = null }
    "critical-1" = { chain = "critical", position = 1, type = "wait", important = false, duration = 600 }
    "critical-2" = { chain = "critical", position = 2, type = "notify_on_call_from_schedule", important = true, duration = null }
  } : {}
}

resource "grafana_oncall_escalation" "steps" {
  for_each = local.escalation_steps

  escalation_chain_id = each.value.chain == "critical" ? grafana_oncall_escalation_chain.critical[0].id : grafana_oncall_escalation_chain.default[0].id
  position            = each.value.position
  type                = each.value.type
  important           = each.value.type == "wait" ? null : each.value.important
  duration            = each.value.duration
  notify_on_call_from_schedule = (
    each.value.type == "wait" ? null : grafana_oncall_schedule.primary[0].id
  )
}

resource "grafana_oncall_integration" "alerting" {
  count = local.oncall_enabled ? 1 : 0

  name = "RimlTools Grafana Alerting"
  type = "grafana_alerting"

  default_route {
    escalation_chain_id = grafana_oncall_escalation_chain.default[0].id
  }
}

resource "grafana_oncall_route" "critical" {
  count = local.oncall_enabled ? 1 : 0

  integration_id      = grafana_oncall_integration.alerting[0].id
  escalation_chain_id = grafana_oncall_escalation_chain.critical[0].id
  position            = 0
  routing_type        = "jinja2"
  routing_regex       = "{{ payload.commonLabels.severity == \"critical\" }}"
}

# --- Grafana Alerting 側の通知先 --------------------------------------------------------

resource "grafana_contact_point" "rimltools" {
  name = "rimltools"

  dynamic "oncall" {
    for_each = local.oncall_enabled ? [grafana_oncall_integration.alerting[0].link] : []
    content {
      url = oncall.value
    }
  }

  dynamic "email" {
    for_each = local.oncall_enabled || length(var.alert_emails) == 0 ? [] : [var.alert_emails]
    content {
      addresses    = email.value
      single_email = true
    }
  }

  lifecycle {
    precondition {
      condition     = local.oncall_enabled || length(var.alert_emails) > 0
      error_message = "Set oncall_usernames (IRM) or alert_emails so that alerts reach someone."
    }
  }
}

# notification policy はスタックに 1 つだけ（UI で作ったルートはこの定義で置き換わる）
resource "grafana_notification_policy" "root" {
  contact_point   = grafana_contact_point.rimltools.name
  group_by        = ["grafana_folder", "alertname", "tool"]
  group_wait      = "30s"
  group_interval  = "5m"
  repeat_interval = "12h"

  policy {
    contact_point   = grafana_contact_point.rimltools.name
    group_by        = ["grafana_folder", "alertname", "tool"]
    repeat_interval = "1h"
    matcher {
      label = "severity"
      match = "="
      value = "critical"
    }
  }
}
