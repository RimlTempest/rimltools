/**
 * 種別に合ったプレビュー。
 *
 * エディタ側で `@noter/formats` に触れるのはここだけ。画面（`EditorScreen`）は
 * プレビューを `ReactNode` として受け取るので、formats を知らないまま
 * テストできる。
 *
 * ランドマーク名は既定でプレビュー枠（`aria-label="プレビュー"`）と変える。
 * 同じ役割・同じ名前のランドマークが入れ子になると、支援技術の一覧で
 * どちらがどちらか分からなくなる。
 */
import type { DocumentKind } from '@noter/contract'
import { isDataDocumentKind } from '@noter/formats/contract'
import { DataPreview, MarkdownPreview } from '@noter/formats/ui'

type DocumentPreviewProps = {
  readonly kind: DocumentKind
  readonly text: string
  readonly label?: string
}

export const DocumentPreview = ({
  kind,
  text,
  label = '本文のプレビュー',
}: DocumentPreviewProps) =>
  isDataDocumentKind(kind) ? (
    <DataPreview kind={kind} text={text} label={label} />
  ) : (
    <MarkdownPreview markdown={text} label={label} />
  )
