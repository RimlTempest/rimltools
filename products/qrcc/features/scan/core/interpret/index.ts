/**
 * 読み取ったテキストを解釈する。
 *
 * 形式ごとの解釈は `interpret/<kind>.ts` に 1 ファイルずつあり、ここでは
 * 順に試すだけ。どれにも当てはまらなければ `plain` になる。
 *
 * 解釈は必ず失敗しうる（バーコードは汚れ・切れ・読み違いで仕様どおりで
 * ない文字列が普通に来る）ので、ここでは例外を送出しない。常に何らかの
 * `Interpretation` を返す。
 */
import { parseHttpUrl } from '@qrcc/contract'
import type { Interpretation } from '../../contract/interpretation.ts'
import { interpretGeo } from './geo.ts'
import { interpretGs1 } from './gs1.ts'
import { interpretMailto } from './mailto.ts'
import { interpretMecard } from './mecard.ts'
import { interpretSms } from './sms.ts'
import { interpretTel } from './tel.ts'
import { interpretVcard } from './vcard.ts'
import { interpretVevent } from './vevent.ts'
import { interpretWifi } from './wifi.ts'

/**
 * `http(s)` かどうかの判定は自前で書かず `@qrcc/contract` の `parseHttpUrl`
 * に任せる（`javascript:` などを踏ませないための既存の判断。
 * `features/scan/ui/scan-screen.tsx` と同じ関数を使う）。
 */
const interpretUrl = (text: string): Interpretation | undefined => {
  const url = parseHttpUrl(text)
  return url.ok ? { kind: 'url', url: url.value } : undefined
}

export const interpret = (text: string): Interpretation => {
  return (
    interpretTel(text)
    ?? interpretMailto(text)
    ?? interpretSms(text)
    ?? interpretGeo(text)
    ?? interpretWifi(text)
    ?? interpretMecard(text)
    ?? interpretVcard(text)
    ?? interpretVevent(text)
    ?? interpretGs1(text)
    ?? interpretUrl(text) ?? { kind: 'plain', text }
  )
}
