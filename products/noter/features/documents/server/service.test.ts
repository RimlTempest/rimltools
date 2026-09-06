import type { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { MAX_TITLE_LENGTH } from '@noter/contract'
import type { DocumentId, RandomBytes, Result, UserId } from '@noter/contract'
import type { Actor } from '@noter/auth/contract'
import { shareToken, userId } from '../core/tests/fixtures.ts'
import { makeDocumentRepository } from './repository.ts'
import { makeDocumentService } from './service.ts'
import type { DocumentService } from './service.ts'
import { insertUser, makeSqliteRunner, openTestDatabase } from './tests/sqlite-runner.ts'

const OWNER = userId('1')
const FRIEND = userId('2')
const STRANGER = userId('3')

const NOW = new Date('2026-09-06T00:00:00.000Z')

const guest = (id: UserId): Actor => ({
  kind: 'guest',
  userId: id,
  displayName: 'ゲスト',
  sessionExpiresAt: new Date('2026-10-06T00:00:00.000Z'),
})

const signedIn = (id: UserId): Actor => ({ kind: 'user', userId: id, displayName: '山田' })

const VISITOR: Actor = { kind: 'visitor' }

const unwrap = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) throw new Error(`失敗した: ${JSON.stringify(result.error)}`)
  return result.value
}

const errorOf = <T, E>(result: Result<T, E>): E => {
  if (result.ok) throw new Error(`成功してしまった: ${JSON.stringify(result.value)}`)
  return result.error
}

