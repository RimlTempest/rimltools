# @rimltools/telemetry

Workers（Free プラン）向けの軽量な OTLP/JSON 送信と、ブラウザ向けの Grafana Faro の薄いラッパ。
仕様・設定・相関の約束は [`docs/ops/telemetry.md`](../../docs/ops/telemetry.md)。

| サブパス                       | 用途                                                                      |
| ------------------------------ | ------------------------------------------------------------------------- |
| `@rimltools/telemetry/worker`  | `instrument()`・`traced()`・`withSpan()`・`log()`・`currentTraceparent()` |
| `@rimltools/telemetry/browser` | `startFromDocument()`（Faro を遅延読み込み）                              |
| `@rimltools/telemetry/core`    | 純関数（traceparent・サンプリング・OTLP 変換・設定）                      |

```ts
// Worker のエントリ
export default {
  fetch: instrument<CloudflareEnv>(async (request) => handler(request), {
    serviceName: 'qrcc-web',
  }),
}

// service binding
const api = traced('qrcc-api', (request) => env.API.fetch(request))
```

計測: `bun packages/telemetry/bench.ts`
