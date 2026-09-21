# ADR-0006: セキュリティ検査を CI の必須チェックにする

- 状態: 採用（2026-09-22）

## 決定

public リポジトリで無料になる GitHub の機能と、OSS の検査を組み合わせる。

| 領域 | 道具 | 失敗の扱い |
| --- | --- | --- |
| SAST | CodeQL（javascript-typescript / actions / rust） | high 以上で失敗 |
| secret | GitHub secret scanning + push protection、gitleaks（PR 差分）、lefthook | 検出で失敗 |
| 依存 | dependency-review（PR）、osv-scanner（bun.lock / Cargo.lock）、Dependabot | high 以上で失敗 |
| workflow | zizmor、actionlint、`uses:` の SHA 固定を検査 | 検出で失敗 |
| IaC | terraform fmt / validate、tflint、checkov | 検出で失敗 |
| 来歴 | attest-build-provenance（本番ビルド） | — |
| 定期 | OpenSSF Scorecard（週次）、全体の CodeQL / osv | Issue を起票 |

- trivy-action は 2026-03 にタグが改ざんされた事件があったため使わない。どの action も SHA 固定。
- workflow の既定 `permissions: {}`（何も無し）から、ジョブごとに必要なものだけ足す。
- `pull_request_target` は使わない。fork からの PR には secret を渡さない。
