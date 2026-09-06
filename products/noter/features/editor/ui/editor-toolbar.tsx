import type { ChangeEvent } from 'react'
import { useId, useState } from 'react'
import { FILE_EXTENSION } from '@noter/contract'
import type { DocumentKind } from '@noter/contract'
import { Button, VisuallyHidden } from '@noter/ui'
import { describeImportError } from '../contract/import-error.ts'
import type { ViewMode } from '../contract/view-mode.ts'
import { byteLength, checkImportSize } from '../core/import-guard.ts'
import { ConfirmDialog } from './confirm-dialog.tsx'
import { ViewSwitch } from './view-switch.tsx'

/** 取り込んだ本文をどこに置くか（docs/design/ux.md §4.2 取り込み）。 */
export type ImportPlacement = 'replace' | 'cursor'

type Problems = {
  readonly count: number
  readonly expanded: boolean
  readonly onToggle: () => void
}

type EditorToolbarProps = {
  readonly mode: ViewMode
  readonly onModeChange: (mode: ViewMode) => void
  /** 種別。取り込みで受け付ける拡張子に使う。 */
  readonly kind?: DocumentKind
  /** 編集できる人にだけ渡す。渡されないと取り込みは出ない。 */
  readonly onImport?: (text: string, placement: ImportPlacement) => void
  readonly onDownload: () => void
  readonly onCopyText: () => void
  readonly onCopyRawUrl: () => void
  readonly rawUrl: string
  /** 画面にただ 1 つある live region へ流す。 */
  readonly onNotice: (message: string) => void
  /** plan 006 が差し込む。未指定なら描画しない。 */
  readonly formatAction?: () => void
  /** plan 006 が差し込む。未指定なら描画しない。 */
  readonly problems?: Problems
  /** 既定はブラウザの `File.text()`。テストでは偽物を渡せる。 */
  readonly readFile?: (file: File) => Promise<string>
}

const defaultReadFile = (file: File): Promise<string> => file.text()

/**
 * ツールバー（docs/design/ux.md §4.2）。
 *
 * 4 種別で並びを変えない。違いはプレビューと診断だけ（§2 原則 4）。
 * 「整形」「問題」は plan 006 が `features/formats` から差し込む口で、
 * 渡されなければ何も描画しない。
 *
 * `role="toolbar"` は使わない。矢印キーでの移動（roving tabindex）まで
 * 実装しないと約束を破ることになるので、素直に `group` で括っている。
 */
export const EditorToolbar = ({
  mode,
  onModeChange,
  kind,
  onImport,
  onDownload,
  onCopyText,
  onCopyRawUrl,
  rawUrl,
  onNotice,
  formatAction,
  problems,
  readFile = defaultReadFile,
}: EditorToolbarProps) => {
  const fileId = useId()
  const [staged, setStaged] = useState<string | undefined>(undefined)

  const choose = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    // 同じファイルをもう一度選べるようにする（change が飛ばなくなるため）
    event.target.value = ''
    if (file === undefined) return

    const text = await readFile(file)
    const size = checkImportSize(byteLength(text))
    if (!size.ok) {
      onNotice(describeImportError(size.error))
      return
    }
    setStaged(text)
  }

  const place = (placement: ImportPlacement) => (): void => {
    const text = staged
    setStaged(undefined)
    if (text === undefined) return
    onImport?.(text, placement)
  }

  return (
    <div className="noter-toolbar">
      <ViewSwitch mode={mode} onChange={onModeChange} />

      {formatAction === undefined ? undefined : (
        <Button variant="secondary" onClick={formatAction}>
          整形
        </Button>
      )}

      {problems === undefined ? undefined : (
        <button
          type="button"
          className="noter-toolbar__problems"
          aria-expanded={problems.expanded}
          onClick={problems.onToggle}
        >
          {`問題 ${problems.count} 件`}
        </button>
      )}

      {onImport === undefined ? undefined : (
        <div className="noter-toolbar__import">
          <label className="noter-toolbar__file" htmlFor={fileId}>
            ファイルを取り込む
          </label>
          <input
            id={fileId}
            type="file"
            accept={kind === undefined ? undefined : `.${FILE_EXTENSION[kind]},text/plain`}
            onChange={(event) => void choose(event)}
          />
        </div>
      )}

      <fieldset className="noter-toolbar__export">
        <VisuallyHidden as="legend">書き出し</VisuallyHidden>
        <Button variant="secondary" onClick={onDownload}>
          端末に保存
        </Button>
        <Button variant="secondary" onClick={onCopyText}>
          本文をコピー
        </Button>
        <Button variant="secondary" onClick={onCopyRawUrl}>
          raw の URL をコピー
        </Button>
        <a href={rawUrl}>本文をそのまま開く</a>
      </fieldset>

      <ConfirmDialog
        open={staged !== undefined}
        title="取り込む"
        description="読み込んだ内容を、いまの本文と置き換えますか。カーソル位置に差し込むこともできます。"
        confirmLabel="置き換える"
        alternative={{ label: 'カーソル位置に挿入', onSelect: place('cursor') }}
        onConfirm={place('replace')}
        onCancel={() => setStaged(undefined)}
      />
    </div>
  )
}
