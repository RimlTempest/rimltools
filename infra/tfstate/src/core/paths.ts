import { err, ok, type Result } from '@rimltools/contract'

/**
 * 受け付ける state の置き場所。これ以外は 404（一覧のエンドポイントも作らない）。
 * infra/terraform と infra/grafana の backend "http" の address と揃える。
 */
export const STATE_PATHS = [
  '/states/rimltools-production',
  '/states/rimltools-observability',
] as const

export type StatePath = (typeof STATE_PATHS)[number]

export const parseStatePath = (pathname: string): Result<StatePath, 'not-found'> => {
  const path = STATE_PATHS.find((p) => p === pathname)
  return path === undefined ? err('not-found') : ok(path)
}
