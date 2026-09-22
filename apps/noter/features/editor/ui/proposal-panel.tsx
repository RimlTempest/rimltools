import { useMemo } from 'react'
import { Button, VisuallyHidden } from '@noter/ui'
import type { DiffLine } from '../core/diff-lines.ts'
import { diffLines } from '../core/diff-lines.ts'

type ProposalPanelProps = {
  readonly open: boolean
  /** いまの本文。 */
  readonly current: string
  /** 提案された本文（全文）。 */
  readonly proposed: string
  /** 「適用」を押したときだけ呼ばれる。本文の差し替えは呼び出し側の仕事。 */
  readonly onApply: (text: string) => void
  readonly onDiscard: () => void
}

/** 読み上げに載せる語。色と記号だけで「追加／削除」を伝えない（1.4.1）。 */
const KIND_LABEL: { readonly [K in DiffLine['kind']]: string } = {
  equal: '',
  inserted: '追加',
  deleted: '削除',
}

const MARKER: { readonly [K in DiffLine['kind']]: string } = {
  equal: ' ',
  inserted: '+',
  deleted: '-',
}

const DiffText = ({ line }: { readonly line: DiffLine }) => {
  if (line.kind === 'inserted') return <ins>{line.text}</ins>
  if (line.kind === 'deleted') return <del>{line.text}</del>
  return <span>{line.text}</span>
}

/**
 * 編集の提案を差分で見せる側面パネル（ADR-0012）。
 *
 * **ここは文書に触れない。** `Y.Doc` も CodeMirror も知らず、押された
 * ことだけを `onApply` で伝える。適用は普段の編集と同じ経路
 * （CodeMirror のトランザクション）を通す必要があるため、その責任は
 * `EditorScreen` が持つ。
 *
 * `<dialog>` にしないのは、提案を見ながら本文を読み返せるようにするため
 * （モーダルにすると背後が触れなくなる）。
 */
export const ProposalPanel = ({
  open,
  current,
  proposed,
  onApply,
  onDiscard,
}: ProposalPanelProps) => {
  const lines = useMemo(() => diffLines(current, proposed), [current, proposed])
  const changed = lines.some((line) => line.kind !== 'equal')

  if (!open) return undefined

  return (
    <aside className="noter-proposal" aria-label="編集の提案">
      <h2 className="noter-proposal__title">編集の提案</h2>
      <p className="noter-proposal__lead">
        {changed
          ? '適用するまで文書は変わりません。中身を確かめてから決めてください。'
          : '提案された本文はいまの本文と同じです。適用しても文書は変わりません。'}
      </p>

      {changed ? (
        <ol className="noter-proposal__diff">
          {lines.map((line, index) => (
            <li key={`${String(index)}:${line.kind}`} data-diff={line.kind}>
              <span className="noter-proposal__marker" aria-hidden="true">
                {MARKER[line.kind]}
              </span>
              {line.kind === 'equal' ? undefined : (
                <VisuallyHidden>{`${KIND_LABEL[line.kind]}: `}</VisuallyHidden>
              )}
              <DiffText line={line} />
            </li>
          ))}
        </ol>
      ) : undefined}

      <div className="noter-proposal__actions">
        {changed ? <Button onClick={() => onApply(proposed)}>提案を適用</Button> : undefined}
        <Button variant="secondary" onClick={onDiscard}>
          提案を破棄
        </Button>
      </div>
    </aside>
  )
}
