import { useState } from 'react'
import { Button, LiveRegion } from '@qrcc/ui'
import type { RenderResponse } from '../contract/index.ts'
import { browserCanvasDeps, saveBlob, supportsElementCapture } from './download-browser.ts'
import type { CanvasDeps } from './download.ts'
import {
  buildFileName,
  describeDownloadError,
  elementToPng,
  svgToBlob,
  svgToPng,
} from './download.ts'

type SaveBlob = (blob: Blob, fileName: string) => void

type DownloadControlsProps = {
  readonly response: RenderResponse
  /** 「説明つき」保存で取り込む要素。 */
  readonly captureTarget?: { readonly current: HTMLElement | null }
  readonly deps?: CanvasDeps
  readonly save?: SaveBlob
  /** 能力検出の差し替え（テスト用）。既定は実ブラウザを見る。 */
  readonly canCaptureElement?: () => boolean
  /**
   * この節の見出しレベル。親（「生成したコード」）より 1 段下でなければ、
   * 親子が同じ高さの兄弟に見えてしまう（AAA 2.4.10）。
   */
  readonly headingLevel?: 3 | 4
}

/**
 * 保存の操作。
 *
 * SVG は無劣化で拡大でき、PNG はどこにでも貼れる。両方出す。
 * 「説明つき」は HTML in Canvas（`drawElementImage`）が使えるブラウザでだけ
 * 現れる段階的強化で、コードと説明文を 1 枚にまとめて保存する。
 */
export const DownloadControls = ({
  response,
  captureTarget,
  deps,
  save = saveBlob,
  canCaptureElement = supportsElementCapture,
  headingLevel = 3,
}: DownloadControlsProps) => {
  const Title = headingLevel === 4 ? 'h4' : 'h3'
  const [message, setMessage] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  // 能力検出は初回だけ。遅延初期化なのでレンダーのたびには走らない
  const [canSaveAnnotated] = useState(canCaptureElement)

  const resolved = deps ?? browserCanvasDeps()

  const saveSvg = () => {
    save(svgToBlob(response.body), buildFileName(response.description, 'svg'))
    setMessage('SVG を保存しました。')
  }

  const savePng = async () => {
    setBusy(true)
    const png = await svgToPng(response.body, response, resolved)
    setBusy(false)
    if (!png.ok) {
      setMessage(describeDownloadError(png.error))
      return
    }
    save(png.value, buildFileName(response.description, 'png'))
    setMessage('PNG を保存しました。')
  }

  const saveAnnotated = async () => {
    const element = captureTarget?.current
    if (element === null || element === undefined) {
      setMessage('保存する範囲が見つかりませんでした。')
      return
    }
    setBusy(true)
    const png = await elementToPng(
      element,
      { width: element.clientWidth, height: element.clientHeight },
      resolved,
    )
    setBusy(false)
    if (!png.ok) {
      setMessage(describeDownloadError(png.error))
      return
    }
    save(png.value, buildFileName(`${response.description}-説明つき`, 'png'))
    setMessage('説明つきの PNG を保存しました。')
  }

  return (
    <div className="qrcc-download-controls">
      <Title>保存する</Title>
      <p>SVG は拡大しても劣化しません。PNG はそのまま貼り付けられます。</p>
      <Button variant="secondary" onClick={saveSvg}>
        SVG で保存
      </Button>
      <Button variant="secondary" busy={busy} onClick={() => void savePng()}>
        PNG で保存
      </Button>
      {canSaveAnnotated ? (
        <Button variant="secondary" busy={busy} onClick={() => void saveAnnotated()}>
          説明つき PNG で保存
        </Button>
      ) : undefined}
      <LiveRegion message={message} />
    </div>
  )
}
