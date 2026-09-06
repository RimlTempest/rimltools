import type { ComponentPropsWithoutRef, MouseEvent } from 'react'

const BUTTON_VARIANT = {
  primary: 'primary',
  secondary: 'secondary',
  danger: 'danger',
} as const

export type ButtonVariant = (typeof BUTTON_VARIANT)[keyof typeof BUTTON_VARIANT]

type NativeButtonProps = Omit<ComponentPropsWithoutRef<'button'>, 'className' | 'aria-busy'>

type ButtonProps = NativeButtonProps & {
  readonly variant?: ButtonVariant
  /** 処理中。押せなくなるが、フォーカスは保つ。 */
  readonly busy?: boolean
}

/**
 * ネイティブの `<button>`。可視テキストがそのままアクセシブル名になる。
 *
 * 処理中は `disabled` ではなく `aria-disabled` を使う。`disabled` にすると
 * フォーカスを失い、状態が変わったことが読み上げられないため。
 */
export const Button = ({
  variant = BUTTON_VARIANT.primary,
  busy = false,
  type = 'button',
  onClick,
  children,
  ...rest
}: ButtonProps) => {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (busy) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }

  return (
    <button
      {...rest}
      type={type}
      className="noter-button"
      data-variant={variant}
      aria-busy={busy}
      aria-disabled={busy || rest['aria-disabled'] === true}
      onClick={handleClick}
    >
      {children}
    </button>
  )
}
