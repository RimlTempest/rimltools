import type { ComponentType, ReactNode } from 'react'

import { HydrationMarker } from './hydration-marker.tsx'

export type DocumentConfig = {
  /** `<head>` に同期実行で差し込むテーマ初期化スクリプト（プロダクトの `@<tool>/ui` から渡す） */
  readonly themeInitScript: string
  /** 本文へ飛ぶリンク（プロダクトの `@<tool>/ui` の SkipLink） */
  readonly SkipLink: ComponentType<{ readonly targetId: string }>
  /** アドレスバーの色。プロダクトの surface トークンのライト / ダークと揃える */
  readonly themeColor: { readonly light: string; readonly dark: string }
  readonly title: string
  readonly description: string
}

/**
 * アプリ全体の HTML ドキュメント。
 *
 * テーマ初期化スクリプトはプロダクトの `@<tool>/ui` から受け取る。保存キーや判定を
 * ここに書き写すと、片方だけ直したときに静かに壊れるため。
 */
export const makeRootDocument = ({ themeInitScript, SkipLink, themeColor }: DocumentConfig) => {
  const themeInitHtml = { __html: themeInitScript }
  const RootDocument = ({ children }: { readonly children: ReactNode }) => (
    <html lang="ja">
      <head>
        {/* 最初の描画より前に data-theme を当てて、テーマのちらつきを防ぐ */}
        <script dangerouslySetInnerHTML={themeInitHtml} />
        {/*
        アドレスバーの色。プロダクトの surface のライト/ダークと揃える。
        TanStack Router の head 管理（documentHead）に置くと `name` で
        重複排除され、後勝ちの 1 つしか配信 HTML に残らない。ここに
        直接書けば重複排除を通らず、ライトとダーク両方が残る
      */}
        <meta name="theme-color" content={themeColor.light} media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content={themeColor.dark} media="(prefers-color-scheme: dark)" />
      </head>
      <body>
        <SkipLink targetId="main" />
        {children}
        {/* 末尾に置く。本文のエフェクトが走った後に「つながった」目印を立てる */}
        <HydrationMarker />
      </body>
    </html>
  )
  return RootDocument
}

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
export const makeDocumentHead =
  ({ title, description }: Pick<DocumentConfig, 'title' | 'description'>) =>
  (stylesheetHref: string) =>
  () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title },
      {
        name: 'description',
        content: description,
      },
    ],
    links: [
      { rel: 'stylesheet', href: stylesheetHref },
      { rel: 'icon', href: '/icon.svg', type: 'image/svg+xml' },
      { rel: 'manifest', href: '/manifest.webmanifest' },
      // iOS はマスカブルも SVG も見ない。ホーム画面用の PNG を別に渡す
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    ],
  })
