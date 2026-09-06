import type { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { MAX_DOCUMENTS_PER_USER } from '@noter/contract'
import type { DocumentId, Result, UserId } from '@noter/contract'
import type { Document } from '../contract/document.ts'
import { documentId, shareToken, userId } from '../core/tests/fixtures.ts'
import { makeDocumentRepository } from './repository.ts'
import type { DocumentRepository } from './repository.ts'
import { insertUser, makeSqliteRunner, openTestDatabase } from './tests/sqlite-runner.ts'

const OWNER = userId('1')
const FRIEND = userId('2')
const STRANGER = userId('3')

const NOW = new Date('2026-09-06T00:00:00.000Z')
const LATER = new Date('2026-09-07T00:00:00.000Z')

const unwrap = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) throw new Error(`失敗した: ${JSON.stringify(result.error)}`)
  return result.value
}

const documentAt = (id: DocumentId, ownerId: UserId, updatedAt: Date): Document => ({
  id,
  ownerId,
  kind: 'markdown',
  title: '設計メモ',
  createdAt: NOW,
  updatedAt,
  deletedAt: undefined,
})

describe('makeDocumentRepository', () => {
  let database: Database
  let repository: DocumentRepository

  beforeEach(() => {
    database = openTestDatabase()
    for (const [id, name] of [
      [OWNER, '山田'],
      [FRIEND, '佐藤'],
      [STRANGER, '通りすがり'],
    ] as const) {
      insertUser(database, id, name)
    }
    repository = makeDocumentRepository(makeSqliteRunner(database))
  })

  afterEach(() => database.close())

  describe('create / findForActor', () => {
    test('作成すると所有者がメンバー（owner）として入る', async () => {
      const id = documentId('1')
      unwrap(await repository.create(documentAt(id, OWNER, NOW)))

      const found = unwrap(await repository.findForActor(id, OWNER))
      expect(found?.role).toBe('owner')
      expect(found?.document.title).toBe('設計メモ')
      expect(found?.document.kind).toBe('markdown')
      expect(found?.document.updatedAt).toEqual(NOW)
      expect(found?.document.deletedAt).toBeUndefined()
    })

    /** 作成で書く行は document 1 + document_member 1 の 2 行だけ（無料枠）。 */
    test('書き込みは 2 行に収まる', async () => {
      const id = documentId('1')
      unwrap(await repository.create(documentAt(id, OWNER, NOW)))
      const rows = database.query('SELECT COUNT(*) AS n FROM document_member').get()
      expect(rows).toEqual({ n: 1 })
    })

    test('非メンバーには見えない', async () => {
      const id = documentId('1')
      unwrap(await repository.create(documentAt(id, OWNER, NOW)))
      expect(unwrap(await repository.findForActor(id, STRANGER))).toBeUndefined()
    })

    test('存在しない文書は undefined', async () => {
      expect(unwrap(await repository.findForActor(documentId('9'), OWNER))).toBeUndefined()
    })

    test('削除済みは所有者にも役割が無い', async () => {
      const id = documentId('1')
      unwrap(await repository.create(documentAt(id, OWNER, NOW)))
      unwrap(await repository.softDelete(id, LATER))
      expect(unwrap(await repository.findForActor(id, OWNER))).toBeUndefined()
    })
  })

  describe('listForUser', () => {
    test('更新が新しい順に並ぶ', async () => {
      unwrap(await repository.create(documentAt(documentId('1'), OWNER, NOW)))
      unwrap(await repository.create(documentAt(documentId('2'), OWNER, LATER)))

      const list = unwrap(await repository.listForUser(OWNER))
      expect(list.map((row) => row.id)).toEqual([documentId('2'), documentId('1')])
      expect(list[0]?.role).toBe('owner')
    })

    test('削除済みは出ない', async () => {
      unwrap(await repository.create(documentAt(documentId('1'), OWNER, NOW)))
      unwrap(await repository.softDelete(documentId('1'), LATER))
      expect(unwrap(await repository.listForUser(OWNER))).toEqual([])
    })

    test('共有された文書も自分の一覧に出る', async () => {
      unwrap(await repository.create(documentAt(documentId('1'), OWNER, NOW)))
      unwrap(await repository.upsertMember(documentId('1'), FRIEND, 'viewer', NOW))

      const list = unwrap(await repository.listForUser(FRIEND))
      expect(list).toHaveLength(1)
      expect(list[0]?.role).toBe('viewer')
    })

    /** 一覧の読み取りは 1 クエリ（docs/free-tier-budget.md）。 */
    test('1 クエリで読み終える', async () => {
      unwrap(await repository.create(documentAt(documentId('1'), OWNER, NOW)))
      let queries = 0
      const counting = makeDocumentRepository({
        ...makeSqliteRunner(database),
        all: async (statement) => {
          queries += 1
          return makeSqliteRunner(database).all(statement)
        },
      })
      unwrap(await counting.listForUser(OWNER))
      expect(queries).toBe(1)
    })
  })

  describe('countOwnedByUser', () => {
    test('所有している文書だけを数える', async () => {
      unwrap(await repository.create(documentAt(documentId('1'), OWNER, NOW)))
      unwrap(await repository.create(documentAt(documentId('2'), FRIEND, NOW)))
      expect(unwrap(await repository.countOwnedByUser(OWNER))).toBe(1)
      expect(MAX_DOCUMENTS_PER_USER).toBe(200)
    })

    test('削除済みは数えない', async () => {
      unwrap(await repository.create(documentAt(documentId('1'), OWNER, NOW)))
      unwrap(await repository.softDelete(documentId('1'), LATER))
      expect(unwrap(await repository.countOwnedByUser(OWNER))).toBe(0)
    })
  })

  describe('rename', () => {
    test('表題と更新時刻が変わる', async () => {
      const id = documentId('1')
      unwrap(await repository.create(documentAt(id, OWNER, NOW)))
      unwrap(await repository.rename(id, '新しい表題', LATER))

      const found = unwrap(await repository.findForActor(id, OWNER))
      expect(found?.document.title).toBe('新しい表題')
      expect(found?.document.updatedAt).toEqual(LATER)
    })
  })

  describe('upsertMember', () => {
    test('既存の権限を下げない（ADR-0011）', async () => {
      const id = documentId('1')
      unwrap(await repository.create(documentAt(id, OWNER, NOW)))
      unwrap(await repository.upsertMember(id, FRIEND, 'editor', NOW))
      unwrap(await repository.upsertMember(id, FRIEND, 'viewer', LATER))

      expect(unwrap(await repository.findForActor(id, FRIEND))?.role).toBe('editor')
    })

    test('弱い権限からは上げる', async () => {
      const id = documentId('1')
      unwrap(await repository.create(documentAt(id, OWNER, NOW)))
      unwrap(await repository.upsertMember(id, FRIEND, 'viewer', NOW))
      unwrap(await repository.upsertMember(id, FRIEND, 'editor', LATER))

      expect(unwrap(await repository.findForActor(id, FRIEND))?.role).toBe('editor')
    })

    /** 既存メンバーの再訪で行を書かない（ADR-0011 の帰結）。 */
    test('同じ権限で入り直しても行を書かない', async () => {
      const id = documentId('1')
      unwrap(await repository.create(documentAt(id, OWNER, NOW)))
      unwrap(await repository.upsertMember(id, FRIEND, 'viewer', NOW))
      expect(unwrap(await repository.upsertMember(id, FRIEND, 'viewer', LATER))).toBe(0)
    })
  })

  describe('listMembers / changeMemberRole / removeMember', () => {
    test('参加者を表示名つきで並べる', async () => {
      const id = documentId('1')
      unwrap(await repository.create(documentAt(id, OWNER, NOW)))
      unwrap(await repository.upsertMember(id, FRIEND, 'editor', LATER))

      const members = unwrap(await repository.listMembers(id))
      expect(members).toEqual([
        { userId: OWNER, displayName: '山田', role: 'owner' },
        { userId: FRIEND, displayName: '佐藤', role: 'editor' },
      ])
    })

    test('権限を下げられる（「閲覧のみにする」）', async () => {
      const id = documentId('1')
      unwrap(await repository.create(documentAt(id, OWNER, NOW)))
      unwrap(await repository.upsertMember(id, FRIEND, 'editor', NOW))
      unwrap(await repository.changeMemberRole(id, FRIEND, 'viewer'))

      expect(unwrap(await repository.findForActor(id, FRIEND))?.role).toBe('viewer')
    })

    test('外すと見えなくなる', async () => {
      const id = documentId('1')
      unwrap(await repository.create(documentAt(id, OWNER, NOW)))
      unwrap(await repository.upsertMember(id, FRIEND, 'editor', NOW))
      unwrap(await repository.removeMember(id, FRIEND))

      expect(unwrap(await repository.findForActor(id, FRIEND))).toBeUndefined()
    })
  })

  describe('共有リンク', () => {
    const link = {
      token: shareToken('1'),
      documentId: documentId('1'),
      role: 'viewer',
      createdBy: OWNER,
      createdAt: NOW,
      expiresAt: LATER,
      revokedAt: undefined,
    } as const

    beforeEach(async () => {
      unwrap(await repository.create(documentAt(documentId('1'), OWNER, NOW)))
    })

    test('作って引ける', async () => {
      unwrap(await repository.createShareLink(link))
      const target = unwrap(await repository.findShareLinkTarget(shareToken('1')))
      expect(target?.link).toEqual(link)
    })

    test('無期限のリンクも作れる', async () => {
      unwrap(await repository.createShareLink({ ...link, expiresAt: undefined }))
      const target = unwrap(await repository.findShareLinkTarget(shareToken('1')))
      expect(target?.link.expiresAt).toBeUndefined()
    })

    test('知らないトークンは undefined', async () => {
      expect(unwrap(await repository.findShareLinkTarget(shareToken('9')))).toBeUndefined()
    })

    test('失効すると revokedAt が入り、一覧から消える', async () => {
      unwrap(await repository.createShareLink(link))
      unwrap(await repository.revokeShareLink(shareToken('1'), LATER))

      const target = unwrap(await repository.findShareLinkTarget(shareToken('1')))
      expect(target?.link.revokedAt).toEqual(LATER)
      expect(unwrap(await repository.listShareLinks(documentId('1')))).toEqual([])
    })

    /** 参加してよいかの判定に要る。行き先が消えていれば入れてはいけない。 */
    test('参照先の文書が生きているかを同じ 1 クエリで返す', async () => {
      unwrap(await repository.createShareLink(link))

      let queries = 0
      const counting = makeDocumentRepository({
        ...makeSqliteRunner(database),
        all: async (statement) => {
          queries += 1
          return makeSqliteRunner(database).all(statement)
        },
      })
      const alive = unwrap(await counting.findShareLinkTarget(shareToken('1')))
      expect(alive?.documentExists).toBe(true)
      expect(alive?.documentDeletedAt).toBeUndefined()
      expect(queries).toBe(1)
    })

    test('参照先の文書が削除されていたら deletedAt が返る', async () => {
      unwrap(await repository.createShareLink(link))
      unwrap(await repository.softDelete(documentId('1'), LATER))

      const target = unwrap(await repository.findShareLinkTarget(shareToken('1')))
      expect(target?.documentExists).toBe(true)
      expect(target?.documentDeletedAt).toEqual(LATER)
    })

    test('有効なリンクだけを一覧する', async () => {
      unwrap(await repository.createShareLink(link))
      expect(unwrap(await repository.listShareLinks(documentId('1')))).toEqual([link])
    })
  })

  describe('transferOwnership', () => {
    test('所有者とメンバー行が移る', async () => {
      const id = documentId('1')
      unwrap(await repository.create(documentAt(id, OWNER, NOW)))
      unwrap(await repository.transferOwnership(OWNER, FRIEND))

      expect(unwrap(await repository.findForActor(id, FRIEND))?.role).toBe('owner')
      expect(unwrap(await repository.findForActor(id, OWNER))).toBeUndefined()
    })

    /** plan 004 Step 5 の指定ケース。 */
    test('移譲先が既に viewer の文書で、移譲元が editor なら editor になる', async () => {
      const id = documentId('1')
      unwrap(await repository.create(documentAt(id, STRANGER, NOW)))
      unwrap(await repository.upsertMember(id, OWNER, 'editor', NOW))
      unwrap(await repository.upsertMember(id, FRIEND, 'viewer', NOW))

      unwrap(await repository.transferOwnership(OWNER, FRIEND))

      expect(unwrap(await repository.findForActor(id, FRIEND))?.role).toBe('editor')
      expect(unwrap(await repository.findForActor(id, OWNER))).toBeUndefined()
    })

    test('移譲先の方が強ければ下げない', async () => {
      const id = documentId('1')
      unwrap(await repository.create(documentAt(id, STRANGER, NOW)))
      unwrap(await repository.upsertMember(id, OWNER, 'viewer', NOW))
      unwrap(await repository.upsertMember(id, FRIEND, 'editor', NOW))

      unwrap(await repository.transferOwnership(OWNER, FRIEND))

      expect(unwrap(await repository.findForActor(id, FRIEND))?.role).toBe('editor')
    })

    /** OAuth の往復は途中で切れる。何度でもやり直せること（ADR-0010）。 */
    test('何度実行しても結果が変わらない', async () => {
      const id = documentId('1')
      unwrap(await repository.create(documentAt(id, OWNER, NOW)))
      unwrap(await repository.transferOwnership(OWNER, FRIEND))
      unwrap(await repository.transferOwnership(OWNER, FRIEND))

      expect(unwrap(await repository.findForActor(id, FRIEND))?.role).toBe('owner')
    })
  })
})
