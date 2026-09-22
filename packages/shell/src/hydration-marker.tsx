import { useEffect } from 'react'

/** React がつながった（ハイドレーションを終えた）ことを示す `<html>` の属性。 */
export const HYDRATED_ATTRIBUTE = 'data-hydrated'

/**
 * ハイドレーションが終わったら `<html data-hydrated="true">` を立てる。
 *
 * サーバが描いた HTML は、React がつながる前から見えて操作できる。その間の操作
 * （ファイル選択・セレクトの変更など）は React に届かず失われる。e2e は、この目印を
 * 待ってから操作する（並列実行で CPU が混むと、ハイドレーションが load より遅れるため）。
 * `<body>` の末尾に置くので、同じコミットでつながった本文のエフェクトより後に走る。
 */
export const HydrationMarker = () => {
  useEffect(() => {
    document.documentElement.setAttribute(HYDRATED_ATTRIBUTE, 'true')
  }, [])
  return null
}
