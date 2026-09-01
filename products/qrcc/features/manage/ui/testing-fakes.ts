/**
 * 画面テスト用のフェイク。**テストからのみ import する。**
 *
 * `ManageApi` は関数の集まりなので、モックライブラリを使わずに
 * 素のオブジェクトで差し替えられる。ここに置いてあるのは、
 * 一覧・詳細・共有の 3 画面が同じフェイクを使い回すため。
 */
import type { CodeId, FolderId, Result, ShareToken } from '@qrcc/contract'
import {
  err,
  newCodeId,
  newFolderId,
  ok,
  parseCodeId,
  parseHexColor,
  parseHttpUrl,
  parseNonEmptyText,
  parseUserId,
} from '@qrcc/contract'
import type {
  CodePayload,
  RenderRequest,
  RenderResponse,
  RenderStyle,
  RenderWarning,
} from '@qrcc/generate/contract'
import type { RenderFailure, RenderFn } from '@qrcc/generate/ui'
import type {
  CodeDetail,
  CodeDraft,
  CodePage,
  CodeSummary,
  Folder,
  SavedCode,
  ShareLink,
} from '@qrcc/manage/contract'
import type { ManageApi, ManageFailure } from '@qrcc/manage/server'

/** フィクスチャは必ずパーサを通す（`as` を使わずに Branded 型を作る唯一の方法）。 */
export const expectOk = <T>(
  result: { readonly ok: true; readonly value: T } | { readonly ok: false },
): T => {
  if (!result.ok) throw new Error('fixture is invalid')
  return result.value
}

export const codeId = (suffix: string): CodeId =>
  expectOk(parseCodeId(`cd_0123456789abcdefghjkmn${suffix}`))

export const FIXTURE_STYLE: RenderStyle = {
  foreground: expectOk(parseHexColor('#000000')),
  background: { kind: 'solid', color: expectOk(parseHexColor('#ffffff')) },
  scale: 6,
  quiet_zone: null,
  module_shape: 'square',
  bar_height: 40,
  human_readable: true,
}

export const savedCode = (suffix: string, name: string): SavedCode => ({
  id: codeId(suffix),
  ownerId: expectOk(parseUserId('usr_0123456789abcdefghjkmnpq')),
  folderId: undefined,
  name: expectOk(parseNonEmptyText(name)),
  payload: { kind: 'url', url: expectOk(parseHttpUrl('https://qrcc.riml4i.com')) },
  symbology: { kind: 'qr', ec: 'M' },
  style: FIXTURE_STYLE,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-02T00:00:00.000Z'),
})

export const summaryOf = (code: SavedCode): CodeSummary => ({
  id: code.id,
  name: code.name,
  symbologyKind: code.symbology.kind,
  folderId: code.folderId,
  updatedAt: code.updatedAt,
})

export const folder = (name: string): Folder => ({
  id: expectOk(newFolderId(() => new Uint8Array(15).fill(3))),
  name: expectOk(parseNonEmptyText(name)),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
})

type Recorded = { readonly method: string; readonly payload: unknown }

export type FakeApi = {
  readonly api: ManageApi
  readonly calls: Recorded[]
  /** 次の一覧要求で返すページを差し替える。 */
  setPage: (page: CodePage) => void
  setDetail: (detail: CodeDetail) => void
  failWith: (failure: ManageFailure) => void
}

const failure =
  (state: { current: ManageFailure | undefined }) =>
  <T>(value: T): Result<T, ManageFailure> =>
    state.current === undefined ? ok(value) : err(state.current)

/**
 * `ManageApi` のフェイク。呼び出しを記録し、その場で答えを返す。
 * ネットワークも Worker も D1 も要らない。
 */
