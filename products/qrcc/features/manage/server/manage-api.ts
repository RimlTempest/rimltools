/**
 * qrcc-api の `codes.*` / `folders.*` / `shares.*` を型の付いた関数にする層。
 *
 * **呼び出しの口（`call`）は引数で受け取る。** 実体はブラウザ側では
 * server function、サーバ側では service binding のクライアントで、
 * この層はどちらも知らない。おかげでテストでは素の関数を渡せる。
 *
 * ここが「境界の内側」と「外側」の変換点でもある:
 * 送るときはワイヤ形式に、受けるときは必ずパーサを通してから返す。
 * 検証していない値を画面に渡さない。
 */
import type { CodeId, CommonRpcError, FolderId, Result, ShareToken } from '@qrcc/contract'
import { err, ok } from '@qrcc/contract'
import type {
  CodeDetail,
  CodeDraft,
  CodeListRequest,
  CodePage,
  Folder,
  FolderDraft,
  ShareDraft,
  ShareLink,
  SharePreview,
} from '@qrcc/manage/contract'
import {
  decodeCodeDetail,
  decodeCodePage,
  decodeFolderList,
  decodeShareLink,
  decodeSharePreview,
  toCodeDraftWire,
  toCodeListWire,
  toFolderDraftWire,
  toShareDraftWire,
} from '@qrcc/manage/contract'

/** 応答の検証。境界を越える値は必ずこれを通す。 */
type ValueDecoder<T> = (value: unknown) => Result<T, { readonly detail: string }>

/** 呼び出しそのものが成立しなかった理由。業務上の失敗とは別物。 */
export type ManageTransportError = { readonly kind: string; readonly detail?: string | undefined }

export type ManageCallOptions = {
  /** 作成系の二重実行を防ぐ鍵。 */
  readonly idempotencyKey?: string
}

/**
 * RPC の口。利用側で定義する（ISP）ので、`apps/web` の実装型を import しない。
 *
 * 戻り値の外側は「意味のある返事が届いたか」、内側は「その返事が成功か」。
 * この入れ子は docs/api-contract.md の封筒と 1:1 で対応する。
 */
export type ManageCall = (
  method: string,
  body: unknown,
  options?: ManageCallOptions,
) => Promise<Result<Result<unknown, CommonRpcError>, ManageTransportError>>

export type ManageFailure =
  | { readonly kind: 'sign_in_required' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'not_found'; readonly resource: string }
  | {
      readonly kind: 'limit_exceeded'
      readonly limit: string
      readonly max: number
      readonly actual: number
    }
  | { readonly kind: 'unavailable'; readonly detail: string }

const RESOURCE_LABEL: Record<string, string> = {
  code: 'コード',
  folder: 'フォルダ',
  share: '共有リンク',
  cursor: 'このページ',
}

/** 失敗の理由を画面の文言にする。`kind` に UI 文言を混ぜないための変換点。 */
export const describeManageFailure = (failure: ManageFailure): string => {
  switch (failure.kind) {
    case 'sign_in_required':
      return '保存したコードを扱うにはサインインが必要です。サインインしてからもう一度お試しください。'
    case 'forbidden':
      return 'この操作は許可されていません。共有リンクの権限を確かめてください。'
    case 'not_found':
      return `${RESOURCE_LABEL[failure.resource] ?? failure.resource}が見つかりませんでした。すでに削除されているか、別の人のものです。`
    case 'limit_exceeded':
      return `入力が長すぎます（${failure.actual} 文字）。${failure.max} 文字までにしてください。`
    case 'unavailable':
      return `通信できませんでした（${failure.detail}）。しばらく待ってからもう一度お試しください。`
  }
}

const toFailure = (error: CommonRpcError): ManageFailure => {
  switch (error.kind) {
    case 'unauthorized':
      return { kind: 'sign_in_required' }
    case 'forbidden':
      return { kind: 'forbidden' }
    case 'not_found':
      return { kind: 'not_found', resource: error.resource }
    case 'limit_exceeded':
      return { kind: 'limit_exceeded', limit: error.limit, max: error.max, actual: error.actual }
    case 'internal':
      return { kind: 'unavailable', detail: 'internal' }
  }
}

