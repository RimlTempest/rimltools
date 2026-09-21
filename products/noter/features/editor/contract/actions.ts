/**
 * エディタ画面から呼ぶ文書の操作。
 *
 * 実体は `@noter/documents/ui/wiring` の `documentActions(id)`。画面は
 * この型でだけ受け取るので、テストでは素のオブジェクトを渡せる（関数DI）。
 * plan 004 の暫定画面が持っていた口をそのまま引き継いでいる。
 */
import type { Result } from '@noter/contract'
import type { DocumentError } from '@noter/documents/contract'

export type DocumentActions = {
  readonly rename: (title: string) => Promise<Result<string, DocumentError>>
  readonly remove: () => Promise<Result<void, DocumentError>>
  readonly leave: () => Promise<Result<void, DocumentError>>
}
