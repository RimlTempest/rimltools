import type { ReactNode } from 'react'

type HomeScreenProps = {
  /**
   * 生成と読み取りの中身。shell はこの 2 つの feature を知らずに置き場所だけ決める。
   * 実際の配線は `home.route.tsx`（アプリ側の composition root）が行う。
   */
  readonly generate?: ReactNode
  readonly scan?: ReactNode
  readonly renderLink?: (props: { readonly to: string; readonly label: string }) => ReactNode
}

const defaultRenderLink = ({ to, label }: { readonly to: string; readonly label: string }) => (
  <a href={to}>{label}</a>
)

/**
 * トップページ。**作る**と**読み取る**をこの 1 ページに置く。
 *
 * 別ページに分けていたものを統合したのは、この 2 つがこのアプリの本体で、
 * どちらもサインインなしで完結するため。入口で選ばせず、来たらすぐ使える形にする。
 *
 * 中身の見出しは h2 で始める（`headingLevel={2}`）。h1 はページの主題ひとつに
 * 使い、見出しの一覧だけでページ構造が読めるようにする（AAA 2.4.10）。
 */
export const HomeScreen = ({ generate, scan, renderLink = defaultRenderLink }: HomeScreenProps) => (
  <>
    <h1>QR コードとバーコードを、作って読む</h1>
    <p>
      <strong>サインインしなくても使えます。</strong>
      生成も読み取りもお使いの端末の中で動くので、入力した内容や読み取った画像が
      サーバに送られることはありません。
    </p>
    <p>
      作ったコードを保存・整理・共有したいときだけ、
      {renderLink({ to: '/sign-in', label: 'サインインの方法を見る' })}。
      {renderLink({ to: '/print', label: 'ラベル台紙への印刷' })}も用意しています。
    </p>

    {/*
     * それぞれをランドマークにして、支援技術が「作る」「読み取る」を
     * 行き来できるようにする。名前は中の見出しと同じ文言にする。
     */}
    <section className="qrcc-home__section" aria-label="コードを作る">
      {generate}
    </section>
    <section className="qrcc-home__section" aria-label="コードを読み取る">
      {scan}
    </section>
  </>
)
