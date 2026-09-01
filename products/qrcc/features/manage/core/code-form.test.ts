import { describe, expect, test } from 'bun:test'
import {
  parseCodeId,
  parseFolderId,
  parseHexColor,
  parseHttpUrl,
  parseNonEmptyText,
  parseUserId,
} from '@qrcc/contract'
import type { SavedCode } from '@qrcc/manage/contract'
import { NEW_CODE_FORM, buildCodeDraft, toCodeForm, toRestoreDraft } from './code-form.ts'

const expectOk = <T>(
  result: { readonly ok: true; readonly value: T } | { readonly ok: false },
): T => {
  if (!result.ok) throw new Error('fixture is invalid')
  return result.value
}

const codeId = expectOk(parseCodeId('cd_0123456789abcdefghjkmnpq'))
const folderId = expectOk(parseFolderId('fld_0123456789abcdefghjkmnpq'))

const saved: SavedCode = {
  id: codeId,
  ownerId: expectOk(parseUserId('usr_0123456789abcdefghjkmnpq')),
  folderId,
  name: expectOk(parseNonEmptyText('在庫ラベル')),
  payload: { kind: 'url', url: expectOk(parseHttpUrl('https://qrcc.riml4i.com')) },
  symbology: { kind: 'qr', ec: 'Q' },
  style: {
    foreground: expectOk(parseHexColor('#112233')),
    background: { kind: 'solid', color: expectOk(parseHexColor('#ffffff')) },
    scale: 8,
    quiet_zone: 6,
    module_shape: 'dot',
    bar_height: 30,
    human_readable: false,
  },
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-02T00:00:00.000Z'),
}

describe('buildCodeDraft', () => {
  test('名前と内容を入れると保存できる形になる', () => {
    const draft = buildCodeDraft(codeId, {
      ...NEW_CODE_FORM,
      name: '  在庫ラベル  ',
      content: { kind: 'url', url: 'https://qrcc.riml4i.com' },
    })
    expect(draft.ok).toBe(true)
    if (!draft.ok) return
    expect(String(draft.value.name)).toBe('在庫ラベル')
    expect(draft.value.payload).toEqual({
      kind: 'url',
      url: expectOk(parseHttpUrl('https://qrcc.riml4i.com')),
    })
    expect(draft.value.symbology).toEqual({ kind: 'qr', ec: 'M' })
  })

  test('名前が空なら断る（何のコードか分からなくなる）', () => {
    const draft = buildCodeDraft(codeId, { ...NEW_CODE_FORM, name: '   ' })
    expect(draft.ok).toBe(false)
    if (!draft.ok) expect(draft.error.field).toBe('名前')
  })

  test('URL が URL でなければ断る', () => {
    const draft = buildCodeDraft(codeId, {
      ...NEW_CODE_FORM,
      name: 'テスト',
      content: { kind: 'url', url: 'javascript:alert(1)' },
    })
    expect(draft.ok).toBe(false)
    if (!draft.ok) expect(draft.error.field).toBe('リンク先の URL')
  })

  test('テキストが空なら断る', () => {
    const draft = buildCodeDraft(codeId, {
      ...NEW_CODE_FORM,
      name: 'テスト',
      content: { kind: 'text', text: '' },
    })
    expect(draft.ok).toBe(false)
  })

  test('色の指定が壊れていれば断る', () => {
    const draft = buildCodeDraft(codeId, {
      ...NEW_CODE_FORM,
      name: 'テスト',
      foreground: 'black',
    })
    expect(draft.ok).toBe(false)
    if (!draft.ok) expect(draft.error.field).toBe('色')
  })

  test('1D コードは誤り訂正レベルを持たない', () => {
    const draft = buildCodeDraft(codeId, {
      ...NEW_CODE_FORM,
      name: 'テスト',
      content: { kind: 'text', text: '750103131130' },
      symbologyKind: 'ean13',
    })
    expect(draft.ok).toBe(true)
    if (draft.ok) expect(draft.value.symbology).toEqual({ kind: 'ean13' })
  })
})

describe('toCodeForm', () => {
  test('保存されたコードを編集できる形に開く', () => {
    const form = toCodeForm(saved)
    expect(form.name).toBe('在庫ラベル')
    expect(form.content).toEqual({ kind: 'url', url: 'https://qrcc.riml4i.com' })
    expect(form.symbologyKind).toBe('qr')
    expect(form.qrEc).toBe('Q')
    expect(form.folderId).toBe(folderId)
    expect(form.scale).toBe(8)
    expect(form.foreground).toBe('#112233')
  })

  /**
   * 画面で編集できるのはテキストと URL だけ。それ以外（Wi-Fi など）は
   * 触らずにそのまま保つ — 開いただけで内容が消えるのが一番困る。
   */
  test('画面で編集できない内容は、そのまま保って往復させる', () => {
    const wifi = {
      ...saved,
      payload: {
        kind: 'wifi' as const,
        ssid: expectOk(parseNonEmptyText('home')),
        auth: { kind: 'nopass' as const },
        hidden: false,
      },
    }
    const form = toCodeForm(wifi)
    expect(form.content).toEqual({ kind: 'other', payload: wifi.payload })
    const draft = buildCodeDraft(codeId, form)
    expect(draft.ok).toBe(true)
    if (draft.ok) expect(draft.value.payload).toEqual(wifi.payload)
  })

  /** 見た目のうち画面に出さない項目（静寂域など）を、開いて保存するだけで失わない。 */
  test('画面に出さない見た目の設定も往復で失わない', () => {
    const draft = buildCodeDraft(codeId, toCodeForm(saved))
    expect(draft.ok).toBe(true)
    if (!draft.ok) return
    expect(draft.value.style.quiet_zone).toBe(6)
    expect(draft.value.style.module_shape).toBe('dot')
    expect(draft.value.style.bar_height).toBe(30)
    expect(draft.value.style.human_readable).toBe(false)
  })
})

describe('toRestoreDraft', () => {
  /** 取り消しは「同じ id で作り直す」。共有リンクの URL が変わらないため。 */
  test('削除したコードを同じ id で作り直せる形にする', () => {
    const draft = toRestoreDraft(saved)
    expect(draft.id).toBe(saved.id)
    expect(draft.name).toBe(saved.name)
    expect(draft.payload).toEqual(saved.payload)
    expect(draft.symbology).toEqual(saved.symbology)
    expect(draft.style).toEqual(saved.style)
    expect(draft.folderId).toBe(folderId)
  })
})
