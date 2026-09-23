/**
 * 「変換して新規作成」を試みた結果。
 *
 * 作成も遷移も配線側（`*.route.tsx`）の仕事で、この画面は結果を読み上げる
 * だけ。失敗の理由は画面の言葉になった `message` で受け取る。
 */
export type ConvertOutcome =
  /** 新しい文書を作って、そちらへ移った。 */
  | { readonly kind: 'created' }
  /** 変換できなかった。理由をそのまま伝える。 */
  | { readonly kind: 'failed'; readonly message: string }
