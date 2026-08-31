import appCss from '@qrcc/ui/styles.css?url'

const themeInit = `(()=>{try{const t=localStorage.getItem('qrcc-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch{}})()`
const themeInitHtml = { __html: themeInit }

/** アプリ全体の HTML ドキュメント。ランドマークとスキップリンクをここで担保する。 */
export const RootDocument = ({ children }: { readonly children: React.ReactNode }) => (
  <html lang="ja">
    <head>
      {/* OS 設定より前にユーザーの明示選択を当て、テーマのちらつきを防ぐ */}
      <script dangerouslySetInnerHTML={themeInitHtml} />
    </head>
    <body>
      <a className="skip-link" href="#main">
        本文へスキップ
      </a>
      {children}
    </body>
  </html>
)

/** TanStack Router の head は可変配列を期待するため as const を付けない。 */
export const documentHead = () => ({
  meta: [
    { charSet: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { title: 'qrcc — QR・バーコード管理' },
    {
      name: 'description',
      content: 'QR コードとバーコードを生成・読み取り・管理・印刷できるツール。',
    },
  ],
  links: [{ rel: 'stylesheet', href: appCss }],
})
