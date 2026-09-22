/**
 * 追跡中のファイルに JavaScript のソースが無いことを確かめる（CI の check:root と lefthook）。
 *
 *   bun scripts/check-no-js.ts
 */

import { $ } from 'bun'

import { findForbiddenJs } from './lib/no-js.ts'

const tracked = (await $`git ls-files`.quiet().text()).split('\n').filter((line) => line !== '')
const found = findForbiddenJs(tracked)

if (found.length > 0) {
  for (const file of found)
    console.error(`::error file=${file}::JavaScript source is not allowed. Write it in TypeScript.`)
  console.error('例外が必要なら scripts/lib/no-js.ts の NO_JS_EXCEPTIONS に理由付きで足す。')
  process.exit(1)
}
console.log(`no JavaScript sources in ${tracked.length} tracked files`)
