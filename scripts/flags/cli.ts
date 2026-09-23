/**
 * feature flag の運用 CLI（CI から呼ぶ）。
 *
 *   bun scripts/flags/cli.ts validate
 *   bun scripts/flags/cli.ts sync-sql <tool> <out.sql>
 *   bun scripts/flags/cli.ts kill-sql <flag> <out.sql>
 *   bun scripts/flags/cli.ts wrangler-config <tool> <out.json>
 *       環境変数 WORKER_SUFFIX（"" | "-staging"）と D1_<TOOL>_ID（例: D1_QRCC_ID）を読む
 */
import { Glob } from 'bun'

import { findTool, loadTools } from '../lib/tools.ts'
import { validateFlagFiles } from './files.ts'
import { buildKillSwitchSql, buildSyncSql, buildWranglerConfig } from './sql.ts'

const root = new URL('../../', import.meta.url)
const flagsDir = new URL('flags/', root)

const fail = (message: string): never => {
  console.error(message)
  process.exit(1)
}

const readFlagFiles = async (): Promise<Record<string, unknown>> => {
  const files: Record<string, unknown> = {}
  for await (const name of new Glob('*.json').scan(flagsDir.pathname)) {
    if (name === 'schema.json') continue
    files[name] = await Bun.file(new URL(name, flagsDir)).json()
  }
  return files
}

const validated = async () => {
  const registry = await loadTools()
  if (!registry.ok) return fail(registry.error)
  const files = validateFlagFiles(registry.value, await readFlagFiles())
  if (!files.ok) return fail(files.error.join('\n'))
  return { registry: registry.value, files: files.value }
}

const now = () => Math.floor(Date.now() / 1000)

const [command, arg, out] = process.argv.slice(2)

switch (command) {
  case 'validate': {
    const { files } = await validated()
    for (const file of files) console.log(`${file.tool}: ${file.flags.length} flag(s) ok`)
    break
  }
  case 'sync-sql': {
    if (arg === undefined || out === undefined) fail('usage: sync-sql <tool> <out.sql>')
    const { files } = await validated()
    const file = files.find((f) => f.tool === arg) ?? fail(`flags/${arg}.json not found`)
    await Bun.write(out ?? '', buildSyncSql({ flags: file.flags, remove: file.remove, now: now() }))
    console.log(`wrote ${out} (${file.flags.length} upserts, ${file.remove.length} removals)`)
    break
  }
  case 'kill-sql': {
    if (arg === undefined || out === undefined) fail('usage: kill-sql <flag> <out.sql>')
    const sql = buildKillSwitchSql(arg ?? '', now())
    if (!sql.ok) fail(sql.error)
    else await Bun.write(out ?? '', `${sql.value}\n`)
    break
  }
  case 'wrangler-config': {
    if (arg === undefined || out === undefined) fail('usage: wrangler-config <tool> <out.json>')
    const registry = await loadTools()
    if (!registry.ok) fail(registry.error)
    else {
      const tool = findTool(registry.value, arg ?? '')
      if (!tool.ok) fail(tool.error)
      else {
        const [d1] = tool.value.d1
        if (d1 === undefined) fail(`${tool.value.name} has no D1 database`)
        const suffix = process.env['WORKER_SUFFIX'] ?? ''
        const config = buildWranglerConfig({
          tool: tool.value.name,
          databaseName: `${d1?.name ?? ''}${suffix}`,
          databaseId: process.env[`D1_${tool.value.name.toUpperCase()}_ID`] ?? '',
        })
        if (!config.ok) fail(config.error)
        else await Bun.write(out ?? '', `${JSON.stringify(config.value, null, 2)}\n`)
      }
    }
    break
  }
  case undefined:
  default:
    fail('usage: cli.ts <validate | sync-sql | kill-sql | wrangler-config> ...')
}
