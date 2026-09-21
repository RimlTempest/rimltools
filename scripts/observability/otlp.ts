/**
 * OTLP/HTTP JSON（metrics）のペイロードを組み立てる。Grafana Cloud の OTLP gateway
 * （`<otlp_url>/v1/metrics`）に POST する。gauge だけを使う（ADR-0008）。
 */

import type { Sample } from './metrics.ts'

type AnyValue = { stringValue: string }
type KeyValue = { key: string; value: AnyValue }

type NumberDataPoint = { asDouble: number; timeUnixNano: string; attributes: KeyValue[] }

export type OtlpMetricsPayload = {
  resourceMetrics: {
    resource: { attributes: KeyValue[] }
    scopeMetrics: {
      scope: { name: string }
      metrics: { name: string; gauge: { dataPoints: NumberDataPoint[] } }[]
    }[]
  }[]
}

const attributes = (labels: Record<string, string>): KeyValue[] =>
  Object.entries(labels).map(([key, value]) => ({ key, value: { stringValue: value } }))

export const toOtlpMetrics = (
  samples: readonly Sample[],
  resource: Record<string, string>,
): OtlpMetricsPayload => {
  const byName = new Map<string, NumberDataPoint[]>()
  for (const sample of samples) {
    const points = byName.get(sample.name) ?? []
    points.push({
      asDouble: sample.value,
      // ms → ns。桁あふれを避けるため BigInt で文字列化する（OTLP/JSON は uint64 を文字列で持つ）
      timeUnixNano: (BigInt(sample.timestampMs) * 1_000_000n).toString(),
      attributes: attributes(sample.labels),
    })
    byName.set(sample.name, points)
  }
  return {
    resourceMetrics: [
      {
        resource: { attributes: attributes(resource) },
        scopeMetrics: [
          {
            scope: { name: 'rimltools/push-metrics' },
            metrics: [...byName].map(([name, dataPoints]) => ({ name, gauge: { dataPoints } })),
          },
        ],
      },
    ],
  }
}
