# 秘密でない既定値。資格情報は GitHub Actions が TF_VAR_* で渡す（README §3）。

stack_slug   = "rimltools"
create_stack = false

# 新ドメインへ切り替えるまでは旧ホストを監視する。ポータルは公開まで監視しない
# （infra/terraform の legacy_hosts_mode / pending_tools と揃える）。
synthetic_host_overrides = {
  qrcc   = "qrcc.riml4i.com"
  noter  = "noter.riml4i.com"
  portal = ""
}

# IRM を使うときは Grafana のユーザー名を入れる（Free は 3 人まで）。空ならメール通知。
oncall_usernames = []
