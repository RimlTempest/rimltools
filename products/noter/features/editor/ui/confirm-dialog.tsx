import { useEffect, useRef } from 'react'
import { Button } from '@noter/ui'

type ConfirmDialogProps = {
  readonly open: boolean
  readonly title: string
  /** 何が起きるかを先に伝える。押してから気付かせない。 */
  readonly description: string
  readonly confirmLabel: string
  /** 「そうではなくこちら」という 2 つ目の選択肢。取り込みの「挿入」で使う。 */
  readonly alternative?: { readonly label: string; readonly onSelect: () => void }
  readonly busy?: boolean
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

/**
 * 取り消せない操作の前に 1 度だけ確かめる（AAA 3.3.4 / 3.3.6）。
 *
 * `<dialog>` + `showModal()` にして、フォーカストラップと Esc を
 * ブラウザに任せる（`ShareDialog` と同じ方針）。
 */
export const ConfirmDialog = ({
  open,
  title,
  description,
  confirmLabel,
  alternative,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null)

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

  return (
    <dialog className="noter-confirm" ref={dialogRef} aria-label={title} onClose={onCancel}>
      {open ? (
        <div className="noter-confirm__body">
          <p>{description}</p>
          <div className="noter-confirm__actions">
            <Button variant="danger" busy={busy} onClick={onConfirm}>
              {confirmLabel}
            </Button>
            {alternative === undefined ? undefined : (
              <Button variant="secondary" onClick={alternative.onSelect}>
                {alternative.label}
              </Button>
            )}
            <Button variant="secondary" onClick={onCancel}>
              やめる
            </Button>
          </div>
        </div>
      ) : undefined}
    </dialog>
  )
}
