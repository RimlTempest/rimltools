/**
 * テレメトリの送信先として使ってよい URL か。
 *
 * 原則 https だけ（OTLP の Authorization ヘッダを平文で流さない）。例外はローカルの LGTM
 * （observability/local/compose.yaml）で、ループバックのホストに限って http を許す。
 * 前方一致ではなく URL として解釈し、`http://localhost.evil.test` のような名前はすり抜けない。
 */

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '[::1]'])

export const isAllowedCollectorUrl = (raw: string): boolean => {
  if (!URL.canParse(raw)) return false
  const url = new URL(raw)
  if (url.protocol === 'https:') return true
  return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)
}
