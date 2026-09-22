import type { ChangeEvent } from 'react'
import { Fragment, useEffect, useReducer, useRef, useState } from 'react'
import type { Result } from '@qrcc/contract'
import { Button, Field, LiveRegion, Window } from '@qrcc/ui'
import type {
  CameraError,
  DecodeResponse,
  Detection,
  Gs1Element,
  Interpretation,
  ScanFailure,
} from '../contract/index.ts'
import { SCAN_SYMBOLOGY_META } from '../contract/index.ts'
import { interpret } from '../core/index.ts'
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

/** GS1 の AI（対応している 5 つ）の日本語ラベル。未対応の AI は別扱い。 */
const GS1_ELEMENT_LABEL: Record<Exclude<Gs1Element['kind'], 'unknown'>, string> = {
  gtin: 'GTIN',
  lot: 'ロット番号',
  production_date: '製造日（YYMMDD）',
  expiry_date: '有効期限（YYMMDD）',
  serial: 'シリアル番号',
}

const gs1ElementValue = (element: Gs1Element): string => {
  switch (element.kind) {
    case 'gtin':
      return element.gtin
    case 'lot':
      return element.lot
    case 'production_date':
    case 'expiry_date':
      return element.date
    case 'serial':
      return element.serial
    case 'unknown':
      return element.value
  }
}

type DescriptionRow = readonly [label: string, value: string | undefined]

/**
 * 値のある行だけで説明リストを作る。1 行も無ければリスト自体を出さない
 * （空の `<dl>` は支援技術に「リスト、0 項目」とだけ伝わり、情報が無い）。
 */
