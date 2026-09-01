import type { ChangeEvent } from 'react'
import { useEffect, useId, useReducer, useRef } from 'react'
import type { Result } from '@qrcc/contract'
import { parseHttpUrl } from '@qrcc/contract'
import { Button, Field, LiveRegion } from '@qrcc/ui'
import type { CameraError, DecodeResponse, Detection, ScanFailure } from '../contract/index.ts'
import { SCAN_SYMBOLOGY_META } from '../contract/index.ts'
import { INITIAL_SCAN_STATE, reduceScan } from './scan-state.ts'

/** カメラ読み取りの 1 回分。開始したら必ず `stop()` で止める。 */
export type ScanSession = {
  readonly stop: () => void
}

export type StartCameraOptions = {
  /** 映像の置き場。`aria-hidden` なので、ここに映るものは読み上げに関与しない。 */
  readonly video: HTMLVideoElement | null
  readonly onDetect: (detection: Detection) => void
  /**
   * 読み取りを続けられなくなったとき。
   * **呼ぶ側が先に映像を止めてから通知する**（画面は停止済みとして扱う）。
   * 1 コマ読めなかっただけでは呼ばない。
   */
  readonly onFail: (failure: ScanFailure) => void
}

/**
 * カメラを開始する。テストでは偽物を渡し、検出や失敗を好きな時点で起こす。
 * `undefined` を渡すと「この環境ではカメラを使えない」として扱う。
 */
export type StartCamera = (options: StartCameraOptions) => Promise<Result<ScanSession, CameraError>>

/** 画像ファイルを読み取る。**サーバには送らない**（端末内で完結する）。 */
export type DecodeImageFile = (file: File) => Promise<Result<DecodeResponse, ScanFailure>>

/** クリップボードへの書き込み。使えない環境では渡さない。 */
export type CopyText = (text: string) => Promise<boolean>

type ScanScreenProps = {
  readonly startCamera: StartCamera | undefined
  readonly decodeImageFile: DecodeImageFile
  readonly copyText: CopyText | undefined
  /**
   * この画面の最上位見出しのレベル。
   *
   * 単独のページなら 1。トップページのように**他の画面と並べて置く**ときは
   * 2 にして、ページの h1 を主題ひとつに保つ（AAA 2.4.10）。
   */
  readonly headingLevel?: 1 | 2
}

/** ボタンの名前に入れる長さ。長い内容でも名前が一意になれば十分。 */
const LABEL_LIMIT = 24

const shorten = (text: string): string =>
  text.length <= LABEL_LIMIT ? text : `${text.slice(0, LABEL_LIMIT)}…`

/**
 * 読み取った内容 1 件。
 *
 * http(s) のときだけリンクにする。`javascript:` などを踏ませないため、
 * 判定は `@qrcc/contract` の `parseHttpUrl` に任せる（自前で書かない）。
 */
const DetectionItem = ({
  detection,
  copyText,
  onCopied,
  onCopyFailed,
}: {
  readonly detection: Detection
  readonly copyText: CopyText | undefined
  readonly onCopied: (text: string) => void
  readonly onCopyFailed: () => void
}) => {
  const url = parseHttpUrl(detection.text)

  return (
    <li className="qrcc-scan__result">
      <p className="qrcc-scan__result-text">
        {url.ok ? (
          <a href={url.value} rel="noreferrer">
            {detection.text}
          </a>
        ) : (
          detection.text
        )}
      </p>
      <p className="qrcc-scan__result-kind">
        種類: {SCAN_SYMBOLOGY_META[detection.symbology].label}
      </p>
      {copyText === undefined ? undefined : (
        <Button
          variant="secondary"
          onClick={() => {
            void (async () => {
              const done = await copyText(detection.text)
              if (done) onCopied(detection.text)
              else onCopyFailed()
            })()
          }}
        >
          「{shorten(detection.text)}」をコピー
        </Button>
      )}
    </li>
  )
}

/**
 * 読み取り画面。
 *
 * 読み取りは**端末の中だけ**で完結する。カメラの映像も選んだ画像もサーバに
 * 送らないので、Workers のリクエスト無料枠を消費しない
 * （docs/architecture.md / docs/free-tier-budget.md）。
 *
 * アクセシビリティの要:
 * - `<video>` は `aria-hidden`。映像から得られる情報は何もないので、
 *   状態はすべて 1 つの `role="status"` に集約する
 * - 開始・成功・失敗・権限拒否をすべて読み上げる。同じ値の連続検出は抑制する
 * - カメラが無くても画像読み取りだけで完結し、キーボードだけで全機能に届く
 */
