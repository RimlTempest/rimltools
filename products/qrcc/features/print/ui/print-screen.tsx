import { useCallback, useEffect, useId, useState } from 'react'
import type { HexColor, Result } from '@qrcc/contract'
import { parseHexColor } from '@qrcc/contract'
import { Button, Field, LiveRegion } from '@qrcc/ui'
import type { RenderError, RenderRequest, RenderResponse } from '@qrcc/generate/contract'
import { describeRenderError } from '@qrcc/generate/contract'
import type { Caption, CaptionKind, LabelSheetId, PrintItem } from '../contract/index.ts'
import {
  CAPTION_KINDS,
  CAPTION_META,
  LABEL_SHEET_IDS,
  LABEL_SHEET_META,
  describeImpositionError,
  isLabelSheetId,
} from '../contract/index.ts'
import { LABEL_SHEETS, cellsPerSheet, imposeLabels, parseItemLines } from '../core/index.ts'
import { LabelSheetPreview } from './label-sheet.tsx'

export type PrintRenderFailure =
  | RenderError
  | { readonly kind: 'unavailable'; readonly detail: string }

/**
 * コードの生成。ブラウザ側の wasm で動かす前提で注入する
 * （印刷のたびにサーバへ投げると無料枠を使い切る。docs/free-tier-budget.md）。
 */
export type PrintRenderFn = (
  request: RenderRequest,
) => Promise<Result<RenderResponse, PrintRenderFailure>>

type PrintScreenProps = {
  readonly render: PrintRenderFn
  /** 印刷の実行。既定はブラウザの印刷ダイアログ。テストでは差し替える。 */
  readonly print?: () => void
  /** プレビュー更新の待ち時間（ms）。テストでは 0 にする。 */
  readonly debounceMs?: number
}

type FormState = {
  readonly sheetId: LabelSheetId
  readonly startCell: number
  readonly copies: number
  readonly lines: string
  readonly captionKind: CaptionKind
  readonly captionText: string
}

const INITIAL: FormState = {
  sheetId: 'a4-24-70x33.9',
  startCell: 1,
  copies: 1,
  lines: 'https://qrcc.riml4i.com',
  captionKind: 'name',
  captionText: '',
}

/**
 * ラベルは紙に刷るので白黒に固定する（ダークモードでも変えない）。
 *
 * `parseHexColor` は `Result` を返す。ここのリテラルは必ず通るが、
 * `as` や `!` で握りつぶさず「通らなかったときは生成しない」と書いておく。
 */
const PAPER_PALETTE: { readonly foreground: HexColor; readonly background: HexColor } | undefined =
  (() => {
    const foreground = parseHexColor('#000000')
    const background = parseHexColor('#ffffff')
    return foreground.ok && background.ok
      ? { foreground: foreground.value, background: background.value }
      : undefined
  })()

const requestFor = (
  content: string,
  palette: { readonly foreground: HexColor; readonly background: HexColor },
): RenderRequest => ({
  payload: { kind: 'text', text: content },
  // ラベルに刷るのは QR。1D バーコードは細りやすく、家庭用プリンタでは読めない
  symbology: { kind: 'qr', ec: 'M' },
  style: {
    foreground: palette.foreground,
    background: { kind: 'solid', color: palette.background },
    // 紙面の大きさは CSS（mm）が決めるので、ここは形が崩れない程度でよい
    scale: 4,
    quiet_zone: null,
    module_shape: 'square',
    bar_height: 40,
    human_readable: false,
  },
  output: 'svg',
})

const buildCaption = (kind: CaptionKind, text: string): Caption => {
  switch (kind) {
    case 'none':
      return { kind: 'none' }
    case 'name':
      return { kind: 'name' }
    case 'content':
      return { kind: 'content' }
    case 'custom':
      return { kind: 'custom', text }
  }
}

const describeFailure = (failure: PrintRenderFailure): string =>
  failure.kind === 'unavailable'
    ? `コードを生成できませんでした（${failure.detail}）。ページを読み込み直してからもう一度お試しください。`
    : describeRenderError(failure)

/**
 * 一覧の key。同じ内容の行が並んでも重複しないよう、内容ごとに何番目かを添える
 * （配列の添字を key にすると、行を消したときに描画がずれる）。
 */
