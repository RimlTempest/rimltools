import { useId, useState } from 'react'
import type { ConnectionState, RejectReason } from '@noter/sync/contract'

/** 書き出しを促す拒否理由（docs/design/ux.md §6.5）。 */
export type LimitReason = Extract<RejectReason, 'limit' | 'too_large'>

type LimitBannerProps = {
  readonly reason: LimitReason
  /** 閉じたことを覚える単位。文書ごとに別々に忘れる。 */
  readonly documentId: string
  /** ツールバーの「書き出し」へ飛ぶ先（`EditorToolbar` が付ける id）。 */
  readonly exportTargetId: string
}

/**
 * バナーを出すかどうか。`rejected` でも権限・削除は書き出しを促す場面ではない
 * （ピルの文言だけで足りる）ので、上限と大きすぎるときに限る。
 */
export const limitReasonOf = (connection: ConnectionState): LimitReason | undefined => {
  if (connection.kind !== 'rejected') return undefined
  if (connection.reason === 'limit' || connection.reason === 'too_large') return connection.reason
  return undefined
}

const TEXT: {
  readonly [R in LimitReason]: { readonly title: string; readonly body: string }
} = {
  limit: {
    title: '本日の同期上限に達しました',
    body: '編集は続けられます。この端末に残るので、書き出しておくと安全です。翌日の 09:00（日本時間）以降にページを再読み込みすると、また同期できます。',
  },
  too_large: {
    title: '文書が上限を超えました',
    body: '編集は続けられますが、これ以上は同期できません。本文を書き出して、いくつかの文書に分けてください。',
  },
}

const keyOf = (documentId: string): string => `noter-limit-banner:${documentId}`

/** `sessionStorage` は private モードや設定で落ちる。読めなくても画面は動く。 */
const wasDismissed = (documentId: string): boolean => {
  try {
    return globalThis.sessionStorage.getItem(keyOf(documentId)) !== null
  } catch {
    return false
  }
}

const rememberDismissed = (documentId: string): void => {
  try {
    globalThis.sessionStorage.setItem(keyOf(documentId), '1')
  } catch {
    // 覚えられないだけ。閉じた状態はこの描画のあいだ保たれる
  }
}

/**
 * 上限に達したことを伝えるバナー（docs/design/ux.md §6.5）。
 *
 * **読み上げ領域にしない。** 同じ内容は `EditorScreen` のただ 1 つの
 * `LiveRegion` が `status.announce` として読み上げる
 * （docs/accessibility.md §2 の 4.1.3）。ここは見出しつきの領域として
 * 置き、支援技術からは見出し・領域の一覧で辿れるようにする。
 *
 * 閉じたことはタブの中だけで覚える（同じ文書を開き直すまで出さない）。
 */
export const LimitBanner = ({ reason, documentId, exportTargetId }: LimitBannerProps) => {
  const titleId = useId()
  const [dismissed, setDismissed] = useState(() => wasDismissed(documentId))
  if (dismissed) return undefined

  const text = TEXT[reason]
  return (
    <section className="noter-limit-banner" aria-labelledby={titleId}>
      <h2 className="noter-limit-banner__title" id={titleId}>
        {text.title}
      </h2>
      <p className="noter-limit-banner__body">{text.body}</p>
      <p className="noter-limit-banner__actions">
        <a className="noter-limit-banner__link" href={`#${exportTargetId}`}>
          書き出しの操作へ移動
        </a>
        <button
          type="button"
          className="noter-limit-banner__close"
          onClick={() => {
            rememberDismissed(documentId)
            setDismissed(true)
          }}
        >
          閉じる
        </button>
      </p>
    </section>
  )
}
