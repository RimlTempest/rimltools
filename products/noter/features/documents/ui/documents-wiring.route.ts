/**
 * 文書まわりの composition root。
 *
 * server function（サーバ側）とブラウザ側の操作（`HomeActions` /
 * `DocumentActions` / `ShareActions`）の配線がここに集まる。画面はこのファイルを
 * 知らず、操作を props で受け取るだけなのでルータ抜きでテストできる。
 *
 * `*.route.*` は feature に co-location された**アプリ側の配線**なので、
 * composition root（`apps/web/src/server/container.ts`）を直接使ってよい。
 * feature 本体（contract / core / server / 画面）はここを import しない。
 */
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import type { DocumentId, Result, Role, ShareToken, UserId } from '@noter/contract'
import {
  err,
  ok,
  parseDocumentId,
  parseDocumentKind,
  parseRole,
  parseShareToken,
  parseUserId,
} from '@noter/contract'
import type { ActorWire, ShareRole } from '@noter/auth/contract'
import { toActorWire } from '@noter/auth/contract'
import type {
  DocumentError,
  DocumentSummaryWire,
  DocumentWire,
  MemberSummaryWire,
  ShareLinkView,
  ShareLinkWire,
} from '@noter/documents/contract'
import {
  parseShareLinkWire,
  toDocumentSummaryWire,
  toDocumentWire,
  toMemberSummaryWire,
  toShareLinkWire,
} from '@noter/documents/contract'
import type { DocumentService } from '@noter/documents/server'
import type { Actor } from '@noter/auth/contract'
import { makeContainer } from '../../../apps/web/src/server/container.ts'

const NOT_FOUND: DocumentError = { kind: 'not_found' }
const UNAVAILABLE: DocumentError = {
  kind: 'storage_unavailable',
  detail: 'D1 が設定されていない',
}

/** いまのリクエストから「誰が」と「何を使えるか」を 1 回だけ組み立てる。 */
const withService = async (): Promise<
  Result<{ readonly actor: Actor; readonly documents: DocumentService }, DocumentError>
> => {
  const request = getRequest()
  const container = makeContainer(env, request)
  if (container.documents === undefined) return err(UNAVAILABLE)
  return ok({ actor: await container.currentActor(request), documents: container.documents })
}

const asDocumentId = (raw: string): Result<DocumentId, DocumentError> => {
  const parsed = parseDocumentId(raw)
  return parsed.ok ? ok(parsed.value) : err(NOT_FOUND)
}

export type HomeState = {
  readonly actor: ActorWire
  readonly documents: readonly DocumentSummaryWire[]
}

export const homeStateFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<HomeState> => {
    const ready = await withService()
    if (!ready.ok) {
      const request = getRequest()
      return {
        actor: toActorWire(await makeContainer(env, request).currentActor(request)),
        documents: [],
      }
    }
    const list = await ready.value.documents.list(ready.value.actor)
    return {
      actor: toActorWire(ready.value.actor),
      documents: list.ok ? list.value.map(toDocumentSummaryWire) : [],
    }
  },
)

export type DocumentState = {
  readonly actor: ActorWire
  readonly document: DocumentWire
  readonly role: string
  readonly members: readonly MemberSummaryWire[]
  readonly links: readonly ShareLinkWire[]
  /** 共有リンクの URL を組み立てる基準。ブラウザの location には頼らない。 */
  readonly origin: string
}

export const documentStateFn = createServerFn({ method: 'GET' })
  .validator((documentId: string) => documentId)
  .handler(async ({ data }): Promise<Result<DocumentState, DocumentError>> => {
    const id = asDocumentId(data)
    if (!id.ok) return id
    const ready = await withService()
    if (!ready.ok) return ready

    const view = await ready.value.documents.open(ready.value.actor, id.value)
    if (!view.ok) return view

    // 共有リンクは owner にしか出さない。listShareLinks が権限を見る
    const links = await ready.value.documents.listShareLinks(ready.value.actor, id.value)

    return ok({
      actor: toActorWire(ready.value.actor),
      document: toDocumentWire(view.value.document),
      role: view.value.role,
      members: view.value.members.map(toMemberSummaryWire),
      links: links.ok ? links.value.map(toShareLinkWire) : [],
      origin: new URL(getRequest().url).origin,
    })
  })

/**
 * 種別を決めて新しい文書を作る。
 *
 * ホームの「〜で始める」は JavaScript が無くても動くよう `POST /new`
 * （server route）のままにしてある。こちらは**作った文書の ID をその場で
 * 受け取りたい**とき（エディタの「変換して新規作成」）のための入口で、
 * 権限とゲスト発行の扱いは `documents.create` に任せる。
 */
export const createDocumentFn = createServerFn({ method: 'POST' })
  .validator((kind: string) => kind)
  .handler(async ({ data }): Promise<Result<DocumentWire, DocumentError>> => {
    const kind = parseDocumentKind(data)
    if (!kind.ok) return err(NOT_FOUND)
    const ready = await withService()
    if (!ready.ok) return ready
    const created = await ready.value.documents.create(ready.value.actor, kind.value)
    return created.ok ? ok(toDocumentWire(created.value)) : created
  })

type RenameInput = { readonly documentId: string; readonly title: string }

export const renameDocumentFn = createServerFn({ method: 'POST' })
  .validator((input: RenameInput) => input)
  .handler(async ({ data }): Promise<Result<string, DocumentError>> => {
    const id = asDocumentId(data.documentId)
    if (!id.ok) return id
    const ready = await withService()
    if (!ready.ok) return ready
    return ready.value.documents.rename(ready.value.actor, id.value, data.title)
  })

