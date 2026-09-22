/**
 * 画面に出す文言の変換点。`kind` や `role` の値をそのまま出さない。
 *
 * Mapped Type なので、`DocumentKind` / `Role` を足すと書き忘れが
 * コンパイルエラーになる。
 */
import type { DocumentKind, Role } from '@noter/contract'

export const KIND_LABEL: { readonly [K in DocumentKind]: string } = {
  markdown: 'Markdown',
  yaml: 'YAML',
  toml: 'TOML',
  json: 'JSON',
}

/** 権限。UI では「権限」と呼ぶ（docs/domain-model.md §用語）。 */
export const ROLE_LABEL: { readonly [R in Role]: string } = {
  owner: '所有者',
  editor: '編集できる',
  viewer: '閲覧のみ',
}

/**
 * 日時の表示。**タイムゾーンを固定する。**
 *
 * 固定しないと、サーバ（UTC）とブラウザ（端末の設定）で違う文字列になり、
 * ハイドレーションで食い違う。noter の利用者は日本語話者なので JST に寄せる。
 */
const FORMATTER = new Intl.DateTimeFormat('ja-JP', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Tokyo',
})

export const formatDateTime = (date: Date): string => FORMATTER.format(date)

const DATE_FORMATTER = new Intl.DateTimeFormat('ja-JP', {
  dateStyle: 'medium',
  timeZone: 'Asia/Tokyo',
})

export const formatDate = (date: Date): string => DATE_FORMATTER.format(date)