export type ManageApi = {
  readonly listCodes: (request: CodeListRequest) => Promise<Result<CodePage, ManageFailure>>
  readonly getCode: (id: CodeId) => Promise<Result<CodeDetail, ManageFailure>>
  readonly createCode: (
    draft: CodeDraft,
    idempotencyKey?: string,
  ) => Promise<Result<void, ManageFailure>>
  readonly updateCode: (draft: CodeDraft) => Promise<Result<void, ManageFailure>>
  readonly deleteCode: (id: CodeId) => Promise<Result<void, ManageFailure>>
  readonly listFolders: () => Promise<Result<readonly Folder[], ManageFailure>>
  readonly createFolder: (
    draft: FolderDraft,
    idempotencyKey?: string,
  ) => Promise<Result<void, ManageFailure>>
  /** 改名。`FolderDraft` をそのまま送るので、名前は必ず検証済みの値になる。 */
  readonly updateFolder: (draft: FolderDraft) => Promise<Result<void, ManageFailure>>
  /** フォルダだけを消す。中のコードは残る（D1 の ON DELETE SET NULL）。 */
  readonly deleteFolder: (id: FolderId) => Promise<Result<void, ManageFailure>>
  readonly createShare: (
    draft: ShareDraft,
    idempotencyKey?: string,
  ) => Promise<Result<ShareLink, ManageFailure>>
  readonly revokeShare: (token: ShareToken) => Promise<Result<void, ManageFailure>>
  readonly resolveShare: (token: ShareToken) => Promise<Result<SharePreview, ManageFailure>>
}

type ManageApiDeps = {
  readonly call: ManageCall
}

/** 応答の中身を見ない呼び出し（削除など）。成功したことだけを確かめる。 */
const acknowledged: ValueDecoder<void> = () => ok(undefined)

/** `exactOptionalPropertyTypes` なので、鍵がないときはキーごと落とす。 */
const withKey = (idempotencyKey: string | undefined): ManageCallOptions =>
  idempotencyKey === undefined ? {} : { idempotencyKey }

export const makeManageApi = (deps: ManageApiDeps): ManageApi => {
  const request = async <T>(
    method: string,
    body: unknown,
    decode: ValueDecoder<T>,
    options?: ManageCallOptions,
  ): Promise<Result<T, ManageFailure>> => {
    const outcome = await deps.call(method, body, options)
    if (!outcome.ok) {
      return err({ kind: 'unavailable', detail: outcome.error.detail ?? outcome.error.kind })
    }
    if (!outcome.value.ok) return err(toFailure(outcome.value.error))

    const decoded = decode(outcome.value.value)
    return decoded.ok
      ? ok(decoded.value)
      : err({ kind: 'unavailable', detail: decoded.error.detail })
  }

  return {
    listCodes: (list) => request('codes.list', toCodeListWire(list), decodeCodePage),
    getCode: (id) => request('codes.get', { id }, decodeCodeDetail),
    createCode: (draft, idempotencyKey) =>
      request('codes.create', toCodeDraftWire(draft), acknowledged, withKey(idempotencyKey)),
    updateCode: (draft) => request('codes.update', toCodeDraftWire(draft), acknowledged),
    deleteCode: (id) => request('codes.delete', { id }, acknowledged),
    listFolders: () => request('folders.list', {}, decodeFolderList),
    createFolder: (draft, idempotencyKey) =>
      request('folders.create', toFolderDraftWire(draft), acknowledged, withKey(idempotencyKey)),
    updateFolder: (draft) => request('folders.update', toFolderDraftWire(draft), acknowledged),
    deleteFolder: (id) => request('folders.delete', { id }, acknowledged),
    createShare: (draft, idempotencyKey) =>
      request('shares.create', toShareDraftWire(draft), decodeShareLink, withKey(idempotencyKey)),
    revokeShare: (token) => request('shares.revoke', { token }, acknowledged),
    resolveShare: (token) => request('shares.resolve', { token }, decodeSharePreview),
  }
}
