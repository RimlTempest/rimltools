/**
 * ポータル（tools.riml4i.com）の HTML を tools.json から作る。ビルド時に 1 度だけ動く。
 * インライン script / style を持たない（_headers の CSP で禁じている）。
 */

export type PortalTool = {
  name: string
  title: string
  description: string
  host: string
  listed: boolean
}

export type PortalInput = { domain: string; tools: PortalTool[] }

const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const page = (title: string, description: string, body: string): string =>
  [
    '<!doctype html>',
    '<html lang="ja">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    '<link rel="stylesheet" href="/styles.css">',
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
    '',
  ].join('\n')

const card = (tool: PortalTool): string =>
  [
    '<li class="tool">',
    `<h2><a href="https://${escapeHtml(tool.host)}/">${escapeHtml(tool.title)}</a></h2>`,
    `<p>${escapeHtml(tool.description)}</p>`,
    `<p class="host">${escapeHtml(tool.host)}</p>`,
    '</li>',
  ].join('\n')

export const renderIndex = (input: PortalInput): string => {
  const listed = input.tools.filter((t) => t.listed)
  return page(
    'RimlTools',
    '小さな Web ツール集',
    [
      '<header class="banner">',
      '<h1>RimlTools</h1>',
      '<p>日々の作業を少し楽にする、小さな Web ツール集です。</p>',
      '</header>',
      '<main>',
      '<ul class="tools" role="list">',
      ...listed.map(card),
      '</ul>',
      '</main>',
      '<footer class="footer">',
      '<p><a href="https://github.com/RimlTempest/rimltools">ソースコード（GitHub）</a></p>',
      '</footer>',
    ].join('\n'),
  )
}

export const renderNotFound = (_input: PortalInput): string =>
  page(
    'ページが見つかりません — RimlTools',
    'ページが見つかりません',
    [
      '<main class="not-found">',
      '<h1>ページが見つかりません</h1>',
      '<p>URL が変わったか、ページが無くなった可能性があります。</p>',
      '<p><a href="/">ツール一覧へ戻る</a></p>',
      '</main>',
    ].join('\n'),
  )
