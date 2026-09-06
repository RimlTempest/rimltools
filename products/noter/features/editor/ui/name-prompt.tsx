import type { FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { MAX_DISPLAY_NAME } from '@noter/contract'
import { Button, Field } from '@noter/ui'

type NamePromptProps = {
  readonly open: boolean
  /** 既定の候補（`guestDisplayName(actorId)`）。 */
  readonly defaultName: string
  readonly onDecide: (name: string) => void
  readonly onSkip: () => void
}

/**
 * 共有リンクで入った人に名前を 1 度だけ聞く（docs/design/ux.md §6.2）。
 *
 * **名乗らなくても編集できる。** 聞くのは、参加者一覧とカーソルのラベルで
 * 誰が誰か分かるようにするためだけ。一度決めたらこの端末では聞かない
 * （AAA 3.3.7 冗長な入力）。
 *
 * `<dialog>` + `showModal()` にして、フォーカストラップと Esc を
 * ブラウザに任せる（`ShareDialog` と同じ方針）。
 */
export const NamePrompt = ({ open, defaultName, onDecide, onSkip }: NamePromptProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState(defaultName)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return
    if (open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    } else if (typeof dialog.close === 'function') {
      dialog.close()
    } else {
      dialog.removeAttribute('open')
    }
  }, [open])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed === '') {
      onSkip()
      return
    }
    onDecide(trimmed)
  }

  return (
    <dialog className="noter-name-prompt" ref={dialogRef} aria-label="表示名を決める">
      {open ? (
        <form onSubmit={submit}>
          <p>一緒に編集している人に、どの名前で見えるようにしますか。</p>
          <Field
            label="表示名"
            hint={`あとから アカウント設定 で変えられます。${MAX_DISPLAY_NAME} 文字以内。`}
            name="displayName"
            value={name}
            maxLength={MAX_DISPLAY_NAME}
            autoComplete="nickname"
            onChange={(event) => setName(event.target.value)}
          />
          <div className="noter-name-prompt__actions">
            <Button type="submit">この名前で参加</Button>
            <Button variant="secondary" onClick={onSkip}>
              名乗らずに続ける
            </Button>
          </div>
        </form>
      ) : undefined}
    </dialog>
  )
}
