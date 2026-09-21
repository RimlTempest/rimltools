/** CLI の composition root で使う環境変数と GitHub Actions の出力。 */

import { appendFile } from 'node:fs/promises'

export const env = (name: string): string | undefined => {
  const value = process.env[name]
  return value === undefined || value === '' ? undefined : value
}

/** GitHub Actions の job summary に追記する（ローカルでは標準出力へ） */
export const summary = async (markdown: string): Promise<void> => {
  const path = env('GITHUB_STEP_SUMMARY')
  if (path === undefined) console.log(markdown)
  else await appendFile(path, `${markdown}\n`)
}

export const docsBase = (): string =>
  `${env('GITHUB_SERVER_URL') ?? 'https://github.com'}/${env('GITHUB_REPOSITORY') ?? 'RimlTempest/rimltools'}/blob/develop`
