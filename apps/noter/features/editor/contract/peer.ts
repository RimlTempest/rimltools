/**
 * いま同じ文書を開いている他の人（自分は含めない）。
 *
 * 色は `DESIGN.md` §2.2 の presence トークンの番号。**色だけで人を識別させない**
 * ので、名前を必ず併記する。
 */
export type Peer = {
  /** awareness の clientID。同じ人が 2 タブ開けば 2 件になる。 */
  readonly clientId: number
  readonly name: string
  /** 0..7。`presenceIndex(actorId)` の結果。 */
  readonly colorIndex: number
}
