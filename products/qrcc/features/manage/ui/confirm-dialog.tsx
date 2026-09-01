import { useEffect, useId, useRef } from 'react'
import { Button } from '@qrcc/ui'

type ConfirmDialogProps = {
  /** 開いているときだけ内容が入る。閉じているときは `undefined`。 */
  readonly open: boolean
  readonly title: string
  readonly description: string
  readonly confirmLabel: string
  readonly cancelLabel?: string
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

/**
 * 取り返しのつかない操作の前に挟む確認（AAA 3.3.4 / 3.3.6）。
 *
 * ネイティブの `<dialog>` を使う。`showModal()` がフォーカストラップ・
 * 背景の `inert` 化・Esc での取り消し・トップレイヤーへの表示を全部やるので、
 * `role="dialog"` を手書きしてフォーカス管理を自作しない（ARIA 第一法則）。
 *
 * 閉じたあとのフォーカスは、開いたトリガーに呼び出し側が戻す。
 */
export const ConfirmDialog = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'やめる',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="qrcc-confirm-dialog"
      aria-labelledby={titleId}
      // Esc で閉じたときも「やめる」と同じ扱いにする
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
      onClose={() => {
        if (open) onCancel()
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <p>{description}</p>
      <div className="qrcc-confirm-dialog__actions">
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  )
}
