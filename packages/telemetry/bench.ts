/**
 * 計装のオーバーヘッド計測（docs/ops/telemetry.md §CPU 予算）。
 *   bun packages/telemetry/bench.ts
 * Bun（JavaScriptCore）での値なので Workers（V8）とは一致しないが、桁の確認に使う。
 */
/* oxlint-disable eslint/no-await-in-loop, eslint/no-console -- 逐次に測って標準出力に出すのが目的 */

import { instrument, withSpan, type WorkerDeps } from './src/worker/index.ts'

const N = 20_000
const ctx = { waitUntil: () => undefined }
const request = new Request('https://qrcc.test/generate', {
  headers: { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00' },
})
const response = new Response('ok')
const handler = async () => response

const deps = (random: number): WorkerDeps => ({
  fetch: async () => new Response(null),
  now: () => performance.now(),
  random: () => random,
  fillRandom: (bytes) => crypto.getRandomValues(bytes),
  print: () => undefined,
})
const env = {
  OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.test/otlp',
  OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Basic%20x',
}

const measure = async (name: string, run: () => Promise<unknown>) => {
  for (let i = 0; i < 2000; i += 1) await run()
  const start = performance.now()
  for (let i = 0; i < N; i += 1) await run()
  const perCall = (performance.now() - start) / N
  console.log(`${name.padEnd(40)} ${(perCall * 1000).toFixed(1)} µs/request`)
  return perCall
}

const base = await measure('baseline (handler only)', () => handler())
const noop = instrument(handler, { serviceName: 'x' }, deps(0.99))
const dropped = instrument(handler, { serviceName: 'x' }, deps(0.99))
const exported = instrument(
  async () => {
    await withSpan('d1 query', async () => 1)
    return response
  },
  { serviceName: 'x' },
  deps(0),
)
const a = await measure('no endpoint (no-op)', () => noop(request, {}, ctx))
const b = await measure('endpoint set, not sampled', () => dropped(request, env, ctx))
const c = await measure('sampled + 1 child span, exported', () => exported(request, env, ctx))
console.log(
  `overhead: no-op ${((a - base) * 1000).toFixed(1)} µs, dropped ${((b - base) * 1000).toFixed(1)} µs, exported ${((c - base) * 1000).toFixed(1)} µs`,
)
