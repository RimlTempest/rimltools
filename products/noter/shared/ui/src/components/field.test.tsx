import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { Field } from './field.tsx'

afterEach(cleanup)

describe('Field', () => {
  test('label と入力が結びつき、ラベル名で取得できる', () => {
    render(<Field label="名前" />)
    const input = screen.getByLabelText('名前')
    expect(input.tagName).toBe('INPUT')
  })

  test('プレースホルダをラベル代わりにしない（両方指定できる）', () => {
    render(<Field label="名前" placeholder="例: 在庫ラベル" />)
    const input = screen.getByLabelText('名前')
    expect(input.getAttribute('placeholder')).toBe('例: 在庫ラベル')
  })

  test('hint は aria-describedby で入力に紐づく', () => {
    render(<Field label="名前" hint="あとから変更できます" />)
    const input = screen.getByLabelText('名前')
    const describedBy = input.getAttribute('aria-describedby') ?? ''
    const hint = document.getElementById(describedBy.split(' ')[0] ?? '')
    expect(hint?.textContent).toBe('あとから変更できます')
  })

  test('error があると aria-invalid が立ち、説明にエラーが含まれる', () => {
    render(<Field label="名前" error="名前を入力してください" />)
    const input = screen.getByLabelText('名前')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ')
    const texts = ids.map((id) => document.getElementById(id)?.textContent ?? '')
    expect(texts.some((text) => text.includes('名前を入力してください'))).toBe(true)
  })

  test('error がないときは aria-invalid を付けない', () => {
    render(<Field label="名前" />)
    expect(screen.getByLabelText('名前').getAttribute('aria-invalid')).toBeNull()
  })

  test('hint と error が両方あるときは両方 describedby に載る', () => {
    render(<Field label="名前" hint="ヒント" error="エラー" />)
    const ids = (screen.getByLabelText('名前').getAttribute('aria-describedby') ?? '').split(' ')
    expect(ids.length).toBe(2)
  })

  test('複数描画しても id が衝突しない', () => {
    render(
      <>
        <Field label="名前" hint="あ" />
        <Field label="説明" hint="い" />
      </>,
    )
    const first = screen.getByLabelText('名前').getAttribute('aria-describedby')
    const second = screen.getByLabelText('説明').getAttribute('aria-describedby')
    expect(first).not.toBe(second)
  })

  test('textarea など要素を差し替えられる', () => {
    render(<Field label="内容" control="textarea" />)
    expect(screen.getByLabelText('内容').tagName).toBe('TEXTAREA')
  })
})
