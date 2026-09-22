import { useCallback, useState } from 'react'

export type Announcer = {
  /** いま live region に出ている文言。 */
  readonly message: string | undefined
  /** `null` は「読まない」。いま出ている文言はそのまま残す。 */
  readonly announce: (text: string | null) => void
}

/**
 * 画面にただ 1 つある読み上げ領域への入口（`docs/accessibility.md` §2 の 4.1.3）。
 *
 * 接続状態・参加者の増減・操作の結果を全部ここに集める。領域を分けると
 * 同時に複数が読み上げられ、どれも聞き取れなくなる。
 *
 * 同じ文言を続けて渡しても React が再描画しないので、live region は
 * 読み直さない（「初回のみ接続しました」はこれで満たす）。
 */
export const useAnnouncer = (): Announcer => {
  const [message, setMessage] = useState<string | undefined>(undefined)

  const announce = useCallback((text: string | null): void => {
    if (text === null || text === '') return
    setMessage(text)
  }, [])

  return { message, announce }
}