export const makeFakeApi = (initial: {
  readonly page?: CodePage
  readonly detail?: CodeDetail
  readonly folders?: readonly Folder[]
  readonly shares?: readonly ShareLink[]
}): FakeApi => {
  const calls: Recorded[] = []
  const state: { current: ManageFailure | undefined } = { current: undefined }
  const answer = failure(state)

  let page: CodePage = initial.page ?? { items: [], nextCursor: undefined }
  let detail: CodeDetail = initial.detail ?? {
    code: savedCode('pq', '在庫ラベル'),
    shares: initial.shares ?? [],
  }

  const record = (method: string, payload: unknown) => calls.push({ method, payload })

  const api: ManageApi = {
    listCodes: async (request) => {
      record('codes.list', request)
      return answer(page)
    },
    getCode: async (id) => {
      record('codes.get', id)
      return answer(detail)
    },
    createCode: async (draft: CodeDraft, idempotencyKey) => {
      record('codes.create', { draft, idempotencyKey })
      return answer(undefined)
    },
    updateCode: async (draft) => {
      record('codes.update', draft)
      return answer(undefined)
    },
    deleteCode: async (id: CodeId) => {
      record('codes.delete', id)
      return answer(undefined)
    },
    listFolders: async () => {
      record('folders.list', undefined)
      return answer(initial.folders ?? [])
    },
    createFolder: async (draft, idempotencyKey) => {
      record('folders.create', { draft, idempotencyKey })
      return answer(undefined)
    },
    deleteFolder: async (id: FolderId) => {
      record('folders.delete', id)
      return answer(undefined)
    },
    createShare: async (draft, idempotencyKey) => {
      record('shares.create', { draft, idempotencyKey })
      return answer({
        token: draft.token,
        codeId: draft.codeId,
        permission: draft.permission,
        expiresAt: draft.expiresAt,
        createdAt: new Date('2026-09-02T00:00:00.000Z'),
        revokedAt: undefined,
      })
    },
    revokeShare: async (token: ShareToken) => {
      record('shares.revoke', token)
      return answer(undefined)
    },
    resolveShare: async (token) => {
      record('shares.resolve', token)
      return answer({ permission: 'view', code: detail.code })
    },
  }

  return {
    api,
    calls,
    setPage: (next) => {
      page = next
    },
    setDetail: (next) => {
      detail = next
    },
    failWith: (next) => {
      state.current = next
    },
  }
}

/** 決まった値しか返さない ID 発行。テストで結果が動かないようにする。 */
export const fixedNewCodeId = () => newCodeId(() => new Uint8Array(15).fill(9))
export const fixedNewFolderId = () => newFolderId(() => new Uint8Array(15).fill(5))

/**
 * 生成エンジンのフェイク。
 *
 * 本物は wasm なので、画面テストでは呼ばない。ここでは「何を頼まれたか」を
 * 記録し、頼まれた内容から説明文を組み立てて返すだけにする
 * （プレビューが**更新されたこと**をテストから見分けられるように）。
 */
export type FakeRenderer = {
  readonly render: RenderFn
  readonly requests: RenderRequest[]
  /** 次の生成から警告を付ける。 */
  setWarnings: (warnings: readonly RenderWarning[]) => void
  /** 次の生成から失敗させる。 */
  failWith: (failure: RenderFailure) => void
}

const describePayload = (payload: CodePayload): string => {
  switch (payload.kind) {
    case 'url':
      return `URL: ${payload.url}`
    case 'text':
      return `テキスト: ${payload.text}`
    case 'wifi':
      return `Wi-Fi: ${payload.ssid}`
  }
}

export const makeFakeRenderer = (): FakeRenderer => {
  const requests: RenderRequest[] = []
  const state: {
    warnings: readonly RenderWarning[]
    failure: RenderFailure | undefined
  } = { warnings: [], failure: undefined }

  const render: RenderFn = async (request) => {
    requests.push(request)
    if (state.failure !== undefined) return err(state.failure)
    const response: RenderResponse = {
      body: '<svg role="img" aria-label="コード"><rect width="10" height="10" /></svg>',
      content_type: 'image/svg+xml',
      width: 21 * request.style.scale,
      height: 21 * request.style.scale,
      description: describePayload(request.payload),
      warnings: state.warnings,
    }
    return ok(response)
  }

  return {
    render,
    requests,
    setWarnings: (warnings) => {
      state.warnings = warnings
    },
    failWith: (next) => {
      state.failure = next
    },
  }
}
