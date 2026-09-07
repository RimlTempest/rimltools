import { useRef } from 'react'
import type { RenderResponse } from '../contract/index.ts'
import { DownloadControls } from './download-controls.tsx'
import { describeWarning } from './describe-warning.ts'

type CodePreviewProps = {
  readonly response: RenderResponse
  /** テストや SSR で保存操作を出さないための切り替え。 */
  readonly showDownloads?: boolean
  /** 「保存する」の見出しレベル。呼び出し側の階層に合わせる（AAA 2.4.10）。 */
  readonly headingLevel?: 3 | 4
}

/**
 * 生成したコードの表示。
 *
 * **画像だけで提供しない**（WCAG 1.1.1）。SVG 自体に title と aria-label を
 * 持たせたうえで、エンコードした内容をテキストでも併記する。
 *
 * これ自体は窓にしない（`Window` で包まない）。窓は「画面の区画」の単位で、
 * どの区画に置くかは呼び出し側が決める（窓の入れ子を作らないため）。
 */
export const CodePreview = ({
  response,
  showDownloads = true,
  headingLevel = 3,
}: CodePreviewProps) => {
  // SVG は生成エンジンが組み立てた決定的な文字列で、内容は XML 退避済み。
  const symbol = { __html: response.body }
  // 「説明つき PNG」で取り込む範囲。
  const figure = useRef<HTMLElement | null>(null)

  return (
    <>
      <figure className="qrcc-code-preview" ref={figure}>
        <div className="qrcc-code-preview__image" dangerouslySetInnerHTML={symbol} />
        <figcaption>
          <p>
            <strong>このコードの内容:</strong> {response.description}
          </p>
          <p>
            大きさ: {response.width} × {response.height} ピクセル
          </p>
          {response.warnings.length === 0 ? undefined : (
            <ul>
              {response.warnings.map((warning) => (
                <li key={warning.kind}>{describeWarning(warning)}</li>
              ))}
            </ul>
          )}
        </figcaption>
      </figure>
      {showDownloads ? (
        <DownloadControls response={response} captureTarget={figure} headingLevel={headingLevel} />
      ) : undefined}
    </>
  )
}
