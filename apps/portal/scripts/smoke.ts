/**
 * デプロイ後の疎通確認: ポータルがツール一覧を返し、CSP が付いていること。
 *
 *   bun run smoke [https://tools.riml4i.com/]
 */

import { loadTools } from '../../../scripts/lib/tools.ts'

const registry = await loadTools()
if (!registry.ok) {
  console.error(registry.error)
  process.exit(1)
}
const url = process.argv[2] ?? `https://${registry.value.domain}/`
const res = await fetch(url, { redirect: 'manual' })
const html = await res.text()
const problems = [
  res.status === 200 ? null : `status ${res.status}`,
  res.headers.get('content-security-policy') === null ? 'missing Content-Security-Policy' : null,
  ...registry.value.tools
    .filter((t) => t.listed)
    .map((t) => (html.includes(`https://${t.host}/`) ? null : `missing link to ${t.host}`)),
].filter((p) => p !== null)

if (problems.length > 0) {
  console.error(`portal smoke failed for ${url}:\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log(`portal smoke ok: ${url}`)
