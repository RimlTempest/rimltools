# --- 資格情報（README §1。値は GitHub の secret から TF_VAR_* で渡す） ---------------------

variable "grafana_cloud_access_policy_token" {
  description = "Grafana Cloud の access policy token（ブートストラップ用）。plan は読み取り専用、apply は書き込み用を渡す。"
  type        = string
  sensitive   = true
}

variable "github_token" {
  description = "GitHub の fine-grained PAT（Secrets / Variables）。plan は読み取り専用、apply は書き込み用を渡す。"
  type        = string
  sensitive   = true
}

# --- スタック --------------------------------------------------------------------------

variable "create_stack" {
  description = "true ならスタックを作る。Grafana Cloud のサインアップ時に作られたスタックを使うなら false（参照だけ）。"
  type        = bool
  default     = false
}

variable "stack_slug" {
  description = "Grafana Cloud スタックの slug（https://<slug>.grafana.net）。"
  type        = string
  default     = "rimltools"
}

variable "stack_region" {
  description = "スタックのリージョン（create_stack = true のときだけ使う）。"
  type        = string
  default     = "prod-ap-northeast-0"
}

# --- GitHub ----------------------------------------------------------------------------

variable "github_owner" {
  description = "GitHub のオーナー。"
  type        = string
  default     = "RimlTempest"
}

variable "github_repository" {
  description = "GitHub のリポジトリ名。"
  type        = string
  default     = "rimltools"
}

variable "otlp_environments" {
  description = "Worker から OTLP を送る GitHub environment（infra/terraform が作る）。"
  type        = set(string)
  default     = ["production"]
}

variable "ops_environment" {
  description = "メトリクス転送（ops-metrics.yml）が使う GitHub environment（infra/terraform/ops.tf が作る）。"
  type        = string
  default     = "ops"
}

# --- 監視・アラート --------------------------------------------------------------------

variable "latency_p99_ms" {
  description = "ツールごとの wall time p99 の目標（ms）。SLO とアラートに使う。統合時に tools.json の slo.latencyP99Ms へ移す（docs/ops/grafana.md）。"
  type        = map(number)
  default = {
    qrcc  = 1500
    noter = 1500
  }
}

variable "metrics_push_enabled" {
  description = "ops-metrics.yml のメトリクス転送が動いているか。false の間は「転送が止まった」アラートを止めておく。"
  type        = bool
  default     = false
}

variable "synthetic_probe_names" {
  description = "Synthetic Monitoring の probe（公開 probe の名前）。"
  type        = list(string)
  default     = ["Tokyo"]
}

variable "synthetic_frequency_ms" {
  description = "Synthetic Monitoring のチェック間隔（ms）。"
  type        = number
  default     = 300000
}

variable "synthetic_host_overrides" {
  description = "ツールごとに監視するホストの上書き。移行中は旧ホスト、未公開のツールは空文字（監視しない）。"
  type        = map(string)
  default     = {}
}

variable "alert_emails" {
  description = "IRM を使わないとき（oncall_usernames が空）の通知先メールアドレス。"
  type        = list(string)
  default     = []
}

# --- IRM（OnCall） ----------------------------------------------------------------------

variable "oncall_usernames" {
  description = "オンコールのローテーションに入る Grafana のユーザー名（先頭から順に週替わり）。空なら IRM を作らずメール通知にする。"
  type        = list(string)
  default     = []
}

variable "oncall_timezone" {
  description = "オンコールのタイムゾーン。"
  type        = string
  default     = "Asia/Tokyo"
}

variable "oncall_rotation_start" {
  description = "ローテーションの起点（yyyy-MM-ddTHH:mm:ss、oncall_timezone の時刻）。"
  type        = string
  default     = "2026-09-21T09:00:00"
}

variable "oncall_slack_channel_id" {
  description = "IRM から通知する Slack チャンネル ID（任意。IRM に Slack を連携済みのとき）。"
  type        = string
  default     = ""
}

variable "state_passphrase" {
  description = "Passphrase for OpenTofu state and plan encryption (PBKDF2 → AES-GCM). Comes from the SOPS-encrypted infra/secrets file (ADR-0009). Losing it makes the state unreadable."
  type        = string
  sensitive   = true
  ephemeral   = true

  validation {
    condition     = length(var.state_passphrase) >= 32
    error_message = "state_passphrase must be at least 32 characters (generate with: openssl rand -base64 48)."
  }
}
