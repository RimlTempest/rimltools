import { describe, expect, test } from 'bun:test'
import { parseCodeId, parseFolderId, parseNonEmptyText, parseShareToken } from '@qrcc/contract'
import { decodeRenderStyle } from '@qrcc/manage/contract'
import type { ManageCall } from './manage-api.ts'
import { describeManageFailure, makeManageApi } from './manage-api.ts'

const expectOk = <T>(
  result: { readonly ok: true; readonly value: T } | { readonly ok: false },
): T => {
  if (!result.ok) throw new Error('fixture is invalid')
  return result.value
}

const codeId = expectOk(parseCodeId('cd_0123456789abcdefghjkmnpq'))
const folderId = expectOk(parseFolderId('fld_0123456789abcdefghjkmnpq'))
const token = expectOk(parseShareToken('abcdefghjkmnpqrstvwxyz0123456789'))
const name = expectOk(parseNonEmptyText('在庫ラベル'))

const styleWire = {
  foreground: '#000000',
  background: { kind: 'solid', color: '#ffffff' },
  scale: 6,
  quiet_zone: null,
  module_shape: 'square',
  bar_height: 40,
  human_readable: true,
} as const

const style = expectOk(decodeRenderStyle(styleWire))

const codeWire = {
  id: 'cd_0123456789abcdefghjkmnpq',
  owner_id: 'usr_0123456789abcdefghjkmnpq',
  folder_id: null,
  name: '在庫ラベル',
  kind: 'qr',
  payload: { kind: 'text', text: 'ABC' },
  symbology: { kind: 'qr', ec: 'M' },
  style: styleWire,
  created_at: 1_788_220_800,
  updated_at: 1_788_307_200,
}

type Sent = { method: string; body: unknown; idempotencyKey: string | undefined }

/** 呼び出しを記録しつつ、その場で答えを返す。ネットワークも Worker も要らない。 */
const recording = (value: unknown) => {
  const sent: Sent[] = []
  const call: ManageCall = async (method, body, options) => {
    sent.push({ method, body, idempotencyKey: options?.idempotencyKey })
    return { ok: true, value: { ok: true, value } }
  }
  return { sent, api: makeManageApi({ call }) }
}

/** 業務上の失敗（見つからない）を返す口。 */
const notFound = () =>
  makeManageApi({
    call: async () => ({
      ok: true,
      value: { ok: false, error: { kind: 'not_found', resource: 'code' } },
    }),
  })

describe('一覧', () => {
  test('絞り込みと並べ替えをワイヤ形式で送る', async () => {
    const { sent, api } = recording({ items: [], next_cursor: null })
    await api.listCodes({ folderId, query: 'ラベル', sort: 'name_asc', limit: 20 })
    expect(sent[0]?.method).toBe('codes.list')
    expect(sent[0]?.body).toEqual({
      folder_id: folderId,
      query: 'ラベル',
      sort: 'name_asc',
      limit: 20,
      cursor: null,
    })
  })

  test('応答を検証してから返す', async () => {
    const { api } = recording({
      items: [
        {
          id: 'cd_0123456789abcdefghjkmnpq',
          name: '在庫ラベル',
          kind: 'qr',
          folder_id: null,
          updated_at: 1_788_307_200,
        },
      ],
      next_cursor: 'next',
    })
    const page = await api.listCodes({
      folderId: undefined,
      query: undefined,
      sort: 'updated_desc',
      limit: 20,
    })
    expect(page.ok).toBe(true)
    if (!page.ok) return
    expect(page.value.items[0]?.name).toBe(name)
    expect(page.value.nextCursor).toBe('next')
  })

  test('壊れた応答は握りつぶさず失敗にする', async () => {
    const { api } = recording({ items: [{ id: 'nope' }], next_cursor: null })
    const page = await api.listCodes({
      folderId: undefined,
      query: undefined,
      sort: 'updated_desc',
      limit: 20,
    })
    expect(page.ok).toBe(false)
  })
})

