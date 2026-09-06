import type { ReactNode } from 'react'
import { SkipLink, themeInitScript } from '@qrcc/ui'

const themeInitHtml = { __html: themeInitScript }

/**
 * アプリ全体の HTML ドキュメント。
 *
 * テーマ初期化スクリプトは `@qrcc/ui` から受け取る。保存キーや判定を
 * ここに書き写すと、片方だけ直したときに静かに壊れるため。
 */
export const RootDocument = ({ children }: { readonly children: ReactNode }) => (
  <html lang="ja">
    <head>
      {/* 最初の描画より前に data-theme を当てて、テーマのちらつきを防ぐ */}
      <script dangerouslySetInnerHTML={themeInitHtml} />
      {/*
        アドレスバーの色。--qrcc-surface のライト/ダークと揃える。
        TanStack Router の head 管理（documentHead）に置くと `name` で
        重複排除され、後勝ちの 1 つしか配信 HTML に残らない。ここに
        直接書けば重複排除を通らず、ライトとダーク両方が残る
      */}
      <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
      <meta name="theme-color" content="#0f1217" media="(prefers-color-scheme: dark)" />
    </head>
    <body>
      <SkipLink targetId="main" />
      {children}
    </body>
  </html>
)

/**
 * `<head>` の内容。スタイルシートの場所はアプリが決めるので引数で受け取る
 * （feature がアプリの構成に手を伸ばさないため）。
 *
 * TanStack Router の head は可変配列を期待するため `as const` を付けない。
 *
 * **`theme-color` はここに置かない。** TanStack Router の head 管理は
 * `name` で重複排除するため、ライト/ダークの 2 つを置いても後勝ちで
 * 1 つしか配信 HTML に残らない（`RootDocument` に直接書いている）。
 */
export const documentHead = (stylesheetHref: string) => () => ({
  meta: [
    { charSet: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { title: 'qrcc — QR・バーコード管理' },
    {
      name: 'description',
      content:
        'QR コードとバーコードを生成・読み取り・管理・印刷できるツール。生成と読み取りは端末側で動くので、ログインなしでも使えます。',
    },
  ],
  links: [
    { rel: 'stylesheet', href: stylesheetHref },
    { rel: 'manifest', href: '/manifest.webmanifest' },
    { rel: 'icon', href: '/icon.svg', type: 'image/svg+xml' },
    { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
  ],
})
