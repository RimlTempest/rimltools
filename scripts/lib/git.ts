import type { Result } from './tools.ts'

/** git を読むだけの補助（書き込みはしない） */
export const git = async (args: string[], cwd?: string): Promise<Result<string, string>> => {
  const proc = Bun.spawn(['git', ...args], {
    ...(cwd === undefined ? {} : { cwd }),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return code === 0
    ? { ok: true, value: stdout }
    : { ok: false, error: `git ${args.join(' ')}: ${stderr.trim()}` }
}

export const changedFiles = async (
  base: string,
  head: string,
): Promise<Result<string[], string>> => {
  const out = await git(['diff', '--name-only', `${base}...${head}`])
  if (!out.ok) return out
  return { ok: true, value: out.value.split('\n').filter((l) => l !== '') }
}

export const commitTitles = async (
  base: string,
  head: string,
): Promise<Result<string[], string>> => {
  const out = await git(['log', '--format=%s', `${base}..${head}`])
  if (!out.ok) return out
  return { ok: true, value: out.value.split('\n').filter((l) => l !== '') }
}