describe('保存', () => {
  const draft = {
    id: codeId,
    name,
    folderId: undefined,
    payload: { kind: 'text', text: 'ABC' },
    symbology: { kind: 'qr', ec: 'M' },
    style,
  } as const

  test('同じ操作の再送で二重に作らないよう、冪等キーを添える', async () => {
    const { sent, api } = recording(codeWire)
    await api.createCode(draft, 'key-1')
    expect(sent[0]?.method).toBe('codes.create')
    expect(sent[0]?.idempotencyKey).toBe('key-1')
  })

  test('上書きは全置換として送る', async () => {
    const { sent, api } = recording({
      id: 'cd_0123456789abcdefghjkmnpq',
      updated_at: 1_788_307_200,
    })
    const saved = await api.updateCode(draft)
    expect(sent[0]?.method).toBe('codes.update')
    expect(sent[0]?.body).toMatchObject({ name, folder_id: null })
    expect(saved.ok).toBe(true)
  })

  test('削除は id だけを送る', async () => {
    const { sent, api } = recording({ id: 'cd_0123456789abcdefghjkmnpq' })
    await api.deleteCode(codeId)
    expect(sent[0]).toMatchObject({ method: 'codes.delete', body: { id: codeId } })
  })
})

describe('共有', () => {
  test('発行済みのトークンと期限を送る', async () => {
    const { sent, api } = recording({
      token: 'abcdefghjkmnpqrstvwxyz0123456789',
      code_id: 'cd_0123456789abcdefghjkmnpq',
      permission: 'view',
      expires_at: null,
      created_at: 1_788_307_200,
      revoked_at: null,
    })
    const created = await api.createShare(
      { codeId, token, permission: 'view', expiresAt: undefined },
      'key-2',
    )
    expect(sent[0]?.method).toBe('shares.create')
    expect(sent[0]?.idempotencyKey).toBe('key-2')
    expect(created.ok).toBe(true)
  })

  test('取り消しはトークンだけを送る', async () => {
    const { sent, api } = recording({ token: 'abcdefghjkmnpqrstvwxyz0123456789', revoked_at: 1 })
    await api.revokeShare(token)
    expect(sent[0]).toMatchObject({ method: 'shares.revoke', body: { token } })
  })

  test('共有リンクの解決はサインインなしの経路', async () => {
    const { sent, api } = recording({ permission: 'view', code: codeWire })
    const preview = await api.resolveShare(token)
    expect(sent[0]?.method).toBe('shares.resolve')
    expect(preview.ok).toBe(true)
    if (preview.ok) expect(preview.value.permission).toBe('view')
  })
})

describe('失敗の扱い', () => {
  test('未サインインは「サインインが必要」に写す', async () => {
    const api = makeManageApi({
      call: async () => ({ ok: true, value: { ok: false, error: { kind: 'unauthorized' } } }),
    })
    const outcome = await api.deleteCode(codeId)
    expect(outcome).toEqual({ ok: false, error: { kind: 'sign_in_required' } })
  })

  test('見つからないものは資源名つきで伝える', async () => {
    const outcome = await notFound().deleteCode(codeId)
    expect(outcome).toEqual({ ok: false, error: { kind: 'not_found', resource: 'code' } })
  })

  test('通信そのものが失敗したら、その理由を残す', async () => {
    const api = makeManageApi({
      call: async () => ({ ok: false, error: { kind: 'transport', detail: 'boom' } }),
    })
    const outcome = await api.deleteCode(codeId)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error.kind).toBe('unavailable')
  })

  /** `kind` に UI 文言を混ぜない。文言への変換はこの 1 箇所だけ。 */
  test('どの失敗にも、次にどうすればよいかが分かる文言がある', () => {
    const failures = [
      { kind: 'sign_in_required' },
      { kind: 'not_found', resource: 'code' },
      { kind: 'forbidden' },
      { kind: 'limit_exceeded', limit: 'code.name', max: 200, actual: 201 },
      { kind: 'unavailable', detail: 'internal' },
    ] as const
    for (const failure of failures) {
      expect(describeManageFailure(failure).length).toBeGreaterThan(0)
    }
  })
})
