import { describe, expect, test } from 'bun:test'
import type { ManageFailure } from '@qrcc/manage/server'
import { savedCode } from '../testing-fakes.ts'
import {
  describeSharePermission,
  describeSharedFailure,
  readShareToken,
  toRenderRequest,
  toSharedFailure,
} from './share-view.ts'

const TOKEN = 'abcdefghjkmnpqrstvwxyz0123456789'

describe('URL から受け取ったトークン', () => {
  test('32 文字の Crockford base32 なら共有トークンとして読める', () => {
    const token = readShareToken(TOKEN)
    expect(token.ok ? String(token.value) : token.error.kind).toBe(TOKEN)
  })

  test('短い・記号が混じるものは「形が違う」として断る', () => {
    for (const raw of ['', 'abc', `${TOKEN}!`, TOKEN.replace('a', 'u')]) {
      const token = readShareToken(raw)
      expect(token.ok ? 'よめた' : token.error.kind).toBe('malformed_token')
    }
  })
})

const failure = (manage: ManageFailure) => toSharedFailure(manage)

describe('解決に失敗した理由', () => {
  test('期限切れは「無い・取り消された」と区別する', () => {
    expect(failure({ kind: 'not_found', resource: 'share_expired' })).toEqual({ kind: 'expired' })
    expect(failure({ kind: 'not_found', resource: 'share' })).toEqual({ kind: 'gone' })
  })

  test('通信できないときは、リンクのせいにしない', () => {
    expect(failure({ kind: 'unavailable', detail: 'internal' })).toEqual({
      kind: 'unavailable',
      detail: 'internal',
    })
  })

  test('公開メソッドなので、権限の失敗が返ったら技術的な不具合として扱う', () => {
    expect(failure({ kind: 'sign_in_required' })).toEqual({
      kind: 'unavailable',
      detail: 'sign_in_required',
    })
    expect(failure({ kind: 'forbidden' })).toEqual({ kind: 'unavailable', detail: 'forbidden' })
  })
})

describe('失敗の案内', () => {
  const guidances = [
    describeSharedFailure({ kind: 'malformed_token' }),
    describeSharedFailure({ kind: 'gone' }),
    describeSharedFailure({ kind: 'expired' }),
    describeSharedFailure({ kind: 'unavailable', detail: 'internal' }),
  ]

  test('見出しも理由も次の一手も、すべて違う文言になる', () => {
    expect(new Set(guidances.map((guidance) => guidance.heading)).size).toBe(guidances.length)
    expect(new Set(guidances.map((guidance) => guidance.reason)).size).toBe(guidances.length)
    expect(new Set(guidances.map((guidance) => guidance.nextStep)).size).toBe(guidances.length)
  })

  test('どれも「次にどうすればよいか」で終わる', () => {
    for (const guidance of guidances) {
      expect(guidance.nextStep.length).toBeGreaterThan(0)
      expect(guidance.heading.length).toBeGreaterThan(0)
    }
  })

  test('期限切れは期限のこと、形式違いは URL のことを伝える', () => {
    expect(describeSharedFailure({ kind: 'expired' }).reason).toContain('期限')
    expect(describeSharedFailure({ kind: 'malformed_token' }).reason).toContain('URL')
    expect(describeSharedFailure({ kind: 'gone' }).reason).toContain('取り消')
  })
})

describe('このリンクでできることの説明', () => {
  test('見るだけと編集できるで文言が変わる', () => {
    expect(describeSharePermission('view')).not.toBe(describeSharePermission('edit'))
  })

  test('編集できるリンクでも、この画面では見るだけだと伝える', () => {
    expect(describeSharePermission('edit')).toContain('この画面')
  })
})

describe('保存されたコードから生成を頼む', () => {
  test('保存されている内容をそのまま渡し、SVG で受け取る', () => {
    const code = savedCode('pq', '在庫ラベル')
    expect(toRenderRequest(code)).toEqual({
      payload: code.payload,
      symbology: code.symbology,
      style: code.style,
      output: 'svg',
    })
  })
})
