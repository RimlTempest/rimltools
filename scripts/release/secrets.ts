/**
 * `wrangler versions upload --secrets-file` で、その版に載せる secret を決める（純関数）。
 *
 * - OTLP のヘッダ（`GRAFANA_OTLP_HEADERS`）: 送り先が入っている Worker にだけ
 * - アプリの secret（`APP_SECRETS`）は staging / preview の廃止で不要になった。渡されたら失敗させる
 *
 * `versions upload` は secrets-file に無い既存の secret を前の版から引き継ぐ（wrangler の
 * uploadWorkerVersion は常に keepSecrets: true）。本番の Worker が持つ secret は触らない。
 *
 * エラー文字列には secret の値を入れない（キー名と形だけ）。
 */

import type { Result } from '../lib/tools.ts'
import { needsOtlpSecret } from './rewrite.ts'

const OTLP_HEADERS = 'OTEL_EXPORTER_OTLP_HEADERS'

type Json = Record<string, unknown>

export const versionSecrets = (input: {
  tool: string
  /** 書き換え後の wrangler.json */
  config: Json
  otlpHeaders: string
  appSecretsJson: string
}): Result<Record<string, string>, string> => {
  const secrets: Record<string, string> = {}
  if (input.otlpHeaders !== '' && needsOtlpSecret(input.config)) {
    secrets[OTLP_HEADERS] = input.otlpHeaders
  }

  // staging / preview を廃止したので、APP_SECRETS を書く環境はもう無い。
  // 本番の Worker は自分の secret を持っていて、新しい版に引き継がれる（docs/release.md）
  if (input.appSecretsJson !== '') {
    return {
      ok: false,
      error: 'APP_SECRETS must not be set (the live Workers keep their own secrets)',
    }
  }
  return { ok: true, value: secrets }
}