export const deleteDocumentFn = createServerFn({ method: 'POST' })
  .validator((documentId: string) => documentId)
  .handler(async ({ data }): Promise<Result<void, DocumentError>> => {
    const id = asDocumentId(data)
    if (!id.ok) return id
    const ready = await withService()
    if (!ready.ok) return ready
    return ready.value.documents.remove(ready.value.actor, id.value)
  })

export const leaveDocumentFn = createServerFn({ method: 'POST' })
  .validator((documentId: string) => documentId)
  .handler(async ({ data }): Promise<Result<void, DocumentError>> => {
    const id = asDocumentId(data)
    if (!id.ok) return id
    const ready = await withService()
    if (!ready.ok) return ready
    return ready.value.documents.leave(ready.value.actor, id.value)
  })

type CreateLinkInput = {
  readonly documentId: string
  readonly role: string
  readonly expiresInDays: number | null
}

export const createShareLinkFn = createServerFn({ method: 'POST' })
  .validator((input: CreateLinkInput) => input)
  .handler(async ({ data }): Promise<Result<ShareLinkWire, DocumentError>> => {
    const id = asDocumentId(data.documentId)
    if (!id.ok) return id
    const role = parseRole(data.role)
    // owner リンクは存在しない（ADR-0011）。画面が壊れていても発行させない
    if (!role.ok || role.value === 'owner') return err({ kind: 'forbidden' })

    const ready = await withService()
    if (!ready.ok) return ready

    const created = await ready.value.documents.createShareLink(ready.value.actor, {
      documentId: id.value,
      role: role.value,
      expiresInDays: data.expiresInDays === null ? undefined : data.expiresInDays,
    })
    return created.ok ? { ok: true, value: toShareLinkWire(created.value) } : created
  })

type TokenInput = { readonly documentId: string; readonly token: string }

export const revokeShareLinkFn = createServerFn({ method: 'POST' })
  .validator((input: TokenInput) => input)
  .handler(async ({ data }): Promise<Result<void, DocumentError>> => {
    const id = asDocumentId(data.documentId)
    if (!id.ok) return id
    const token = parseShareToken(data.token)
    if (!token.ok) return err(NOT_FOUND)
    const ready = await withService()
    if (!ready.ok) return ready
    return ready.value.documents.revokeShareLink(ready.value.actor, id.value, token.value)
  })

type MemberInput = { readonly documentId: string; readonly userId: string; readonly role?: string }

const parseMemberInput = (
  input: MemberInput,
): Result<{ readonly documentId: DocumentId; readonly userId: UserId }, DocumentError> => {
  const id = asDocumentId(input.documentId)
  if (!id.ok) return id
  const userId = parseUserId(input.userId)
  if (!userId.ok) return err(NOT_FOUND)
  return ok({ documentId: id.value, userId: userId.value })
}

export const removeMemberFn = createServerFn({ method: 'POST' })
  .validator((input: MemberInput) => input)
  .handler(async ({ data }): Promise<Result<void, DocumentError>> => {
    const parsed = parseMemberInput(data)
    if (!parsed.ok) return parsed
    const ready = await withService()
    if (!ready.ok) return ready
    return ready.value.documents.removeMember(
      ready.value.actor,
      parsed.value.documentId,
      parsed.value.userId,
    )
  })

export const changeMemberRoleFn = createServerFn({ method: 'POST' })
  .validator((input: MemberInput) => input)
  .handler(async ({ data }): Promise<Result<void, DocumentError>> => {
    const parsed = parseMemberInput(data)
    if (!parsed.ok) return parsed
    const role = parseRole(data.role ?? '')
    if (!role.ok) return err({ kind: 'forbidden' })
    const ready = await withService()
    if (!ready.ok) return ready
    return ready.value.documents.changeMemberRole(
      ready.value.actor,
      parsed.value.documentId,
      parsed.value.userId,
      role.value,
    )
  })

/* ---------------------------------------------------------------- ブラウザ側 */

/** クリップボードは権限で拒否されることがある。失敗を値で返す。 */
export const browserCopyText = async (text: string): Promise<boolean> => {
  try {
    await globalThis.navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export const homeActions = {
  remove: (documentId: DocumentId) => deleteDocumentFn({ data: documentId }),
}

/** 文書 ID は文字列で受ける。値はサーバ側で必ずパースし直す。 */
export const documentActions = (documentId: string) => ({
  rename: (title: string) => renameDocumentFn({ data: { documentId, title } }),
  remove: () => deleteDocumentFn({ data: documentId }),
  leave: () => leaveDocumentFn({ data: documentId }),
})

export const shareActions = (documentId: string) => ({
  createLink: async (input: {
    readonly role: ShareRole
    readonly expiresInDays: number | undefined
  }) => {
    const created = await createShareLinkFn({
      data: {
        documentId,
        role: input.role,
        expiresInDays: input.expiresInDays === undefined ? null : input.expiresInDays,
      },
    })
    if (!created.ok) return created
    // 境界を越えた値は必ず検証し直す。読めないなら画面に出さない
    const link = parseShareLinkWire(created.value)
    return link === undefined
      ? err<DocumentError>({ kind: 'storage_unavailable', detail: '作成したリンクを読めなかった' })
      : ok<ShareLinkView>(link)
  },
  revokeLink: (token: ShareToken) => revokeShareLinkFn({ data: { documentId, token } }),
  removeMember: (userId: UserId) => removeMemberFn({ data: { documentId, userId } }),
  changeMemberRole: (userId: UserId, role: Role) =>
    changeMemberRoleFn({ data: { documentId, userId, role } }),
  copyText: browserCopyText,
})
