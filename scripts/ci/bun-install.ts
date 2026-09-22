/**
 * CI 用の `bun install --frozen-lockfile`。通信の一時的な失敗のときだけ、間隔を空けて
 * 最大 3 回まで試す（判定は scripts/lib/install-retry.ts）。カレントディレクトリで実行する。
 *
 *   bun "$GITHUB_WORKSPACE/scripts/ci/bun-install.ts"
 */

import { isTransientInstallFailure, planRetries } from '../lib/install-retry.ts'

const ATTEMPTS = 3

const install = async (): Promise<{ code: number; output: string }> => {
  const proc = Bun.spawn(['bun', 'install', '--frozen-lockfile'], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  process.stdout.write(stdout)
  process.stderr.write(stderr)
  return { code, output: `${stdout}\n${stderr}` }
}

const run = async (waits: number[], attempt: number): Promise<number> => {
  const result = await install()
  if (result.code === 0) return 0
  const [wait, ...rest] = waits
  if (wait === undefined || !isTransientInstallFailure(result.output)) return result.code
  console.warn(
    `::warning::bun install failed with a transient network error (attempt ${attempt}/${ATTEMPTS}). Retrying in ${wait / 1000}s.`,
  )
  await Bun.sleep(wait)
  return run(rest, attempt + 1)
}

process.exit(await run(planRetries(ATTEMPTS), 1))
