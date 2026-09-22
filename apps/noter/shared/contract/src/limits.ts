/**
 * 上限値。根拠は docs/domain-model.md §上限、超えたときの縮退は
 * docs/free-tier-budget.md。ここは値だけを持ち、判定は各 feature が行う。
 */

/** 本文 1 本の上限。DO の 1 行 BLOB の実用上限（Yjs state はテキストの約 1.5 倍）。 */
export const MAX_DOCUMENT_BYTES = 1_048_576

/** 表題の文字数。一覧のレイアウトが崩れない長さ。 */
export const MAX_TITLE_LENGTH = 120

/** presence ラベルに出す表示名の文字数。 */
export const MAX_DISPLAY_NAME = 32

/** WebSocket 1 メッセージの上限。大きな貼り付けは provider 側で分割送信する。 */
export const MAX_WS_MESSAGE_BYTES = 262_144

/** 1 文書あたりの参加者数。presence 表示と DO のソケット数の上限。 */
export const MAX_MEMBERS = 50

/** 1 アカウントが持てる文書数。D1 の行数と一覧の読み取りコストの上限。 */
export const MAX_DOCUMENTS_PER_USER = 200

/** 共有リンクの既定の有効期限（90 日）。無期限は owner が明示的に選ぶ。 */
export const SHARE_LINK_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000
