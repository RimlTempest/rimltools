import { describe, expect, test } from 'bun:test'
import { parseCodeId, parseNonEmptyText, parseShareToken } from '@qrcc/contract'
import { decodeSharePreview } from './detail.ts'
import { decodeShareLink, shareUrl, toShareDraftWire } from './share.ts'

/** フィクスチャは必ずパーサを通す（`as` を使わずに Branded 型を作る唯一の方法）。 */
const expectOk = <T>(
  result: { readonly ok: true; readonly value: T } | { readonly ok: false },
): T => {
  if (!result.ok) throw new Error('fixture is invalid')
  return result.value
}

const token = expectOk(parseShareToken('abcdefghjkmnpqrstvwxyz0123456789'))
const codeId = expectOk(parseCodeId('cd_0123456789abcdefghjkmnpq'))

const shareWire = {
  token: 'abcdefghjkmnpqrstvwxyz0123456789',
  code_id: 'cd_0123456789abcdefghjkmnpq',
  permission: 'view',
  expires_at: 1_790_899_200,
  created_at: 1_788_307_200,
  revoked_at: null,
}

const codeWire = {
  id: 'cd_0123456789abcdefghjkmnpq',
  owner_id: 'usr_0123456789abcdefghjkmnpq',
  folder_id: null,
  name: '在庫ラベル',
  kind: 'qr',
  payload: { kind: 'text', text: 'ABC' },
  symbology: { kind: 'qr', ec: 'M' },
  style: {
    foreground: '#000000',
    background: { kind: 'solid', color: '#ffffff' },
    scale: 6,
    quiet_zone: null,
    module_shape: 'square',
    bar_height: 40,
    human_readable: true,
  },
  created_at: 1_788_220_800,
  updated_at: 1_788_307_200,
}

describe('decodeShareLink', () => {
  test('共有リンクを読む', () => {
    const decoded = decodeShareLink(shareWire)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.value.token).toBe(token)
    expect(decoded.value.codeId).toBe(codeId)
    expect(decoded.value.permission).toBe('view')
    expect(decoded.value.expiresAt?.toISOString()).toBe('2026-10-02T00:00:00.000Z')
  })

  test('期限なしの共有リンクもある（ゲストは作れない）', () => {
    const decoded = decodeShareLink({ ...shareWire, expires_at: null, permission: 'edit' })
    expect(decoded.ok).toBe(true)
    if (decoded.ok) expect(decoded.value.expiresAt).toBeUndefined()
  })

  test('権限は view か edit だけ', () => {
    expect(decodeShareLink({ ...shareWire, permission: 'admin' }).ok).toBe(false)
    expect(decodeShareLink({ ...shareWire, token: 'short' }).ok).toBe(false)
  })
})

describe('toShareDraftWire', () => {
  test('発行済みのトークンと権限・期限を送る', () => {
    expect(
      toShareDraftWire({
        codeId,
        token,
        permission: 'view',
        expiresAt: new Date('2026-10-02T00:00:00.000Z'),
      }),
    ).toEqual({
      code_id: codeId,
      token,
      permission: 'view',
      expires_at: 1_790_899_200,
    })
  })

  test('期限なしは null で送る', () => {
    const wire = toShareDraftWire({
      codeId,
      token,
      permission: 'edit',
      expiresAt: undefined,
    })
    expect(wire).toMatchObject({ expires_at: null })
  })
})

describe('decodeSharePreview', () => {
  test('共有リンクを開いたときの中身を読む', () => {
    const decoded = decodeSharePreview({ permission: 'view', code: codeWire })
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.value.permission).toBe('view')
    expect(decoded.value.code.name).toBe(expectOk(parseNonEmptyText('在庫ラベル')))
  })

  test('中身が壊れていれば失敗にする', () => {
    expect(decodeSharePreview({ permission: 'view' }).ok).toBe(false)
  })
})

describe('shareUrl', () => {
  /** リンクは「共有された」人がそのまま開ける形でないと意味がない。 */
  test('オリジンとトークンから開ける URL を組み立てる', () => {
    expect(shareUrl('https://qrcc.riml4i.com', token)).toBe(
      'https://qrcc.riml4i.com/shared/abcdefghjkmnpqrstvwxyz0123456789',
    )
    expect(shareUrl('https://qrcc.riml4i.com/', token)).toBe(
      'https://qrcc.riml4i.com/shared/abcdefghjkmnpqrstvwxyz0123456789',
    )
  })

  test('末尾のスラッシュが何個あってもまとめて落とす', () => {
    expect(shareUrl('https://qrcc.riml4i.com///', token)).toBe(
      'https://qrcc.riml4i.com/shared/abcdefghjkmnpqrstvwxyz0123456789',
    )
  })

  /** 途中にスラッシュが大量に並ぶ入力でも線形時間で終わる（ReDoS にならない）。 */
  test('スラッシュが大量に並ぶオリジンでもすぐ返る', () => {
    const origin = `https://x${'/'.repeat(50_000)}a`
    const started = performance.now()
    expect(shareUrl(origin, token)).toBe(`${origin}/shared/abcdefghjkmnpqrstvwxyz0123456789`)
    expect(performance.now() - started).toBeLessThan(50)
  })
})
