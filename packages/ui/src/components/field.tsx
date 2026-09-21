import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { useId } from 'react'

/** 実装側が制御する属性は受け取らない（正しい紐付けを壊せないようにする）。 */
type Reserved = 'className' | 'id' | 'aria-describedby' | 'aria-invalid'

type CommonFieldProps = {
  /** 可視ラベル。`aria-label` で置き換えない（音声操作で押せなくなる）。 */
  readonly label: string
  readonly hint?: string
  /** 設定されている間だけ `aria-invalid` が立つ。 */
  readonly error?: string
}

/**
 * `control` の値で受け付ける属性が変わるので、判別可能ユニオンで表す。
 * `input` に `rows` を、`textarea` に `type` を渡すことは型で防がれる。
 */
type FieldProps =
  | (CommonFieldProps & { readonly control?: 'input' } & Omit<
        ComponentPropsWithoutRef<'input'>,
        Reserved
      >)
  | (CommonFieldProps & { readonly control: 'textarea' } & Omit<
        ComponentPropsWithoutRef<'textarea'>,
        Reserved
      >)

/**
 * ラベル・補足・エラーを 1 つの入力に正しく結びつける。
 *
 * - `label` と入力は `htmlFor`/`id` で結ぶ（プレースホルダをラベルにしない）
 * - 補足とエラーは `aria-describedby` で入力から辿れるようにする
 * - `useId` を使うので、同じ画面に何個置いても id が衝突しない
 */
export const makeField = (prefix: string) => {
  const Field = (props: FieldProps) => {
    const baseId = useId()
    const controlId = `${baseId}-control`
    const hintId = `${baseId}-hint`
    const errorId = `${baseId}-error`

    const { label, hint, error } = props
    const describedBy = [
      hint === undefined ? undefined : hintId,
      error === undefined ? undefined : errorId,
    ]
      .filter((id) => id !== undefined)
      .join(' ')

    const shared = {
      id: controlId,
      className: `${prefix}-field__control`,
      ...(describedBy === '' ? {} : { 'aria-describedby': describedBy }),
      ...(error === undefined ? {} : { 'aria-invalid': true }),
    }

    const wrap = (control: ReactNode) => (
      <div className={`${prefix}-field`}>
        <label className={`${prefix}-field__label`} htmlFor={controlId}>
          {label}
        </label>
        {hint === undefined ? undefined : (
          <span className={`${prefix}-field__hint`} id={hintId}>
            {hint}
          </span>
        )}
        {control}
        {error === undefined ? undefined : (
          <span className={`${prefix}-field__error`} id={errorId}>
            {error}
          </span>
        )}
      </div>
    )

    if (props.control === 'textarea') {
      const { label: _label, hint: _hint, error: _error, control: _control, ...rest } = props
      return wrap(<textarea {...rest} {...shared} />)
    }
    const { label: _label, hint: _hint, error: _error, control: _control, ...rest } = props
    return wrap(<input {...rest} {...shared} />)
  }
  return Field
}
