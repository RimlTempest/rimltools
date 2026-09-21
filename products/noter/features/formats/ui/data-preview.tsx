/**
 * yaml / toml / json のプレビュー。
 *
 * 「整形したテキスト」と「ツリー」の 2 通り。JSON は入れ子が深くなりやすい
 * ので既定をツリーにし、yaml / toml は元の見た目に近いテキストを既定にする
 * （docs/design/ux.md §4.2）。
 *
 * 畳み込みは `<details>` に任せる。JS が無くても開閉でき、キーボードでも
 * 操作できる（ARIA の tree ロールを自作しない）。
 *
 * テキストの見出しは `<figcaption>`。`<code>` や `<pre>` は暗黙のロールを
 * 持たないので `aria-label` を付けても無視される（axe も違反として拾う）。
 */
import { Button, VisuallyHidden } from '@noter/ui'
import { useMemo, useState } from 'react'
import type { DataDocumentKind } from '../contract/data-kind.ts'
import type { JsonValue } from '../contract/json-value.ts'
import { formatDocument } from '../core/format.ts'
import { parseDocument } from '../core/parse.ts'

type DataPreviewProps = {
  readonly kind: DataDocumentKind
  readonly text: string
  /** ランドマークの名前。1 画面に複数のプレビューを置くときだけ変える。 */
  readonly label?: string
}

type PreviewMode = 'tree' | 'text'

/** 開いた状態で描く深さ。これより深いところは畳んでおく。 */
const OPEN_DEPTH = 2

export const DataPreview = ({ kind, text, label = 'プレビュー' }: DataPreviewProps) => {
  const [mode, setMode] = useState<PreviewMode>(kind === 'json' ? 'tree' : 'text')
  const parsed = useMemo(() => parseDocument(kind, text), [kind, text])
  const formatted = useMemo(() => formatDocument(kind, text), [kind, text])

  return (
    <section className="noter-data-preview" aria-label={label}>
      <div className="noter-data-preview__modes">
        <Button
          variant="secondary"
          aria-pressed={mode === 'tree'}
          onClick={() => {
            setMode('tree')
          }}
        >
          ツリーで表示
        </Button>
        <Button
          variant="secondary"
          aria-pressed={mode === 'text'}
          onClick={() => {
            setMode('text')
          }}
        >
          テキストで表示
        </Button>
      </div>
      {!parsed.ok || parsed.value.kind !== 'data' ? (
        <>
          <p className="noter-data-preview__error">
            構文エラーがあるため、整形して表示できません。問題パネルを開いて、指摘された行を直してください。
          </p>
          <figure>
            <VisuallyHidden as="figcaption">本文</VisuallyHidden>
            <pre className="noter-data-preview__text">
              <code>{text}</code>
            </pre>
          </figure>
        </>
      ) : mode === 'tree' ? (
        <JsonTreeRoot value={parsed.value.value} />
      ) : (
        <figure>
          <VisuallyHidden as="figcaption">整形した本文</VisuallyHidden>
          <pre className="noter-data-preview__text">
            <code>{formatted.ok ? formatted.value : text}</code>
          </pre>
        </figure>
      )}
    </section>
  )
}

const JsonTreeRoot = ({ value }: { readonly value: JsonValue }) => {
  const children = childEntries(value)
  if (children === undefined) {
    return (
      <p className="noter-json-tree__scalar">
        <JsonScalar value={value} />
      </p>
    )
  }
  return (
    <ul className="noter-json-tree">
      {children.map(([key, child]) => (
        <JsonTreeItem key={key} name={key} value={child} depth={0} />
      ))}
    </ul>
  )
}

type JsonTreeItemProps = {
  readonly name: string
  readonly value: JsonValue
  readonly depth: number
}

const JsonTreeItem = ({ name, value, depth }: JsonTreeItemProps) => {
  const children = childEntries(value)
  if (children === undefined || children.length === 0) {
    return (
      <li className="noter-json-tree__leaf">
        <span className="noter-json-tree__key">{name}</span>
        {children === undefined ? (
          <JsonScalar value={value} />
        ) : (
          <span className="noter-json-tree__empty">
            {Array.isArray(value) ? '空の配列' : '空のオブジェクト'}
          </span>
        )}
      </li>
    )
  }
  return (
    <li className="noter-json-tree__branch">
      <details open={depth < OPEN_DEPTH}>
        <summary>
          <span className="noter-json-tree__key">{name}</span>
          <span className="noter-json-tree__meta">
            {Array.isArray(value) ? `${children.length} 件の配列` : `${children.length} 項目`}
          </span>
        </summary>
        <ul className="noter-json-tree">
          {children.map(([key, child]) => (
            <JsonTreeItem key={key} name={key} value={child} depth={depth + 1} />
          ))}
        </ul>
      </details>
    </li>
  )
}

const JsonScalar = ({ value }: { readonly value: JsonValue }) => (
  <span className="noter-json-tree__value" data-type={scalarType(value)}>
    {formatScalar(value)}
  </span>
)

const scalarType = (value: JsonValue): string => {
  if (value === null) return 'null'
  return typeof value === 'object' ? 'object' : typeof value
}

/** 文字列は引用符付きで見せる（数値や true と見分けられるようにする）。 */
const formatScalar = (value: JsonValue): string => {
  if (value === null) return 'null'
  if (typeof value === 'string') return `"${value}"`
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  return JSON.stringify(value)
}

/** 子要素の一覧。スカラーなら undefined。 */
const childEntries = (value: JsonValue): readonly (readonly [string, JsonValue])[] | undefined => {
  if (Array.isArray(value)) return value.map((item, index) => [String(index), item])
  if (typeof value === 'object' && value !== null) return Object.entries(value)
  return undefined
}