export const ScanScreen = ({
  startCamera,
  decodeImageFile,
  copyText,
  headingLevel = 1,
}: ScanScreenProps) => {
  // 見出しは常に 1 段ずつ。飛ばすと構造が読めなくなる（AAA 2.4.10）
  const Title = headingLevel === 2 ? 'h2' : 'h1'
  const Section = headingLevel === 2 ? 'h3' : 'h2'
  const [state, dispatch] = useReducer(reduceScan, INITIAL_SCAN_STATE)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const sessionRef = useRef<ScanSession | undefined>(undefined)
  const cameraHeadingId = useId()
  const fileHeadingId = useId()
  const resultsHeadingId = useId()

  // 画面を離れてもカメラが回り続けないようにする
  useEffect(
    () => () => {
      sessionRef.current?.stop()
      sessionRef.current = undefined
    },
    [],
  )

  const start = async () => {
    if (startCamera === undefined) return
    dispatch({ kind: 'camera_requested' })
    const outcome = await startCamera({
      video: videoRef.current,
      onDetect: (detection) => dispatch({ kind: 'detected', detections: [detection] }),
      onFail: (failure) => {
        sessionRef.current = undefined
        dispatch({ kind: 'failed', failure })
      },
    })
    if (!outcome.ok) {
      dispatch({ kind: 'failed', failure: outcome.error })
      return
    }
    sessionRef.current = outcome.value
    dispatch({ kind: 'camera_started' })
  }

  const stop = () => {
    sessionRef.current?.stop()
    sessionRef.current = undefined
    dispatch({ kind: 'camera_stopped' })
  }

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file === undefined) return
    dispatch({ kind: 'file_selected' })
    const outcome = await decodeImageFile(file)
    dispatch(
      outcome.ok
        ? { kind: 'detected', detections: outcome.value.detections }
        : { kind: 'failed', failure: outcome.error },
    )
  }

  return (
    <>
      <Title>コードを読み取る</Title>
      <p>
        カメラか、保存してある画像から QR コード・バーコードを読み取ります。
        読み取りは端末の中だけで行い、カメラの映像も選んだ画像もサーバには送信しません。
      </p>

      <LiveRegion message={state.message} />

      <section className="qrcc-scan__panel" aria-labelledby={cameraHeadingId}>
        <Section id={cameraHeadingId}>カメラで読み取る</Section>
        {startCamera === undefined ? (
          <p>
            このブラウザではカメラを使えません。下の「画像から読み取る」で、
            撮影済みの写真やスクリーンショットから読み取れます。
          </p>
        ) : (
          <>
            <p>
              起動すると、映ったコードを自動で読み取ります。読み取った内容は
              「読み取った内容」の一覧に増えていきます。
            </p>
            <Button
              onClick={() => {
                if (state.camera === 'on') stop()
                else void start()
              }}
              busy={state.camera === 'starting'}
            >
              {state.camera === 'on' ? 'カメラを停止する' : 'カメラを起動する'}
            </Button>
            {/*
              映像そのものは情報を持たない（読めた内容はテキストで出す）。
              支援技術には見せず、状態は上の読み上げ領域に集約する。
            */}
            <video
              ref={videoRef}
              className="qrcc-scan__video"
              data-live={state.camera !== 'off'}
              aria-hidden="true"
              muted
              playsInline
            />
          </>
        )}
      </section>

      <section className="qrcc-scan__panel" aria-labelledby={fileHeadingId}>
        <Section id={fileHeadingId}>画像から読み取る</Section>
        <Field
          label="コードが写っている画像"
          type="file"
          accept="image/*"
          hint="PNG・JPEG・WebP に対応しています。画像はこの端末の中だけで処理され、サーバへは送信されません。"
          onChange={(event) => void readFile(event)}
        />
        {state.reading ? <p>読み取っています…</p> : undefined}
      </section>

      <section className="qrcc-scan__panel" aria-labelledby={resultsHeadingId}>
        <Section id={resultsHeadingId}>読み取った内容</Section>
        {state.history.length === 0 ? (
          <p>まだ読み取っていません。カメラを起動するか、画像を選んでください。</p>
        ) : (
          <ul className="qrcc-scan__results">
            {state.history.map((detection, index) => (
              <DetectionItem
                key={`${detection.symbology}-${detection.text}-${String(index)}`}
                detection={detection}
                copyText={copyText}
                onCopied={(text) => dispatch({ kind: 'copied', text })}
                onCopyFailed={() => dispatch({ kind: 'copy_failed' })}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
