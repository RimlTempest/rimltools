import type { ReactNode } from 'react'

type HomeScreenProps = {
  readonly renderLink?: (props: { readonly to: string; readonly label: string }) => ReactNode
}

const defaultRenderLink = ({ to, label }: { readonly to: string; readonly label: string }) => (
  <a href={to}>{label}</a>
)

/**
 * トップページ。
 *
 * 見出しの一覧だけでページ構造が分かるように、節ごとに見出しを置く（AAA 2.4.10）。
 * リンク文言は単体で行き先が分かるものにする（AAA 2.4.9）。
 */
export const HomeScreen = ({ renderLink = defaultRenderLink }: HomeScreenProps) => (
  <>
    <h1>QR コードとバーコードを、作って読んで管理する</h1>
    <p>
      生成と読み取りはお使いの端末の中で動きます。ログインしなくても使えて、
      読み取った画像がサーバに送られることもありません。
    </p>

    <h2>できること</h2>
    <ul>
      <li>
        <strong>作る</strong> — QR
        コードやバーコードを、誤り訂正レベルや配色まで細かく設定して生成します。
      </li>
      <li>
        <strong>読み取る</strong> — カメラでも、保存済みの画像ファイルからでも読み取れます。
      </li>
      <li>
        <strong>管理する</strong> — ログインすると、作ったコードを保存・編集・共有できます。
      </li>
      <li>
        <strong>印刷する</strong> — 市販のラベル台紙に合わせて面付けし、PDF でも出力できます。
      </li>
    </ul>

    <h2>はじめる</h2>
    <p>{renderLink({ to: '/generate', label: 'コードを作る画面へ進む' })}</p>
  </>
)