const withKeys = (items: readonly PrintItem[]): readonly { key: string; item: PrintItem }[] => {
  const seen = new Map<string, number>()
  return items.map((item) => {
    const occurrence = (seen.get(item.content) ?? 0) + 1
    seen.set(item.content, occurrence)
    return { key: `${item.content}#${occurrence}`, item }
  })
}

const describeItem = (item: PrintItem): string =>
  item.name === '' ? item.content : `${item.name}（内容: ${item.content}）`

const browserPrint = () => {
  if (typeof globalThis.print === 'function') globalThis.print()
}

/**
 * ラベル印刷の画面。
 *
 * 生成はすべてブラウザ側で行い、サーバには何も送らない。
 * プレビューは実際の印刷スタイルそのままなので、
 * 「画面で見たものが刷られる」ことが目で確かめられる（ADR-0005）。
 */
export const PrintScreen = ({
  render,
  print = browserPrint,
  debounceMs = 300,
}: PrintScreenProps) => {
  const [state, setState] = useState<FormState>(INITIAL)
  const [symbols, setSymbols] = useState<ReadonlyMap<string, RenderResponse>>(() => new Map())
  const [message, setMessage] = useState<string | undefined>(undefined)
  const sheetFieldId = useId()
  const sheetHintId = useId()
  const captionGroup = useId()

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((current) => ({ ...current, [key]: value }))

  const sheet = LABEL_SHEETS[state.sheetId]
  const meta = LABEL_SHEET_META[state.sheetId]
  const perSheet = cellsPerSheet(sheet)
  const items = parseItemLines(state.lines, state.copies)
  const caption = buildCaption(state.captionKind, state.captionText)
  const imposition = imposeLabels({ sheet, items, startCell: state.startCell })
  const problem = imposition.ok ? undefined : describeImpositionError(imposition.error)
  const pages = imposition.ok ? imposition.value : []
  const labelCount = pages.reduce((total, page) => total + page.usedCells, 0)

  /** 同じ内容は 1 度だけ生成し、コピーは同じ SVG を使い回す。 */
  const generate = useCallback(async () => {
    if (PAPER_PALETTE === undefined) {
      setMessage('印刷用の色を組み立てられませんでした。')
      return
    }
    const palette = PAPER_PALETTE
    const contents = [
      ...new Set(parseItemLines(state.lines, state.copies).map((item) => item.content)),
    ]
    if (contents.length === 0) {
      setSymbols(new Map())
      return
    }

    const rendered = await Promise.all(
      contents.map(
        async (content) => [content, await render(requestFor(content, palette))] as const,
      ),
    )
    const next = new Map<string, RenderResponse>()
    let failure: string | undefined
    for (const [content, outcome] of rendered) {
      if (outcome.ok) next.set(content, outcome.value)
      else failure = describeFailure(outcome.error)
    }
    setSymbols(next)
    setMessage(failure)
  }, [state.lines, state.copies, render])

  useEffect(() => {
    // 入力のたびに走らせず、手が止まってから 1 回だけ生成する
    const timer = setTimeout(() => {
      void generate()
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [debounceMs, generate])

  const startPrint = () => {
    if (items.length === 0) {
      setMessage('印刷するコードを入力してください。1 行に 1 つずつ書きます。')
      return
    }
    if (!imposition.ok) return
    print()
  }

  return (
    <>
      <h1>ラベルを印刷する</h1>
      <p>
        市販のラベル台紙に合わせてコードを面付けします。生成はこの端末の中で行われ、
        入力した内容がサーバに送られることはありません。
      </p>

      <form className="qrcc-no-print" onSubmit={(event) => event.preventDefault()}>
        <fieldset>
          <legend>台紙と配置</legend>

          <div className="qrcc-field">
            <label className="qrcc-field__label" htmlFor={sheetFieldId}>
              ラベル台紙
            </label>
            <span className="qrcc-field__hint" id={sheetHintId}>
              お手持ちの台紙と同じ面数・寸法のものを選んでください。
            </span>
            <select
              className="qrcc-field__control"
              id={sheetFieldId}
              aria-describedby={sheetHintId}
              value={state.sheetId}
              onChange={(event) => {
                const selected = event.target.value
                if (isLabelSheetId(selected)) update('sheetId', selected)
              }}
            >
              {LABEL_SHEET_IDS.map((id) => (
                <option key={id} value={id}>
                  {LABEL_SHEET_META[id].label}
                </option>
              ))}
            </select>
          </div>

          <p>
            1 枚に {perSheet} 面（{sheet.columns} 列 × {sheet.rows} 行）。1 面は {sheet.cell.width}{' '}
            × {sheet.cell.height}mm。{meta.description}
          </p>
          <p>
            <strong>注意:</strong> {meta.caution}
          </p>

          <Field
            label="印刷を始めるセル"
            type="number"
            inputMode="numeric"
            min={1}
            max={perSheet}
            hint={`使いかけの台紙を無駄にしないための指定です。左上から右へ数えて何番目のセルから刷るかを、1 から ${perSheet} で入れてください。`}
            value={state.startCell}
            onChange={(event) => update('startCell', Number(event.target.value))}
          />
          <Field
            label="1 つのコードあたりの枚数"
            type="number"
            inputMode="numeric"
            min={1}
            hint="同じコードを何枚ずつ刷るかです。足りなくなったぶんは次のページに続きます。"
            value={state.copies}
            onChange={(event) => update('copies', Number(event.target.value))}
          />
        </fieldset>

        <fieldset>
          <legend>印刷する内容</legend>
          <Field
            control="textarea"
            label="印刷するコード"
            rows={5}
            hint="1 行に 1 つ書きます。名前を付けるときは「名前」と「内容」をタブ区切りにしてください（表計算からそのまま貼り付けられます）。"
            value={state.lines}
            onChange={(event) => update('lines', event.target.value)}
          />
        </fieldset>

        <fieldset>
          <legend>ラベルに出す文字</legend>
          <p>コードの下に出す文字です。セルが小さい台紙では「なし」が読み取りやすくなります。</p>
          {CAPTION_KINDS.map((kind) => (
            <label key={kind}>
              <input
                type="radio"
                name={captionGroup}
                value={kind}
                checked={state.captionKind === kind}
                onChange={() => update('captionKind', kind)}
              />
              {CAPTION_META[kind].label}（{CAPTION_META[kind].description}）
            </label>
          ))}
          {state.captionKind === 'custom' ? (
            <Field
              label="すべてのラベルに出す文字"
              hint="すべてのラベルに同じ文字が出ます。"
              value={state.captionText}
              onChange={(event) => update('captionText', event.target.value)}
            />
          ) : undefined}
        </fieldset>

        <Button onClick={startPrint}>印刷する</Button>
        <p>
          印刷ダイアログでは、用紙を A4、余白を「なし」、拡大縮小を 100%
          にしてください。台紙とずれる場合は、まず普通紙に試し刷りして重ねて確認できます。
        </p>
      </form>

      <LiveRegion message={problem ?? message} />

      <section className="qrcc-no-print" aria-labelledby="qrcc-print-list">
        <h2 id="qrcc-print-list">印刷するものの一覧</h2>
        {items.length === 0 ? (
          <p>まだ何も入力されていません。上の「印刷するコード」に 1 行ずつ書いてください。</p>
        ) : (
          <>
            <p>
              全 {pages.length} ページ・ラベル {labelCount} 枚。{state.startCell}{' '}
              番目のセルから印刷します。
            </p>
            <ol>
              {withKeys(items).map(({ key, item }) => (
                <li key={key}>
                  {describeItem(item)} — {item.copies} 枚
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <section aria-labelledby="qrcc-print-preview">
        <h2 className="qrcc-no-print" id="qrcc-print-preview">
          印刷プレビュー
        </h2>
        <div className="qrcc-print-preview">
          {pages.map((page) => (
            <section key={page.pageNumber}>
              <h3 className="qrcc-no-print">
                {page.pageNumber} 枚目の台紙（{perSheet} 面中 {page.usedCells} 面を使用）
              </h3>
              <LabelSheetPreview sheet={sheet} page={page} caption={caption} symbols={symbols} />
            </section>
          ))}
        </div>
      </section>
    </>
  )
}
