/**
 * 書き込みのブラウザ実装。
 *
 * **`NDEFReader` に触るのはここだけ。** 画面（`nfc-screen.tsx`）は
 * この形の関数を引数で受け取るので、テストでは偽物を渡せる。
 * ここが本当に動くことは e2e（実ブラウザ + 偽の `NDEFReader`）が確かめる。
 * 実機（Android + Chrome）で本物のタグに書けることは、この計画では確認していない
 * （plans/006-web-nfc.md の Maintenance notes）。
 *
 * 書き込みはすべて端末の中で完結する。タグの内容をサーバに送ることはない。
 */
import type { Result } from '@qrcc/contract'
import { err, ok } from '@qrcc/contract'
import type { NfcRecord, NfcWriteError } from '../contract/index.ts'
import type { NdefRecordInit } from '../core/index.ts'
import { toNdefRecords } from '../core/index.ts'

type NdefWriteMessage = {
  readonly records: readonly NdefRecordInit[]
}

/** Web NFC の `NDEFReader` のうち、この feature が使う部分だけの構造型。 */
type NdefReaderLike = {
  readonly write: (message: NdefWriteMessage) => Promise<void>
}

type NdefReaderConstructor = new () => NdefReaderLike

const readerConstructor = (): NdefReaderConstructor | undefined => {
  if (typeof window === 'undefined') return undefined
  // 標準の型定義に無いグローバルなので Reflect で取り出し、形は typeof で確かめる
  const candidate: NdefReaderConstructor | undefined = Reflect.get(window, 'NDEFReader')
  return typeof candidate === 'function' ? candidate : undefined
}

/** この環境で NFC に書けるか。SSR とハイドレーション前は書けない。 */
export const canWriteNfc = (): boolean => typeof window !== 'undefined' && 'NDEFReader' in window

/** 書き込み。例外を投げず Result で返す。 */
export type WriteNfc = (record: NfcRecord) => Promise<Result<void, NfcWriteError>>

/**
 * `NDEFReader.write` の失敗を、画面が案内を出し分けられる形に翻訳する。
 * 例外は `DOMException` のことが多いが、仕様上は保証されないので
 * `name` が読めるものだけ拾い、それ以外は詳細つきの一般失敗にする。
 */
const writeFailure = (cause: unknown): NfcWriteError => {
  const name = cause instanceof Error ? cause.name : ''
  // NotAllowedError: 権限が拒否された / SecurityError: 安全でないコンテキスト
  if (name === 'NotAllowedError' || name === 'SecurityError') return { kind: 'permission_denied' }
  // NetworkError: 書き込み中にタグが離れた、または最初から近くに無かった
  if (name === 'NetworkError') return { kind: 'no_tag' }
  const message = cause instanceof Error ? cause.message : String(cause)
  return { kind: 'write_failed', detail: name === '' ? message : `${name}: ${message}` }
}

/**
 * NFC への書き込みを行う。
 *
 * `NDEFReader` が無い環境（iOS・デスクトップなど）では `unsupported` を返す。
 * 権限プロンプトの拒否やタグが離れていた場合も、例外を投げず `Result` で返す。
 */
export const browserNfcWriter =
  (): WriteNfc =>
  async (record): Promise<Result<void, NfcWriteError>> => {
    const NdefReader = readerConstructor()
    if (NdefReader === undefined) return err({ kind: 'unsupported' })

    try {
      await new NdefReader().write({ records: toNdefRecords(record) })
      return ok(undefined)
    } catch (cause) {
      return err(writeFailure(cause))
    }
  }
