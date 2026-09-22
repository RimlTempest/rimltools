/**
 * Google ログインを試すときだけ、portless を通さず tools.json の固定ポートで dev を起動する。
 *
 *   bun run dev:qrcc:oauth   # → http://localhost:5173
 */

import { planOAuthDev } from '../lib/oauth-dev.ts'
import { findTool, loadTools } from '../lib/tools.ts'

const name = process.argv[2] ?? ''
const registry = await loadTools()
if (!registry.ok) {
  console.error(registry.error)
  process.exit(2)
}
const tool = findTool(registry.value, name)
if (!tool.ok) {
  console.error(tool.error)
  process.exit(2)
}
const plan = planOAuthDev(tool.value)
if (!plan.ok) {
  console.error(plan.error)
  process.exit(2)
}
console.log(`${name}: ${plan.value.url}`)
console.log(`Google の承認済みリダイレクト URI: ${plan.value.redirectUri}`)
const root = new URL('../../', import.meta.url).pathname
const proc = Bun.spawn(['bun', 'run', 'dev'], {
  cwd: `${root}${plan.value.cwd}`,
  env: { ...process.env, ...plan.value.env },
  stdio: ['inherit', 'inherit', 'inherit'],
})
process.exit(await proc.exited)
