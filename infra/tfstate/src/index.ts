/**
 * rimltools-tfstate: OpenTofu の http backend（docs/adr/0009-state-and-secrets.md）。
 * infra/terraform と infra/grafana の state を、OpenTofu が暗号化したまま D1 に置く。
 * このエントリは env を読んで依存を組み立てるだけ（composition root）。
 *
 * 計装（@rimltools/telemetry）: OTEL_EXPORTER_OTLP_ENDPOINT / _HEADERS（secret）があれば、
 * ログと trace を Grafana（Loki / Tempo）に送る。認証の失敗（tfstate_auth_failed）を
 * Grafana のアラートが数えるので、リクエストは全件送る（OTEL_TRACES_SAMPLER_ARG = 1。
 * plan / apply 1 回で数リクエストしか無い）。未設定なら何も送らない。
 */
import { instrument, log } from '@rimltools/telemetry/worker'

import { STATE_PATHS } from './core/paths.ts'
import { DEFAULT_RETENTION } from './core/retention.ts'
import { createD1Store } from './d1-store.ts'
import { handle } from './handler.ts'

type Env = {
  DB: D1Database
  READ_USER: string
  READ_PASSWORD: string
  WRITE_USER: string
  WRITE_PASSWORD: string
}

// CI が落ちてロックが残っても、1 時間で取り直せる（force-unlock も使える。README）
const LOCK_TTL_MS = 60 * 60 * 1000

export default {
  fetch: instrument<Env>(
    (request, env) =>
      handle(request, {
        store: createD1Store(env.DB),
        now: () => Date.now(),
        credentials: {
          read: { user: env.READ_USER, password: env.READ_PASSWORD },
          write: { user: env.WRITE_USER, password: env.WRITE_PASSWORD },
        },
        lockTtlMs: LOCK_TTL_MS,
        retention: DEFAULT_RETENTION,
        log: (entry) =>
          log(entry['event'] === 'tfstate' ? 'info' : 'warn', String(entry['event']), entry),
      }),
    {
      serviceName: 'rimltools-tfstate',
      // 許可リスト外のパス（探索）は 1 つの route にまとめ、系列を増やさない
      route: (url) =>
        STATE_PATHS.some((path) => path === url.pathname) ? url.pathname : '/(other)',
    },
  ),
} satisfies ExportedHandler<Env>
