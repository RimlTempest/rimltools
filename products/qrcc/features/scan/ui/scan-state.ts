/**
 * 読み取り画面の状態遷移。
 *
 * **読み上げ文言をここに集約する。** 状態と文言が離れていると、
 * 「失敗したのに何も言わない」経路が簡単に生まれる。純粋な関数なので、
 * 画面を描かずに読み上げ内容そのものをテストできる。
 */
import type { Detection, ScanFailure } from '../contract/index.ts'
import { SCAN_SYMBOLOGY_META, describeScanFailure } from '../contract/index.ts'
import { recordDetection } from '../core/index.ts'

export type CameraStatus = 'off' | 'starting' | 'on'

export type ScanState = {
  readonly history: readonly Detection[]
  /** 読み上げ領域に出す文。同じ文のままなら読み上げ直さない。 */
  readonly message: string | undefined
  readonly camera: CameraStatus
  /** 画像ファイルを読み取っている最中か。 */
  readonly reading: boolean
}

export type ScanEvent =
  | { readonly kind: 'camera_requested' }
  | { readonly kind: 'camera_started' }
  | { readonly kind: 'camera_stopped' }
  | { readonly kind: 'file_selected' }
  | { readonly kind: 'detected'; readonly detections: readonly Detection[] }
  | { readonly kind: 'failed'; readonly failure: ScanFailure }
  | { readonly kind: 'copied'; readonly text: string }
  | { readonly kind: 'copy_failed' }

export const INITIAL_SCAN_STATE: ScanState = {
  history: [],
  message: undefined,
  camera: 'off',
  reading: false,
}

/** 読み上げ用の長さ。全文を読ませると、次の操作に移れなくなる。 */
const SPOKEN_LIMIT = 60

const spoken = (text: string): string =>
  text.length <= SPOKEN_LIMIT ? text : `${text.slice(0, SPOKEN_LIMIT)}…`

const describeDetection = (detection: Detection): string =>
  `${spoken(detection.text)}（${SCAN_SYMBOLOGY_META[detection.symbology].label}）`

/**
 * 検出をまとめて取り込む。
 * 直前と同じものしか無ければ読み上げ文を変えない（連続検出の抑制）。
 */
const applyDetections = (state: ScanState, detections: readonly Detection[]): ScanState => {
  const announced: Detection[] = []
  let history = state.history
  for (const detection of detections) {
    const recorded = recordDetection(history, detection)
    history = recorded.history
    if (recorded.announce) announced.push(detection)
  }

  return {
    ...state,
    history,
    reading: false,
    message:
      announced.length === 0
        ? state.message
        : `読み取りました: ${announced.map(describeDetection).join('、')}`,
  }
}

export const reduceScan = (state: ScanState, event: ScanEvent): ScanState => {
  switch (event.kind) {
    case 'camera_requested':
      return { ...state, camera: 'starting', message: 'カメラを起動しています。' }
    case 'camera_started':
      return {
        ...state,
        camera: 'on',
        message: 'カメラで読み取っています。コードをカメラに向けてください。',
      }
    case 'camera_stopped':
      return { ...state, camera: 'off', message: 'カメラを停止しました。' }
    case 'file_selected':
      return { ...state, reading: true, message: '画像を読み取っています。' }
    case 'detected':
      return applyDetections(state, event.detections)
    case 'failed':
      // カメラの起動途中で失敗したら、押せるボタンの状態まで戻す
      return {
        ...state,
        camera: 'off',
        reading: false,
        message: describeScanFailure(event.failure),
      }
    case 'copied':
      return { ...state, message: `コピーしました: ${spoken(event.text)}` }
    case 'copy_failed':
      return {
        ...state,
        message: 'コピーできませんでした。テキストを選んで手動でコピーしてください。',
      }
  }
}
