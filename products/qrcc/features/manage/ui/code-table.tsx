import { SYMBOLOGY_META } from '@qrcc/generate/contract'
import type { CodeSort, CodeSummary, Folder, SortColumn } from '@qrcc/manage/contract'
import { ariaSortFor } from '@qrcc/manage/core'
import type { CodeLinkRenderer } from './manage-deps.tsx'
import { defaultRenderLink } from './manage-deps.tsx'
import { codePath, folderNameOf, formatDateTime } from './format.ts'

type CodeTableProps = {
  readonly items: readonly CodeSummary[]
  readonly folders: readonly Folder[]
  readonly sort: CodeSort
  readonly onSort: (column: SortColumn) => void
  readonly onDelete: (item: CodeSummary) => void
  readonly renderLink?: CodeLinkRenderer
}

/** 並べ替えの向きを目でも示す。色だけに頼らない（1.4.1）。 */
const SORT_MARK = { ascending: '▲', descending: '▼', none: '' } as const

type SortableHeaderProps = {
  readonly column: SortColumn
  readonly label: string
  readonly sort: CodeSort
  readonly onSort: (column: SortColumn) => void
}

const SortableHeader = ({ column, label, sort, onSort }: SortableHeaderProps) => {
  const direction = ariaSortFor(column, sort)
  return (
    <th scope="col" aria-sort={direction}>
      <button type="button" className="qrcc-code-table__sort" onClick={() => onSort(column)}>
        {label}
        <span aria-hidden="true" className="qrcc-code-table__mark">
          {SORT_MARK[direction]}
        </span>
      </button>
    </th>
  )
}

/**
 * 保存したコードの一覧。
 *
 * `<table>` + `<caption>` にして、支援技術に「何件あるか」「どの列か」を
 * 伝える。並べ替え可能な列は `aria-sort` を持つ。
 * 名前の列は行の見出し（`th scope="row"`）なので、セルを読み上げるときに
 * 「どのコードの話か」が毎回添えられる。
 */
export const CodeTable = ({
  items,
  folders,
  sort,
  onSort,
  onDelete,
  renderLink = defaultRenderLink,
}: CodeTableProps) => (
  <div className="qrcc-code-table__scroll">
    <table className="qrcc-code-table">
      <caption>保存したコード（{items.length} 件）</caption>
      <thead>
        <tr>
          <SortableHeader column="name" label="名前" sort={sort} onSort={onSort} />
          <th scope="col">種類</th>
          <th scope="col">フォルダ</th>
          <SortableHeader column="updated" label="更新日時" sort={sort} onSort={onSort} />
          <th scope="col">操作</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <th scope="row">{renderLink({ to: codePath(item.id), label: item.name })}</th>
            <td>{SYMBOLOGY_META[item.symbologyKind].label}</td>
            <td>{folderNameOf(folders, item.folderId)}</td>
            <td>
              <time dateTime={item.updatedAt.toISOString()}>{formatDateTime(item.updatedAt)}</time>
            </td>
            <td>
              {/* 行ごとのボタンは、名前を含めないとどれを消すのか分からない */}
              <button
                type="button"
                className="qrcc-code-table__delete"
                onClick={() => onDelete(item)}
              >
                「{item.name}」を削除
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)