describe('makeDocumentService', () => {
  let database: Database
  let service: DocumentService
  let kicked: { documentId: DocumentId; actorId: UserId }[]
  let counter: number

  /** 決定的な乱数。呼ぶたびに 1 ずつ違うバイト列を返す。 */
  const randomBytes: RandomBytes = (byteLength) => {
    counter += 1
    const bytes = new Uint8Array(byteLength)
    bytes[byteLength - 1] = counter
    return bytes
  }

  beforeEach(() => {
    database = openTestDatabase()
    for (const [id, name] of [
      [OWNER, '山田'],
      [FRIEND, '佐藤'],
      [STRANGER, '通りすがり'],
    ] as const) {
      insertUser(database, id, name)
    }
    kicked = []
    counter = 0
    service = makeDocumentService({
      repository: makeDocumentRepository(makeSqliteRunner(database)),
      now: () => NOW,
      randomBytes,
      kick: async (documentId, actorId) => {
        kicked.push({ documentId, actorId })
      },
    })
  })

  afterEach(() => database.close())

  const newDocument = async (owner: Actor = signedIn(OWNER)) =>
    unwrap(await service.create(owner, 'markdown'))

  const shareWith = async (documentId: DocumentId, role: 'viewer' | 'editor', days?: number) => {
    const link = unwrap(
      await service.createShareLink(signedIn(OWNER), {
        documentId,
        role,
        expiresInDays: days,
      }),
    )
    return link.token
  }

  describe('create', () => {
    test('ゲストでも作れる', async () => {
      const document = await newDocument(guest(OWNER))
      expect(document.ownerId).toBe(OWNER)
      expect(document.kind).toBe('markdown')
      expect(document.title).toBe('無題')
    })

    test('visitor は作れない', async () => {
      expect(errorOf(await service.create(VISITOR, 'markdown'))).toEqual({
        kind: 'sign_in_required',
      })
    })

    test('作った文書が自分の一覧に出る', async () => {
      const document = await newDocument()
      const list = unwrap(await service.list(signedIn(OWNER)))
      expect(list.map((row) => row.id)).toEqual([document.id])
    })

    test('visitor の一覧は空', async () => {
      expect(unwrap(await service.list(VISITOR))).toEqual([])
    })
  })

  describe('open', () => {
    test('所有者は owner として開ける。参加者も返る', async () => {
      const document = await newDocument()
      const view = unwrap(await service.open(signedIn(OWNER), document.id))
      expect(view.role).toBe('owner')
      expect(view.members).toEqual([{ userId: OWNER, displayName: '山田', role: 'owner' }])
    })

    test('非メンバーには not_found（存在も知らせない）', async () => {
      const document = await newDocument()
      expect(errorOf(await service.open(signedIn(STRANGER), document.id))).toEqual({
        kind: 'not_found',
      })
    })

    test('visitor には sign_in_required', async () => {
      const document = await newDocument()
      expect(errorOf(await service.open(VISITOR, document.id))).toEqual({
        kind: 'sign_in_required',
      })
    })
  })

  describe('rename', () => {
    test('editor は名前を変えられる', async () => {
      const document = await newDocument()
      const token = await shareWith(document.id, 'editor')
      unwrap(await service.join(signedIn(FRIEND), token))

      expect(unwrap(await service.rename(signedIn(FRIEND), document.id, ' 新しい表題 '))).toBe(
        '新しい表題',
      )
    })

    test('viewer は名前を変えられない', async () => {
      const document = await newDocument()
      const token = await shareWith(document.id, 'viewer')
      unwrap(await service.join(signedIn(FRIEND), token))

      expect(errorOf(await service.rename(signedIn(FRIEND), document.id, '横取り'))).toEqual({
        kind: 'forbidden',
      })
    })

    test('空の表題は受け付けない', async () => {
      const document = await newDocument()
      expect(errorOf(await service.rename(signedIn(OWNER), document.id, '   '))).toEqual({
        kind: 'invalid_title',
        reason: 'empty',
      })
    })

    test('長すぎる表題は受け付けない', async () => {
      const document = await newDocument()
      const error = errorOf(
        await service.rename(signedIn(OWNER), document.id, 'あ'.repeat(MAX_TITLE_LENGTH + 1)),
      )
      expect(error).toEqual({ kind: 'invalid_title', reason: 'too_long' })
    })
  })

  describe('remove', () => {
    test('所有者は削除でき、以後は開けない', async () => {
      const document = await newDocument()
      unwrap(await service.remove(signedIn(OWNER), document.id))

      expect(errorOf(await service.open(signedIn(OWNER), document.id))).toEqual({
        kind: 'not_found',
      })
      expect(unwrap(await service.list(signedIn(OWNER)))).toEqual([])
    })

    test('editor は削除できない', async () => {
      const document = await newDocument()
      const token = await shareWith(document.id, 'editor')
      unwrap(await service.join(signedIn(FRIEND), token))

      expect(errorOf(await service.remove(signedIn(FRIEND), document.id))).toEqual({
        kind: 'forbidden',
      })
    })
  })

  describe('共有リンク', () => {
    test('owner は editor リンクを作れる', async () => {
      const document = await newDocument()
      const link = unwrap(
        await service.createShareLink(signedIn(OWNER), {
          documentId: document.id,
          role: 'editor',
          expiresInDays: 7,
        }),
      )
      expect(link.role).toBe('editor')
      expect(link.expiresAt?.toISOString()).toBe('2026-09-13T00:00:00.000Z')
    })

    test('無期限のリンクも作れる', async () => {
      const document = await newDocument()
      const link = unwrap(
        await service.createShareLink(signedIn(OWNER), {
          documentId: document.id,
          role: 'viewer',
          expiresInDays: undefined,
        }),
      )
      expect(link.expiresAt).toBeUndefined()
    })

    /** ADR-0010: ゲスト owner は viewer リンクしか作れない。 */
    test('ゲスト owner は editor リンクを作れない', async () => {
      const document = await newDocument(guest(OWNER))
      const error = errorOf(
        await service.createShareLink(guest(OWNER), {
          documentId: document.id,
          role: 'editor',
          expiresInDays: 7,
        }),
      )
      expect(error).toEqual({
        kind: 'share_role_denied',
        denied: { kind: 'guest_cannot_grant_editor' },
      })
    })

    test('ゲスト owner でも viewer リンクは作れる', async () => {
      const document = await newDocument(guest(OWNER))
      const link = unwrap(
        await service.createShareLink(guest(OWNER), {
          documentId: document.id,
          role: 'viewer',
          expiresInDays: 90,
        }),
      )
      expect(link.role).toBe('viewer')
    })

    test('editor はリンクを作れない', async () => {
      const document = await newDocument()
      const token = await shareWith(document.id, 'editor')
      unwrap(await service.join(signedIn(FRIEND), token))

      const error = errorOf(
        await service.createShareLink(signedIn(FRIEND), {
          documentId: document.id,
          role: 'viewer',
          expiresInDays: 7,
        }),
      )
      expect(error).toEqual({ kind: 'forbidden' })
    })

    test('失効させると一覧から消える', async () => {
      const document = await newDocument()
      const token = await shareWith(document.id, 'viewer')
      unwrap(await service.revokeShareLink(signedIn(OWNER), document.id, token))

      expect(unwrap(await service.listShareLinks(signedIn(OWNER), document.id))).toEqual([])
    })

    test('別の文書のトークンは失効させられない', async () => {
      const mine = await newDocument()
      const theirs = unwrap(await service.create(signedIn(STRANGER), 'json'))
      const token = await shareWith(mine.id, 'viewer')

      expect(errorOf(await service.revokeShareLink(signedIn(STRANGER), theirs.id, token))).toEqual({
        kind: 'not_found',
      })
    })
  })

  describe('join', () => {
    test('リンクを開いた人がメンバーになる', async () => {
      const document = await newDocument()
      const token = await shareWith(document.id, 'viewer')

      expect(unwrap(await service.join(signedIn(FRIEND), token))).toBe(document.id)
      expect(unwrap(await service.open(signedIn(FRIEND), document.id)).role).toBe('viewer')
    })

    test('viewer リンクを開いても editor の権限は下がらない（ADR-0011）', async () => {
      const document = await newDocument()
      unwrap(await service.join(signedIn(FRIEND), await shareWith(document.id, 'editor')))
      unwrap(await service.join(signedIn(FRIEND), await shareWith(document.id, 'viewer')))

      expect(unwrap(await service.open(signedIn(FRIEND), document.id)).role).toBe('editor')
    })

    test('失効したリンクは開けない', async () => {
      const document = await newDocument()
      const token = await shareWith(document.id, 'viewer')
      unwrap(await service.revokeShareLink(signedIn(OWNER), document.id, token))

      expect(errorOf(await service.join(signedIn(FRIEND), token))).toEqual({
        kind: 'link_unusable',
        reason: 'revoked',
      })
    })

    test('存在しないトークンは link_unusable(not_found)', async () => {
      expect(errorOf(await service.join(signedIn(FRIEND), shareToken('9')))).toEqual({
        kind: 'link_unusable',
        reason: 'not_found',
      })
    })

    test('visitor は参加できない（先にゲストを発行する）', async () => {
      const document = await newDocument()
      const token = await shareWith(document.id, 'viewer')
      expect(errorOf(await service.join(VISITOR, token))).toEqual({ kind: 'sign_in_required' })
    })
  })

  describe('参加者の管理', () => {
    test('owner は参加者を外し、その場で接続を切る', async () => {
      const document = await newDocument()
      unwrap(await service.join(signedIn(FRIEND), await shareWith(document.id, 'editor')))

      unwrap(await service.removeMember(signedIn(OWNER), document.id, FRIEND))

      expect(errorOf(await service.open(signedIn(FRIEND), document.id))).toEqual({
        kind: 'not_found',
      })
      expect(kicked).toEqual([{ documentId: document.id, actorId: FRIEND }])
    })

    test('owner 自身は外せない', async () => {
      const document = await newDocument()
      expect(errorOf(await service.removeMember(signedIn(OWNER), document.id, OWNER))).toEqual({
        kind: 'forbidden',
      })
    })

    test('「閲覧のみにする」で権限が下がり、接続が切れる', async () => {
      const document = await newDocument()
      unwrap(await service.join(signedIn(FRIEND), await shareWith(document.id, 'editor')))

      unwrap(await service.changeMemberRole(signedIn(OWNER), document.id, FRIEND, 'viewer'))

      expect(unwrap(await service.open(signedIn(FRIEND), document.id)).role).toBe('viewer')
      expect(kicked).toHaveLength(1)
    })

    test('owner に昇格させることはできない（1 文書 1 owner）', async () => {
      const document = await newDocument()
      unwrap(await service.join(signedIn(FRIEND), await shareWith(document.id, 'editor')))

      expect(
        errorOf(await service.changeMemberRole(signedIn(OWNER), document.id, FRIEND, 'owner')),
      ).toEqual({ kind: 'forbidden' })
    })

    test('editor は参加者を外せない', async () => {
      const document = await newDocument()
      unwrap(await service.join(signedIn(FRIEND), await shareWith(document.id, 'editor')))

      expect(errorOf(await service.removeMember(signedIn(FRIEND), document.id, OWNER))).toEqual({
        kind: 'forbidden',
      })
    })

    test('メンバーは自分で退出できる', async () => {
      const document = await newDocument()
      unwrap(await service.join(signedIn(FRIEND), await shareWith(document.id, 'viewer')))

      unwrap(await service.leave(signedIn(FRIEND), document.id))

      expect(errorOf(await service.open(signedIn(FRIEND), document.id))).toEqual({
        kind: 'not_found',
      })
    })

    test('owner は退出できない', async () => {
      const document = await newDocument()
      expect(errorOf(await service.leave(signedIn(OWNER), document.id))).toEqual({
        kind: 'owner_cannot_leave',
      })
    })
  })

  describe('authorizeRaw / authorizeRead', () => {
    test('viewer でも raw を書き出せる', async () => {
      const document = await newDocument()
      unwrap(await service.join(signedIn(FRIEND), await shareWith(document.id, 'viewer')))

      expect(unwrap(await service.authorizeRaw(signedIn(FRIEND), document.id)).id).toBe(document.id)
    })

    test('非メンバーは raw を書き出せない', async () => {
      const document = await newDocument()
      expect(errorOf(await service.authorizeRaw(signedIn(STRANGER), document.id))).toEqual({
        kind: 'not_found',
      })
    })

    test('読み取りの認可は役割つきで返る（/ws が使う）', async () => {
      const document = await newDocument()
      const access = unwrap(await service.authorizeRead(signedIn(OWNER), document.id))
      expect(access.role).toBe('owner')
    })

    test('visitor の読み取りは sign_in_required（/ws は 401 にする）', async () => {
      const document = await newDocument()
      expect(errorOf(await service.authorizeRead(VISITOR, document.id))).toEqual({
        kind: 'sign_in_required',
      })
    })
  })
})
