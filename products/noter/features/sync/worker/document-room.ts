import { DurableObject } from 'cloudflare:workers'

/**
 * 1 文書 = 1 Room の Durable Object。
 *
 * **このリポジトリで `class` を書いてよい唯一のファイル**（ADR-0004）。
 * Durable Object は class でしか宣言できないため、ここは薄い殻に留め、
 * 実際のロジックは `features/sync/core` の純粋関数に委譲する（plan 002）。
 */
export class DocumentRoom extends DurableObject<CloudflareEnv> {
  override fetch(): Response {
    return new Response('not implemented', { status: 501 })
  }
}
