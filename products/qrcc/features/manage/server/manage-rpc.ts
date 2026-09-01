/**
 * 画面 → server function → qrcc-api の橋渡しに使う定義。
 *
 * server function は**メソッド名を引数で受け取る**形にしてある。
 * 12 個の server function を並べる代わりに 1 つで済むが、その代わり
 * 「何でも転送できる踏み台」にならないよう、**許可制**にする。
 * 呼び出し元（`UserId`）は必ずサーバ側でセッションから決めるので、
 * 画面から成りすませる余地はない（ADR-0002）。
 */
import type { CommonRpcError, Result } from '@qrcc/contract'
import { decodeCommonRpcError, err, ok } from '@qrcc/contract'
import type { ActorWire } from '@qrcc/auth/contract'
import type { ManageTransportError } from './manage-api.ts'

/**
 * 画面を組み立てるのに要る、サーバでしか分からないこと。
 *
 * ルートの loader の戻り値になるので、**公開サブパスから import できる場所**に
 * 置く必要がある（`routeTree.gen.ts` が型に名前を付けられなくなるため）。
 */
export type ManageContext = {
  readonly actor: ActorWire
  /** 共有リンクの URL を組み立てるためのオリジン。 */
  readonly origin: string
}

/** 転送してよい RPC メソッド（docs/api-contract.md 2 節）。 */
export const MANAGE_METHODS = [
  'codes.list',
  'codes.get',
  'codes.create',
  'codes.update',
  'codes.delete',
  'folders.list',
  'folders.create',
  'folders.update',
  'folders.delete',
  'shares.create',
  'shares.revoke',
  'shares.resolve',
] as const

export type ManageMethod = (typeof MANAGE_METHODS)[number]

export const isManageMethod = (value: string): value is ManageMethod =>
  MANAGE_METHODS.some((method) => method === value)

/**
 * サインインしていなくても呼べるメソッド。
 * 共有リンクの解決は「リンクを知っていること」が鍵なので、所有者を要求しない。
 */
export const PUBLIC_MANAGE_METHODS: readonly ManageMethod[] = ['shares.resolve']

/**
 * server function の戻り値に載せられる形。
 *
 * `unknown` のままだと TanStack Start の直列化検査が通らない
 * （「送れない値かもしれない」と正しく指摘してくる）。JSON に載る形だと
 * 型で言い切るために、境界で 1 度だけ写し取る。
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

/** JSON に載らないもの（関数・undefined・symbol）は null に畳む。 */
export const toJsonValue = (value: unknown): JsonValue => {
  if (value === null) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (Array.isArray(value)) return value.map(toJsonValue)
  if (typeof value === 'object') {
    const copied: Record<string, JsonValue> = {}
    for (const [key, item] of Object.entries(value)) copied[key] = toJsonValue(item)
    return copied
  }
  return null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const broken = (detail: string): Result<never, ManageTransportError> =>
  err({ kind: 'malformed_envelope', detail })

/**
 * server function の戻り値を読む。
 *
 * server function の戻り値もネットワーク越しの値なので、無検証で型を付けない。
 * 外側は「意味のある返事が届いたか」、内側は「その返事が成功か」。
 */
export const decodeManageEnvelope = (
  value: unknown,
): Result<Result<unknown, CommonRpcError>, ManageTransportError> => {
  if (!isRecord(value) || typeof value['ok'] !== 'boolean') {
    return broken('expected { ok: boolean, value | error }')
  }

  if (!value['ok']) {
    const error = value['error']
    if (!isRecord(error) || typeof error['kind'] !== 'string') {
      return broken('a failed envelope must carry an error with a "kind"')
    }
    return err({
      kind: error['kind'],
      detail: typeof error['detail'] === 'string' ? error['detail'] : undefined,
    })
  }

  const inner = value['value']
  if (!isRecord(inner) || typeof inner['ok'] !== 'boolean') {
    return broken('expected an inner { ok: boolean, value | error }')
  }
  if (inner['ok']) {
    return 'value' in inner ? ok(ok(inner['value'])) : broken('a successful result needs "value"')
  }
  const decoded = decodeCommonRpcError(inner['error'])
  return decoded.ok ? ok(err(decoded.value)) : broken(decoded.error.detail)
}
