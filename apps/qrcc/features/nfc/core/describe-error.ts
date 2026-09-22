/**
 * 書き込みの失敗を、読み上げ領域にそのまま出せる文言にする。
 * 原因だけを述べて終わらず、**必ず次に何をすればよいか**まで書く。
 */
import type { NfcWriteError } from '../contract/index.ts'

export const describeNfcError = (error: NfcWriteError): string => {
  switch (error.kind) {
    case 'unsupported':
      return 'この端末・ブラウザでは NFC への書き込みに対応していません。Android の Chrome でお試しください。'
    case 'permission_denied':
      return 'NFC の使用が許可されませんでした。ブラウザの設定で許可してから、もう一度お試しください。'
    case 'no_tag':
      return 'タグが見つかりませんでした。端末の背面にタグを近づけたまま、もう一度お試しください。'
    case 'write_failed':
      return `書き込みに失敗しました（${error.detail}）。タグを近づけ直して、もう一度お試しください。`
  }
}
