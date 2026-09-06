export { DocumentRoom } from '@noter/sync/worker'

/**
 * noter-sync は非公開の auxiliary Worker。`routes` も `workers_dev` も持たないので、
 * ここに来る HTTP リクエストは存在しない。DO へは noter-web の binding からのみ
 * 到達する（ADR-0002）。
 */
export default { fetch: (): Response => new Response('not found', { status: 404 }) }
