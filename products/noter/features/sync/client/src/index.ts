/**
 * @noter/sync/client — ブラウザ側の同期アダプタ。
 *
 * 画面（`features/editor`）はここだけを使い、`y-websocket` を直接触らない。
 */
export type { DocumentProvider, ProviderDeps } from './provider.ts'
export { makeDocumentProvider } from './provider.ts'
export type { ProviderEvent } from './state-machine.ts'
export { INITIAL_STATE, nextState } from './state-machine.ts'
export { toWebSocketOrigin } from './url.ts'
