/**
 * NFC タグに書き込むものの契約（docs/architecture.md 3.5 `/nfc`）。
 *
 * いまは URL とテキストだけを扱う。生成側（`@qrcc/generate`）が持つ内容の種類
 * （名刺・地図など）とは意図的に共有しない — plans/003 と plans/006 の両方が
 * 落ち着いてから寄せる（`plans/006-web-nfc.md` の Maintenance notes）。
 */
import type { HttpUrl, NonEmptyText } from '@qrcc/contract'

/** タグに書くもの。いまは URL と テキストだけ。 */
export type NfcRecord =
  | { readonly kind: 'url'; readonly url: HttpUrl }
  | { readonly kind: 'text'; readonly text: NonEmptyText }

/** 書き込みに失敗した理由。 */
export type NfcWriteError =
  | { readonly kind: 'unsupported' } // この環境に Web NFC の書き込み API が無い
  | { readonly kind: 'permission_denied' }
  | { readonly kind: 'no_tag' } // かざされなかった / 離れた
  | { readonly kind: 'write_failed'; readonly detail: string }
