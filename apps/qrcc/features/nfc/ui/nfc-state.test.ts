import { describe, expect, test } from 'bun:test'
import { parseHttpUrl } from '@qrcc/contract'
import type { NfcRecord } from '../contract/index.ts'
import { INITIAL_NFC_STATE, reduceNfc } from './nfc-state.ts'

const urlRecord = (): NfcRecord => {
  const parsed = parseHttpUrl('https://qrcc.riml4i.com')
  if (!parsed.ok) throw new Error('fixture url must be valid')
  return { kind: 'url', url: parsed.value }
}

describe('reduceNfc', () => {
  test('初期状態は編集中で、記録は無い', () => {
    expect(INITIAL_NFC_STATE.step).toBe('editing')
    expect(INITIAL_NFC_STATE.record).toBeUndefined()
  })

  test('確認を求めると confirming に進み、内容を保持する', () => {
    const state = reduceNfc(INITIAL_NFC_STATE, {
      kind: 'confirm_requested',
      record: urlRecord(),
    })
    expect(state.step).toBe('confirming')
    expect(state.record).toEqual(urlRecord())
  })

  test('書き込みを求めると writing に進み、読み上げ文が出る', () => {
    const confirming = reduceNfc(INITIAL_NFC_STATE, {
      kind: 'confirm_requested',
      record: urlRecord(),
    })
    const writing = reduceNfc(confirming, { kind: 'write_requested' })
    expect(writing.step).toBe('writing')
    expect(writing.message).toContain('タグを近づけてください')
  })

  test('成功すると done に進み、読み上げ文が出る', () => {
    const state = reduceNfc(
      { step: 'writing', record: urlRecord(), message: undefined },
      { kind: 'write_succeeded' },
    )
    expect(state.step).toBe('done')
    expect(state.message).toContain('書き込みました')
  })

  test('失敗すると confirming に戻り、内容は失わない（やり直せる）', () => {
    const state = reduceNfc(
      { step: 'writing', record: urlRecord(), message: undefined },
      { kind: 'write_failed', failure: { kind: 'no_tag' } },
    )
    expect(state.step).toBe('confirming')
    expect(state.record).toEqual(urlRecord())
    expect(state.message).toContain('タグが見つかりませんでした')
  })

  test('内容の変更を求めると editing に戻る', () => {
    const state = reduceNfc(
      { step: 'confirming', record: urlRecord(), message: undefined },
      { kind: 'edit_requested' },
    )
    expect(state.step).toBe('editing')
  })

  test('やり直しを求めると初期状態に戻る', () => {
    const state = reduceNfc(
      { step: 'done', record: urlRecord(), message: '書き込みました。' },
      { kind: 'reset_requested' },
    )
    expect(state).toEqual(INITIAL_NFC_STATE)
  })
})
