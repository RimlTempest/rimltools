/**
 * Web NFC の書き込み API に渡す形を組み立てる純粋関数。
 *
 * ハードウェアには触らない。`NdefRecordInit` は Web NFC の
 * `NDEFRecordInit` のうち、この feature が使う部分だけの構造型
 * （`features/nfc/ui/browser-nfc.ts` が本物の書き込み API に渡す）。
 */
import type { NfcRecord } from '../contract/index.ts'

export type NdefRecordInit = {
  readonly recordType: 'url' | 'text'
  readonly data: string
}

export const toNdefRecords = (record: NfcRecord): readonly NdefRecordInit[] => {
  switch (record.kind) {
    case 'url':
      return [{ recordType: 'url', data: record.url }]
    case 'text':
      return [{ recordType: 'text', data: record.text }]
  }
}
