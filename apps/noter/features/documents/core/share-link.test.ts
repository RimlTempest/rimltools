import { describe, expect, test } from 'bun:test'
import { SHARE_LINK_MAX_AGE_MS } from '@noter/contract'
import type { ShareLink } from '../contract/document.ts'
import {
  SHARE_LINK_DAY_CHOICES,
  defaultExpiry,
  expiryFromDays,
  isShareLinkUsable,
} from './share-link.ts'
import { documentId, shareToken, userId } from './tests/fixtures.ts'

const NOW = new Date('2026-09-06T00:00:00.000Z')

const link = (overrides: Partial<ShareLink> = {}): ShareLink => ({
  token: shareToken('1'),
  documentId: documentId('1'),
  role: 'viewer',
  createdBy: userId('1'),
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  expiresAt: undefined,
  revokedAt: undefined,
  ...overrides,
})

describe('isShareLinkUsable', () => {
  test('期限も失効も無いリンクは使える', () => {
    const result = isShareLinkUsable(link(), NOW)
    expect(result.ok).toBe(true)
  })

  test('未来の期限なら使える', () => {
    const result = isShareLinkUsable(link({ expiresAt: new Date(NOW.getTime() + 1) }), NOW)
    expect(result.ok).toBe(true)
  })

  test('存在しないリンクは not_found', () => {
    const result = isShareLinkUsable(undefined, NOW)
    expect(result).toEqual({ ok: false, error: 'not_found' })
  })

  test('失効済みは revoked', () => {
    const result = isShareLinkUsable(link({ revokedAt: NOW }), NOW)
    expect(result).toEqual({ ok: false, error: 'revoked' })
  })

  test('期限ちょうどは expired（境界）', () => {
    const result = isShareLinkUsable(link({ expiresAt: NOW }), NOW)
    expect(result).toEqual({ ok: false, error: 'expired' })
  })

  test('失効と期限切れが重なったら revoked を先に返す', () => {
    const result = isShareLinkUsable(link({ revokedAt: NOW, expiresAt: NOW }), NOW)
    expect(result).toEqual({ ok: false, error: 'revoked' })
  })
})

describe('defaultExpiry', () => {
  test('既定は 90 日後', () => {
    expect(defaultExpiry(NOW).getTime()).toBe(NOW.getTime() + SHARE_LINK_MAX_AGE_MS)
  })
})

describe('expiryFromDays', () => {
  test('日数を指定するとその日数後になる', () => {
    expect(expiryFromDays(NOW, 7)?.toISOString()).toBe('2026-09-13T00:00:00.000Z')
  })

  test('無期限は undefined', () => {
    expect(expiryFromDays(NOW, undefined)).toBeUndefined()
  })

  test('画面に出す選択肢は 7 / 30 / 90 日', () => {
    expect(SHARE_LINK_DAY_CHOICES).toEqual([7, 30, 90])
  })
})
