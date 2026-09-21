/**
 * Composition root。ここだけが具体実装と env を知っている。
 *
 * ルートや server function は `Container` の関数を受け取るだけで、
 * `env` や service binding を直接触らない（.claude/skills/noter-architecture）。
 *
 * D1 バインディングを Drizzle に渡す配線をここに置くのは、`D1Database` の
 * グローバル型が apps/web のプログラムでしか解決できないため。
 * Durable Object（`DOCUMENT_ROOM`）への呼び出しも同じ理由でここに閉じる。
 */
import { drizzle } from 'drizzle-orm/d1'
import type { Actor } from '@noter/auth/contract'
import type { Auth } from '@noter/auth/server'
import { isGoogleConfigured, makeAuthFromEnv, makeD1SqlRunner } from '@noter/auth/server'
import type { DocumentId, Result, UserId } from '@noter/contract'
import { err, ok } from '@noter/contract'
import type { DocumentService, IssuedGuest, StorageError } from '@noter/documents/server'
import {
  makeDocumentRepository,
  makeDocumentService,
  makeIssueGuest,
} from '@noter/documents/server'
import { INTERNAL_ROUTES } from '@noter/sync/core'

/**
 * ここで使う env の形だけ。秘密情報は `readEnvString` が `unknown` から読む。
 *
 * D1 バインディングの型は `drizzle` の引数から取る。アンビエントな
 * `D1Database` を直接書くと、生成物（`worker-configuration.d.ts`）を
 * 読まないツール（oxlint）から解決できない。
 */
type D1Binding = Parameters<typeof drizzle>[0]

export type WebEnv = {
  readonly DB?: D1Binding
  readonly DOCUMENT_ROOM?: CloudflareEnv['DOCUMENT_ROOM']
}

export type Container = {
  /**
   * `/api/auth/*` のハンドラ。D1 が無い環境（設定ミス）では `undefined` になり、
   * 認証のエンドポイントだけが使えなくなる。画面は visitor のまま出す。
   */
  readonly auth: Auth | undefined
  /** いま誰が使っているか。失敗しても必ず `Actor` が返る。 */
  readonly currentActor: (request: Request) => Promise<Actor>
  /** Google の資格情報がそろっているか。UI はこれが false ならボタンを出さない。 */
  readonly isGoogleAvailable: boolean
  /** 文書のユースケース。D1 が無い環境では `undefined`。 */
  readonly documents: DocumentService | undefined
  /**
   * visitor が最初の操作（新規作成・共有リンク）をしたときにゲストを発行する。
   * 返ってきた `Set-Cookie` は呼び出し側が応答に載せる。
   */
  readonly issueGuest: (() => Promise<Result<IssuedGuest, StorageError>>) | undefined
  /** 本文のスナップショット（`/d/:id/raw`）。認可を済ませてから呼ぶこと。 */
  readonly snapshot: (documentId: DocumentId) => Promise<Result<string, StorageError>>
}

const visitorOnly = async (): Promise<Actor> => ({ kind: 'visitor' })

const workerRandomBytes = (byteLength: number): Uint8Array =>
  crypto.getRandomValues(new Uint8Array(byteLength))

/**
 * DO の内部ルートを叩く（docs/realtime-protocol.md §5 §6）。
 * ホスト名は使われない（binding 越しなので DNS を引かない）。
 */
const roomFetch = (
  env: WebEnv,
  documentId: DocumentId,
  path: string,
  init?: RequestInit,
): Promise<Response> | undefined =>
  env.DOCUMENT_ROOM?.getByName(documentId).fetch(`https://do${path}`, init)

/**
 * 権限を失った actor の接続を切る。失敗は握りつぶす — 切れなくても
 * 次の再接続で新しい役割になるので、操作自体は成立させてよい。
 */
const makeKick =
  (env: WebEnv) =>
  async (documentId: DocumentId, actorId: UserId): Promise<void> => {
    try {
      await roomFetch(env, documentId, INTERNAL_ROUTES.kick, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actorId }),
      })
    } catch (cause) {
      console.error(`[noter-documents] /kick に失敗した: ${String(cause)}`)
    }
  }

const makeSnapshot =
  (env: WebEnv) =>
  async (documentId: DocumentId): Promise<Result<string, StorageError>> => {
    try {
      const response = await roomFetch(env, documentId, INTERNAL_ROUTES.snapshot)
      if (response === undefined) {
        return err({ kind: 'storage_unavailable', detail: 'DOCUMENT_ROOM が設定されていない' })
      }
      if (!response.ok) {
        return err({ kind: 'storage_unavailable', detail: `snapshot HTTP ${response.status}` })
      }
      return ok(await response.text())
    } catch (cause) {
      return err({ kind: 'storage_unavailable', detail: String(cause) })
    }
  }

export const makeContainer = (env: WebEnv, request: Request): Container => {
  const database = env.DB
  const origin = new URL(request.url).origin
  const snapshot = makeSnapshot(env)

  if (database === undefined) {
    return {
      auth: undefined,
      currentActor: visitorOnly,
      isGoogleAvailable: isGoogleConfigured(env),
      documents: undefined,
      issueGuest: undefined,
      snapshot,
    }
  }

  const repository = makeDocumentRepository(makeD1SqlRunner(database))
  const auth = makeAuthFromEnv(env, {
    makeDb: () => drizzle(database),
    sql: makeD1SqlRunner(database),
    requestOrigin: origin,
    // 昇格時に document.owner_id と document_member.user_id を付け替える（ADR-0010）
    transfer: repository.transferOwnership,
  })

  return {
    auth,
    currentActor: auth.currentActor,
    isGoogleAvailable: isGoogleConfigured(env),
    documents: makeDocumentService({
      repository,
      now: () => new Date(),
      randomBytes: workerRandomBytes,
      kick: makeKick(env),
    }),
    issueGuest: makeIssueGuest({ handler: auth.handler, origin }),
    snapshot,
  }
}
