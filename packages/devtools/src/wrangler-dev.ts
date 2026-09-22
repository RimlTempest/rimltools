#!/usr/bin/env bun
/**
 * `wrangler dev` を portless の PORT / HOST で起動する（portal など Vite を使わないアプリ用）。
 * 追加の引数はそのまま wrangler に渡す。PORT が無ければ wrangler の既定で起動する。
 *
 *   rimltools-wrangler-dev [wrangler dev の引数...]
 */

import { wranglerDevArgs } from './dev-server.ts'

const flags = wranglerDevArgs(process.env)
if (!flags.ok) {
  console.error(flags.error)
  process.exit(2)
}
const proc = Bun.spawn(['wrangler', 'dev', ...flags.value, ...process.argv.slice(2)], {
  stdio: ['inherit', 'inherit', 'inherit'],
})
process.exit(await proc.exited)
