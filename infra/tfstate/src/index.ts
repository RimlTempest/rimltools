/**
 * rimltools-tfstate: OpenTofu の http backend（docs/adr/0009-state-and-secrets.md）。
 * infra/terraform と infra/grafana の state を、OpenTofu が暗号化したまま D1 に置く。
 * このエントリは env を読んで依存を組み立てるだけ（composition root）。
 */
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
  fetch: (request, env) =>
    handle(request, {
      store: createD1Store(env.DB),
      now: () => Date.now(),
      credentials: {
        read: { user: env.READ_USER, password: env.READ_PASSWORD },
        write: { user: env.WRITE_USER, password: env.WRITE_PASSWORD },
      },
      lockTtlMs: LOCK_TTL_MS,
      log: (entry) => console.log(JSON.stringify(entry)),
    }),
} satisfies ExportedHandler<Env>
