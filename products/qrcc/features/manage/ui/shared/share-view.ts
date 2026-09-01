/**
 * 共有リンクを開いた結果を、画面に出す言葉に変える（純粋）。
 *
 * ここに I/O はない。「開けなかった」を 1 つの文言で済ませないための
 * 語彙をまとめてあり、画面はこの語彙を並べるだけになる。
 *
 * リンクを受け取った人は **qrcc のアカウントを持っていない**（ADR-0004）。
 * 用語も、次にすることも、その前提で書く。
 */
import type { Result, ShareToken } from '@qrcc/contract'
import { err, ok, parseShareToken } from '@qrcc/contract'
import type { SharePermission } from '@qrcc/auth/contract'
import type { RenderRequest } from '@qrcc/generate/contract'
import type { SavedCode } from '@qrcc/manage/contract'
import type { ManageFailure } from '@qrcc/manage/server'

/**
 * 期限切れだけを別の `resource` で返す約束
 * （`features/manage/worker/src/shares.rs` の `explain_absence`）。
 * 取り消し済みと存在しないリンクは、いまも同じ `share` に畳まれている。
 */
const EXPIRED_RESOURCE = 'share_expired'

/**
 * 共有リンクを開けなかった理由。
 *
 * 「見つかりません」に畳むと、受け取った人は次にすること
 * （URL を確かめ直す／発行者に頼む／待つ）を選べない。
 */
export type SharedFailure =
  /** URL の末尾が共有トークンの形をしていない。 */
  | { readonly kind: 'malformed_token' }
  /** 取り消された、またははじめから無い。 */
  | { readonly kind: 'gone' }
  | { readonly kind: 'expired' }
  /** リンクの状態とは関係のない不調。 */
  | { readonly kind: 'unavailable'; readonly detail: string }

/** 失敗のときに出す 3 点セット。見出しは `h1` になる。 */
export type SharedGuidance = {
  readonly heading: string
  readonly reason: string
  readonly nextStep: string
}

/** URL の一部も境界を越える入力。検証してから先へ渡す。 */
export const readShareToken = (raw: string): Result<ShareToken, SharedFailure> => {
  const token = parseShareToken(raw)
  return token.ok ? ok(token.value) : err({ kind: 'malformed_token' })
}

/**
 * RPC の失敗を、リンクを開いた人から見た理由に置き換える。
 *
 * 権限系（`sign_in_required` / `forbidden`）は、解決が公開メソッドである以上
 * 返らないはずのもの。「サインインしてください」と案内すると嘘になるので、
 * 技術的な不調として扱う。
 */
export const toSharedFailure = (failure: ManageFailure): SharedFailure => {
  switch (failure.kind) {
    case 'not_found':
      return failure.resource === EXPIRED_RESOURCE ? { kind: 'expired' } : { kind: 'gone' }
    case 'unavailable':
      return { kind: 'unavailable', detail: failure.detail }
    case 'limit_exceeded':
      return { kind: 'unavailable', detail: failure.limit }
    case 'sign_in_required':
    case 'forbidden':
      return { kind: 'unavailable', detail: failure.kind }
  }
}

export const describeSharedFailure = (failure: SharedFailure): SharedGuidance => {
  switch (failure.kind) {
    case 'malformed_token':
      return {
        heading: 'この共有リンクは形が違います',
        reason: 'URL の最後の部分が、共有リンクの形（32 文字）になっていません。',
        nextStep:
          'メッセージからコピーしたときに URL が途中で切れていないか確かめて、もう一度開いてください。',
      }
    case 'gone':
      return {
        heading: 'この共有リンクは使えません',
        reason: 'このリンクは取り消されたか、はじめから存在しません。',
        nextStep: 'リンクを送ってくれた人に、新しい共有リンクを作ってもらってください。',
      }
    case 'expired':
      return {
        heading: 'この共有リンクは期限切れです',
        reason: '共有リンクには期限があります。このリンクはその期限を過ぎました。',
        nextStep: 'リンクを送ってくれた人に、期限の新しい共有リンクを作ってもらってください。',
      }
    case 'unavailable':
      return {
        heading: '共有されたコードを開けませんでした',
        reason: `リンクではなく、qrcc 側の不調です（${failure.detail}）。`,
        nextStep: '少し待ってから、ページを読み込み直してください。',
      }
  }
}

/**
 * このリンクでできること。
 *
 * `edit` のリンクでも**この画面では編集させない**。編集は保存したコードの
 * 画面（`/codes/<id>`）の役目で、そちらは所有者の認証を通る。
 */
export const describeSharePermission = (permission: SharePermission): string =>
  permission === 'edit'
    ? 'このリンクは編集もできる共有です。ただし、この画面は見るためのものです。'
    : 'このリンクでできるのは、見ることだけです。内容は変えられません。'

/**
 * 保存されている内容から生成を頼む。
 *
 * 画像はブラウザの wasm で描くので、Workers のリクエストを消費しない
 * （docs/free-tier-budget.md）。保存された `payload` / `symbology` / `style` を
 * そのまま渡すので、共有された人は所有者と同じ絵を見る。
 */
export const toRenderRequest = (code: SavedCode): RenderRequest => ({
  payload: code.payload,
  symbology: code.symbology,
  style: code.style,
  output: 'svg',
})
