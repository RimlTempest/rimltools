/**
 * @qrcc/manage の RPC アダプタ。
 *
 * qrcc-api の `codes.*` / `folders.*` / `shares.*` を型の付いた関数にする層で、
 * 呼び出しの口は引数で受け取る。配線するのは `*.route.tsx`（composition root）
 * だけで、画面は `ManageApi` を受け取るだけ。
 */
export type {
  ManageApi,
  ManageCall,
  ManageCallOptions,
  ManageFailure,
  ManageTransportError,
} from './manage-api.ts'
export { describeManageFailure, makeManageApi } from './manage-api.ts'
export type { ManageMethod } from './manage-rpc.ts'
export {
  MANAGE_METHODS,
  PUBLIC_MANAGE_METHODS,
  decodeManageEnvelope,
  isManageMethod,
} from './manage-rpc.ts'
