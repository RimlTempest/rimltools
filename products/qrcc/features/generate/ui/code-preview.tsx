import type { RenderResponse } from '../contract/index.ts'
import { describeWarning } from './describe-warning.ts'

type CodePreviewProps = {
  readonly response: RenderResponse
}

/**
 * 生成したコードの表示。
 *
 * **画像だけで提供しない**（WCAG 1.1.1）。SVG 自体に title と aria-label を
 * 持たせたうえで、エンコードした内容をテキストでも併記する。
 */
export const CodePreview = ({ response }: CodePreviewProps) => {
  // SVG は生成エンジンが組み立てた決定的な文字列で、内容は XML 退避済み。
  const symbol = { __html: response.body }
  return (
    <figure className="qrcc-code-preview">
      <div className="qrcc-code-preview__image" dangerouslySetInnerHTML={symbol} />
      <figcaption>
        <p>
          <strong>この コードの内容:</strong> {response.description}
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
  )
}
