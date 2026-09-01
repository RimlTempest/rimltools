import type { RenderResponse } from '@qrcc/generate/contract'
import type { StyleWithCustomProperties } from './css-custom-properties.ts'
import type { Caption, ImposedPage, LabelSheet } from '../contract/index.ts'
import { captionFor, sheetCustomProperties } from '../core/index.ts'

type LabelSheetPreviewProps = {
  readonly sheet: LabelSheet
  readonly page: ImposedPage
  readonly caption: Caption
  /** 内容 → 生成済みのコード。同じ内容は 1 度しか生成しないので Map で引く。 */
  readonly symbols: ReadonlyMap<string, RenderResponse>
}

/**
 * 台紙 1 枚ぶんのプレビュー。
 *
 * **画面と紙で同じ CSS を使う。** 面付けのスタイルは `@media print` の外に
 * 置いてあり、印刷時に足されるのは「画面用の飾りを消すこと」だけなので、
 * 画面で見たものがそのまま刷られる（ADR-0005）。
 *
 * 空きセルも `<li>` として並べる。読み上げでは「3 行 2 列: 空き」と読まれ、
 * 使いかけの台紙のどこが空いているかが音声でも分かる。
 */
export const LabelSheetPreview = ({ sheet, page, caption, symbols }: LabelSheetPreviewProps) => {
  // 台紙の寸法はここで CSS に渡るだけ。座標の計算は CSS Grid がやる
  const style: StyleWithCustomProperties = sheetCustomProperties(sheet)

  return (
    <ol className="qrcc-print-sheet" style={style}>
      {page.cells.map((cell) => {
        if (cell.kind === 'blank') {
          return (
            <li key={cell.index} className="qrcc-print-cell" data-cell="blank">
              <span className="qrcc-visually-hidden">{`${cell.row} 行 ${cell.column} 列: 空き`}</span>
            </li>
          )
        }
        const symbol = symbols.get(cell.item.content)
        const text = captionFor(cell.item, caption)
        return (
          <li key={cell.index} className="qrcc-print-cell" data-cell="label">
            <span className="qrcc-visually-hidden">{`${cell.row} 行 ${cell.column} 列`}</span>
            {symbol === undefined ? (
              <span className="qrcc-print-label__pending">生成しています…</span>
            ) : (
              <div
                className="qrcc-print-label__symbol"
                // 生成エンジンが組み立てた決定的な SVG。内容は XML 退避済み
                dangerouslySetInnerHTML={{ __html: symbol.body }}
              />
            )}
            {text === undefined ? undefined : (
              <span className="qrcc-print-label__caption">{text}</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