const optionalDescriptionList = (rows: readonly DescriptionRow[]) => {
  const present = rows.filter((row): row is readonly [string, string] => row[1] !== undefined)
  if (present.length === 0) return undefined
  return (
    <dl className="qrcc-scan__interpretation">
      {present.map(([label, value]) => (
        <Fragment key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

/** 値があるときだけ `<dt>`/`<dd>` の組を出す。 */
const OptionalRow = ({
  label,
  value,
}: {
  readonly label: string
  readonly value: string | undefined
}) => {
  if (value === undefined) return undefined
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  )
}

/**
 * Wi-Fi のパスワード欄。既定では伏せ、押したら見せる
 * （読み取り画面は人前で開かれることがある）。
 */
const WifiPasswordRow = ({ password }: { readonly password: string | undefined }) => {
  const [revealed, setRevealed] = useState(false)

  if (password === undefined) {
    return (
      <>
        <dt>パスワード</dt>
        <dd>このネットワークにパスワードはありません。</dd>
      </>
    )
  }

  return (
    <>
      <dt>パスワード</dt>
      <dd>
        <span aria-hidden={!revealed}>{revealed ? password : '●'.repeat(password.length)}</span>
        <Button
          variant="secondary"
          aria-pressed={revealed}
          onClick={() => setRevealed((current) => !current)}
        >
          {revealed ? 'パスワードを隠す' : 'パスワードを表示する'}
        </Button>
      </dd>
    </>
  )
}

/**
 * 解釈結果を構造化して出す。`plain` と `url` は生のテキストで十分なので
 * 何も足さない。`tel:` や `mailto:` はリンクにせず、ここでもテキストと
 * して出すだけにする（既存のセキュリティ判断を緩めない）。
 */
const InterpretationDetails = ({ interpretation }: { readonly interpretation: Interpretation }) => {
  switch (interpretation.kind) {
    case 'plain':
    case 'url':
      return undefined
    case 'wifi':
      return (
        <dl className="qrcc-scan__interpretation">
          <dt>ネットワーク名（SSID）</dt>
          <dd>
            {interpretation.ssid.length === 0 ? '（読み取れませんでした）' : interpretation.ssid}
          </dd>
          <dt>暗号方式</dt>
          <dd>{interpretation.auth}</dd>
          <WifiPasswordRow password={interpretation.password} />
        </dl>
      )
    case 'gs1':
      return (
        <dl className="qrcc-scan__interpretation">
          {interpretation.elements.map((element, index) => (
            <Fragment key={`${element.ai}-${String(index)}`}>
              <dt>
                {element.kind === 'unknown'
                  ? `未対応の識別子（AI ${element.ai}）`
                  : GS1_ELEMENT_LABEL[element.kind]}
              </dt>
              <dd>{gs1ElementValue(element)}</dd>
            </Fragment>
          ))}
        </dl>
      )
    case 'contact':
      return optionalDescriptionList([
        ['氏名', interpretation.fields.name],
        ['電話', interpretation.fields.tel],
        ['メール', interpretation.fields.email],
        ['組織', interpretation.fields.org],
      ])
    case 'email':
      return (
        <dl className="qrcc-scan__interpretation">
          <dt>宛先</dt>
          <dd>{interpretation.to}</dd>
          <OptionalRow label="件名" value={interpretation.subject} />
        </dl>
      )
    case 'tel':
      return (
        <dl className="qrcc-scan__interpretation">
          <dt>電話番号</dt>
          <dd>{interpretation.number}</dd>
        </dl>
      )
    case 'sms':
      return (
        <dl className="qrcc-scan__interpretation">
          <dt>宛先</dt>
          <dd>{interpretation.number}</dd>
          <OptionalRow label="本文" value={interpretation.body} />
        </dl>
      )
    case 'geo':
      return (
        <dl className="qrcc-scan__interpretation">
          <dt>緯度</dt>
          <dd>{interpretation.lat}</dd>
          <dt>経度</dt>
          <dd>{interpretation.lon}</dd>
        </dl>
      )
    case 'event':
      return optionalDescriptionList([
        ['件名', interpretation.summary],
        ['開始', interpretation.start],
        ['終了', interpretation.end],
        ['場所', interpretation.location],
      ])
  }
}

/**
 * 読み取った内容 1 件。
 *
 * **生のテキストは常に残す。** 解釈が外れていても元の値を確認できるように
 * する。http(s) のときだけリンクにする。`javascript:` などを踏ませないため、
 * 判定は結局 `@qrcc/contract` の `parseHttpUrl` に任せている
 * （`interpret()` の内部で使っている。自前では書かない）。
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
  const interpretation = interpret(detection.text)

  return (
    <>
      <p className="qrcc-scan__result-text">
        {interpretation.kind === 'url' ? (
          <a href={interpretation.url} rel="noreferrer">
            {detection.text}
          </a>
        ) : (
          detection.text
        )}
      </p>
      <p className="qrcc-scan__result-kind">
        種類: {SCAN_SYMBOLOGY_META[detection.symbology].label}
      </p>
      <InterpretationDetails interpretation={interpretation} />
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
    </>
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
  // 窓の帯は見出しそのもの。段は画面の見出し構造に合わせる
  const sectionLevel = headingLevel === 2 ? 3 : 2
  const [state, dispatch] = useReducer(reduceScan, INITIAL_SCAN_STATE)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const sessionRef = useRef<ScanSession | undefined>(undefined)

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

  const readSelected = async (file: File) => {
    dispatch({ kind: 'file_selected' })
    const outcome = await decodeImageFile(file)
    dispatch(
      outcome.ok
        ? { kind: 'detected', detections: outcome.value.detections }
        : { kind: 'failed', failure: outcome.error },
    )
  }

  const readFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file !== undefined) void readSelected(file)
  }

  // サーバが描いた HTML は React がつながる前から操作できる。遅い端末では、その間に
  // 選んだ画像の change イベントが React に届かず、何も起きなかった。つながった時点で
  // 入力に残っている画像を拾って読み取る（1 回だけ。以後は onChange が受け持つ）。
  const imagePanelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const input = imagePanelRef.current?.querySelector('input[type="file"]')
    const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined
    if (file !== undefined) void readSelected(file)
    // マウント時の 1 回だけ。readSelected は描画ごとに作り直されるが、ここでは初回のものでよい
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <Title>コードを読み取る</Title>
      <p>
        カメラか、保存してある画像から QR コード・バーコードを読み取ります。
        読み取りは端末の中だけで行い、カメラの映像も選んだ画像もサーバには送信しません。
      </p>

      <LiveRegion message={state.message} />

      <Window title="カメラで読み取る" headingLevel={sectionLevel}>
        <div className="qrcc-scan__panel">
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
        </div>
      </Window>

      <Window title="画像から読み取る" headingLevel={sectionLevel}>
        <div className="qrcc-scan__panel" ref={imagePanelRef}>
          <Field
            label="コードが写っている画像"
            type="file"
            accept="image/*"
            hint="PNG・JPEG・WebP に対応しています。画像はこの端末の中だけで処理され、サーバへは送信されません。"
            onChange={readFile}
          />
          {state.reading ? <p>読み取っています…</p> : undefined}
        </div>
      </Window>

      <Window title="読み取った内容" headingLevel={sectionLevel}>
        <div className="qrcc-scan__panel">
          {state.history.length === 0 ? (
            <p>まだ読み取っていません。カメラを起動するか、画像を選んでください。</p>
          ) : (
            <ul className="qrcc-scan__results">
              {/* <li> は <ul> の中に直接書く（markuplint が子要素を静的に検査できるように） */}
              {state.history.map((detection, index) => (
                <li
                  key={`${detection.symbology}-${detection.text}-${String(index)}`}
                  className="qrcc-scan__result"
                >
                  <DetectionItem
                    detection={detection}
                    copyText={copyText}
                    onCopied={(text) => dispatch({ kind: 'copied', text })}
                    onCopyFailed={() => dispatch({ kind: 'copy_failed' })}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Window>
    </>
  )
}
