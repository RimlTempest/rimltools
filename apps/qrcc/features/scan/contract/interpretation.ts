/**
 * 読み取った内容の解釈結果。
 *
 * `Detection.text`（`./decode.ts`）を入力にとる純粋関数 `interpret`
 * （`features/scan/core/interpret/index.ts`）の出力。生の文字列そのものは
 * `Detection.text` に残るので、ここでは解釈できた分だけを構造化して持つ。
 *
 * どの形式にも当てはまらなければ `plain` になる。解釈できないことは
 * 失敗ではない（バーコードは汚れ・切れ・読み違いで仕様どおりでない文字列が
 * 普通に来るため）。
 *
 * `docs/domain-model.md` の `CodePayload`（GS1 は
 * `{ kind: 'gs1'; elements: readonly Gs1Element[] }`）の語彙に合わせてある。
 */
import type { HttpUrl } from '@qrcc/contract'

/**
 * GS1 の Application Identifier（AI）1 件。
 *
 * 対応している AI は `01`（GTIN）・`10`（ロット）・`11`（製造日）・
 * `17`（有効期限）・`21`（シリアル）の 5 つだけ。それ以外は `unknown` として
 * 値だけ持つ（GS1 の AI は 100 種類以上あり、全部を実装する価値は無い）。
 */
export type Gs1Element =
  | { readonly ai: '01'; readonly kind: 'gtin'; readonly gtin: string }
  | { readonly ai: '10'; readonly kind: 'lot'; readonly lot: string }
  | { readonly ai: '11'; readonly kind: 'production_date'; readonly date: string }
  | { readonly ai: '17'; readonly kind: 'expiry_date'; readonly date: string }
  | { readonly ai: '21'; readonly kind: 'serial'; readonly serial: string }
  | { readonly ai: string; readonly kind: 'unknown'; readonly value: string }

/** 名刺（MeCard / vCard）から読める範囲。どちらの形式でも出すものは同じ。 */
export type ContactFields = {
  readonly name: string | undefined
  readonly tel: string | undefined
  readonly email: string | undefined
  readonly org: string | undefined
}

export type Interpretation =
  | { readonly kind: 'plain'; readonly text: string }
  | { readonly kind: 'url'; readonly url: HttpUrl }
  | { readonly kind: 'gs1'; readonly elements: readonly Gs1Element[] }
  | {
      readonly kind: 'wifi'
      readonly ssid: string
      readonly auth: string
      /** 既定では画面に出さない。読み取り画面は人前で開かれることがある。 */
      readonly password: string | undefined
    }
  | { readonly kind: 'contact'; readonly fields: ContactFields }
  | { readonly kind: 'email'; readonly to: string; readonly subject: string | undefined }
  | { readonly kind: 'tel'; readonly number: string }
  | { readonly kind: 'sms'; readonly number: string; readonly body: string | undefined }
  | { readonly kind: 'geo'; readonly lat: number; readonly lon: number }
  | {
      readonly kind: 'event'
      readonly summary: string | undefined
      readonly start: string | undefined
      readonly end: string | undefined
      readonly location: string | undefined
    }
