/**
 * 書き込み画面の状態遷移。
 *
 * **読み上げ文言をここに集約する。** 状態と文言が離れていると、
 * 「失敗したのに何も言わない」経路が簡単に生まれる。純粋な関数なので、
 * 画面を描かずに読み上げ内容そのものをテストできる。
 *
 * 書き込みは物理的で元に戻せないので、`editing`（入力）→`confirming`（確認）→
 * `writing`（実行中）→`done`（完了）の順にしか進まない。失敗したときは
 * 内容を失わず `confirming` に戻す（入力し直させない）。
 */
import type { NfcRecord, NfcWriteError } from '../contract/index.ts'
import { describeNfcError } from '../core/index.ts'

export type NfcStep = 'editing' | 'confirming' | 'writing' | 'done'

export type NfcState = {
  readonly step: NfcStep
  /** 確認より前（`editing`）では無い。 */
  readonly record: NfcRecord | undefined
  /** 読み上げ領域に出す文。 */
  readonly message: string | undefined
}

export type NfcEvent =
  | { readonly kind: 'confirm_requested'; readonly record: NfcRecord }
  | { readonly kind: 'edit_requested' }
  | { readonly kind: 'write_requested' }
  | { readonly kind: 'write_succeeded' }
  | { readonly kind: 'write_failed'; readonly failure: NfcWriteError }
  | { readonly kind: 'reset_requested' }

export const INITIAL_NFC_STATE: NfcState = {
  step: 'editing',
  record: undefined,
  message: undefined,
}

export const reduceNfc = (state: NfcState, event: NfcEvent): NfcState => {
  switch (event.kind) {
    case 'confirm_requested':
      return { step: 'confirming', record: event.record, message: undefined }
    case 'edit_requested':
      return { ...state, step: 'editing', message: undefined }
    case 'write_requested':
      return { ...state, step: 'writing', message: 'タグを近づけてください。' }
    case 'write_succeeded':
      return { ...state, step: 'done', message: '書き込みました。' }
    case 'write_failed':
      return { ...state, step: 'confirming', message: describeNfcError(event.failure) }
    case 'reset_requested':
      return INITIAL_NFC_STATE
  }
}
