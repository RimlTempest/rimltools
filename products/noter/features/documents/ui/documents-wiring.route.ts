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
import { err, ok } from '@noter/contract'
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
  parseCreateLinkInput,
  parseDocumentIdInput,
  parseDocumentKindInput,
  parseMemberInput,
  parseMemberRoleInput,
  parseRenameInput,
  parseShareLinkWire,
  parseTokenInput,
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

/**
 * server function の入力は**ネットワークから届く**ので、呼び出し側の型注釈は
 * 実行時の約束にならない。`.validator()` は `@noter/documents/contract` の
 * パーサを通し、形の合わない入力をハンドラまで届かせない。
 *
 * validator が返すのは**素の形のまま**にしてある。Branded 型は TanStack の
 * 直列化の型を越えられない（`DocumentId` が文字列メソッドの構造体に化ける）ため、
 * ブランドはハンドラで同じパーサを通して付け直す。パーサは純粋関数なので、
 * 二度通しても結果は変わらない。
 */
const validated = <T>(input: T, parsed: unknown): T | undefined =>
  parsed === undefined ? undefined : input

/** いまのリクエストから「誰が」と「何を使えるか」を 1 回だけ組み立てる。 */
const withService = async (): Promise<
  Result<{ readonly actor: Actor; readonly documents: DocumentService }, DocumentError>
> => {
  const request = getRequest()
  const container = makeContainer(env, request)
  if (container.documents === undefined) return err(UNAVAILABLE)
  return ok({ actor: await container.currentActor(request), documents: container.documents })
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
  .validator((documentId: string) => validated(documentId, parseDocumentIdInput(documentId)))
  .handler(async ({ data }): Promise<Result<DocumentState, DocumentError>> => {
    const id = parseDocumentIdInput(data)
    if (id === undefined) return err(NOT_FOUND)
    const ready = await withService()
    if (!ready.ok) return ready

    const view = await ready.value.documents.open(ready.value.actor, id)
    if (!view.ok) return view

    // 共有リンクは owner にしか出さない。listShareLinks が権限を見る
    const links = await ready.value.documents.listShareLinks(ready.value.actor, id)

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
  .validator((kind: string) => validated(kind, parseDocumentKindInput(kind)))
  .handler(async ({ data }): Promise<Result<DocumentWire, DocumentError>> => {
    const kind = parseDocumentKindInput(data)
    if (kind === undefined) return err(NOT_FOUND)
    const ready = await withService()
    if (!ready.ok) return ready
    const created = await ready.value.documents.create(ready.value.actor, kind)
    return created.ok ? ok(toDocumentWire(created.value)) : created
  })

type RenameInput = { readonly documentId: string; readonly title: string }

export const renameDocumentFn = createServerFn({ method: 'POST' })
  .validator((input: RenameInput) => validated(input, parseRenameInput(input)))
  .handler(async ({ data }): Promise<Result<string, DocumentError>> => {
    const input = parseRenameInput(data)
    if (input === undefined) return err(NOT_FOUND)
    const ready = await withService()
    if (!ready.ok) return ready
    return ready.value.documents.rename(ready.value.actor, input.documentId, input.title)
  })

export const deleteDocumentFn = createServerFn({ method: 'POST' })
  .validator((documentId: string) => validated(documentId, parseDocumentIdInput(documentId)))
  .handler(async ({ data }): Promise<Result<void, DocumentError>> => {
    const id = parseDocumentIdInput(data)
    if (id === undefined) return err(NOT_FOUND)
    const ready = await withService()
    if (!ready.ok) return ready
    return ready.value.documents.remove(ready.value.actor, id)
  })

export const leaveDocumentFn = createServerFn({ method: 'POST' })
  .validator((documentId: string) => validated(documentId, parseDocumentIdInput(documentId)))
  .handler(async ({ data }): Promise<Result<void, DocumentError>> => {
    const id = parseDocumentIdInput(data)
    if (id === undefined) return err(NOT_FOUND)
    const ready = await withService()
    if (!ready.ok) return ready
    return ready.value.documents.leave(ready.value.actor, id)
  })

type CreateLinkInput = {
  readonly documentId: string
  readonly role: string
  readonly expiresInDays: number | null
}

export const createShareLinkFn = createServerFn({ method: 'POST' })
  .validator((input: CreateLinkInput) => validated(input, parseCreateLinkInput(input)))
  .handler(async ({ data }): Promise<Result<ShareLinkWire, DocumentError>> => {
    const input = parseCreateLinkInput(data)
    if (input === undefined) return err(NOT_FOUND)
    // owner リンクは存在しない（ADR-0011）。画面が壊れていても発行させない
    if (input.role === 'owner') return err({ kind: 'forbidden' })

    const ready = await withService()
    if (!ready.ok) return ready

    const created = await ready.value.documents.createShareLink(ready.value.actor, {
      documentId: input.documentId,
      role: input.role,
      expiresInDays: input.expiresInDays,
    })
    return created.ok ? { ok: true, value: toShareLinkWire(created.value) } : created
  })

type TokenInput = { readonly documentId: string; readonly token: string }

export const revokeShareLinkFn = createServerFn({ method: 'POST' })
  .validator((input: TokenInput) => validated(input, parseTokenInput(input)))
  .handler(async ({ data }): Promise<Result<void, DocumentError>> => {
    const input = parseTokenInput(data)
    if (input === undefined) return err(NOT_FOUND)
    const ready = await withService()
    if (!ready.ok) return ready
    return ready.value.documents.revokeShareLink(ready.value.actor, input.documentId, input.token)
  })

type MemberInput = { readonly documentId: string; readonly userId: string }

type MemberRoleInput = MemberInput & { readonly role: string }

export const removeMemberFn = createServerFn({ method: 'POST' })
  .validator((input: MemberInput) => validated(input, parseMemberInput(input)))
  .handler(async ({ data }): Promise<Result<void, DocumentError>> => {
    const input = parseMemberInput(data)
    if (input === undefined) return err(NOT_FOUND)
    const ready = await withService()
    if (!ready.ok) return ready
    return ready.value.documents.removeMember(ready.value.actor, input.documentId, input.userId)
  })

export const changeMemberRoleFn = createServerFn({ method: 'POST' })
  .validator((input: MemberRoleInput) => validated(input, parseMemberRoleInput(input)))
  .handler(async ({ data }): Promise<Result<void, DocumentError>> => {
    const input = parseMemberRoleInput(data)
    if (input === undefined) return err(NOT_FOUND)
    const ready = await withService()
    if (!ready.ok) return ready
    return ready.value.documents.changeMemberRole(
      ready.value.actor,
      input.documentId,
      input.userId,
      input.role,
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
