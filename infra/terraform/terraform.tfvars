# 秘密でない切り替えだけをここに置く。変更は PR で plan を見てから main で apply される。
# 秘密（トークン）と個人情報（access_emails）は GitHub の secret / variable から TF_VAR_* で渡す。

# 初回の staging デプロイ（C レーン）が済んだら true にする。Custom Domain はコードのある Worker にしか付かない。
staging_domains_enabled = false

# products/portal の初回デプロイが済んだら true にする。
portal_domain_enabled = false

# 旧ホストの移行: attached → detached → redirect の順に 1 段ずつ（README「ドメイン移行」）。
legacy_hosts_mode = "attached"
