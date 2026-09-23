/**
 * workflow の `uses:` が改ざんできない参照（40 桁のコミット SHA）に固定されているかを検査する。
 * タグは付け替えられる（2026-03 の trivy-action 事件）ので、SHA 以外は供給網の穴になる。
 * `# vX.Y.Z` のコメントも必須。Dependabot はこのコメントを見て SHA のまま更新する。
 *
 * 使い方: bun scripts/security/pinned-actions.ts [--exempt <file>]... <dir-or-file>...
 */

export type Finding = { file: string; line: number; ref: string; reason: string }

const USES = /^\s*(?:-\s+)?uses:\s*["']?([^"'\s#]+)["']?\s*(#.*)?$/
const SHA = /^[^@\s]+@[0-9a-f]{40}$/
const DIGEST = /^docker:\/\/[^@\s]+@sha256:[0-9a-f]{64}$/
const VERSION_COMMENT = /^#\s*v?\d+(\.\d+){0,2}\b/

const inspect = (ref: string, comment: string | undefined): string | undefined => {
  // 同じリポジトリ内の action / reusable workflow はコミットと一緒に固定される
  if (ref.startsWith('./')) return undefined
  if (ref.startsWith('docker://')) {
    return DIGEST.test(ref) ? undefined : 'docker image is not pinned by sha256 digest'
  }
  if (!SHA.test(ref)) return 'not pinned to a 40-character commit SHA'
  if (comment === undefined || !VERSION_COMMENT.test(comment.trim())) {
    return 'missing a "# vX.Y.Z" version comment after the SHA'
  }
  return undefined
}

export const findUnpinnedUses = (file: string, source: string): Finding[] =>
  source.split('\n').flatMap((text, index) => {
    if (text.trimStart().startsWith('#')) return []
    const match = USES.exec(text)
    const ref = match?.[1]
    if (ref === undefined) return []
    const reason = inspect(ref, match?.[2])
    return reason === undefined ? [] : [{ file, line: index + 1, ref, reason }]
  })

type Args = { exempt: Set<string>; targets: string[] }

const parseArgs = (argv: string[]): Args => {
  const exempt = new Set<string>()
  const targets: string[] = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--exempt') {
      const name = argv[i + 1]
      if (name !== undefined) exempt.add(name)
      i += 1
    } else if (arg !== undefined) {
      targets.push(arg)
    }
  }
  return { exempt, targets: targets.length > 0 ? targets : ['.github'] }
}

const listYaml = async (target: string): Promise<string[]> => {
  if (/\.ya?ml$/.test(target)) return [target]
  const glob = new Bun.Glob('**/*.{yml,yaml}')
  return Array.fromAsync(glob.scan({ cwd: target })).then((files) =>
    files.map((f) => `${target}/${f}`),
  )
}

const main = async (): Promise<number> => {
  const { exempt, targets } = parseArgs(Bun.argv.slice(2))
  const files = (await Promise.all(targets.map(listYaml))).flat().toSorted()
  const checked = files.filter((file) => {
    const skip = exempt.has(file.split('/').at(-1) ?? file)
    if (skip) console.warn(`skip (exempt): ${file}`)
    return !skip
  })
  const findings = (
    await Promise.all(
      checked.map(async (file) => findUnpinnedUses(file, await Bun.file(file).text())),
    )
  ).flat()
  for (const f of findings) {
    // GitHub Actions の annotation 形式で出すと PR の差分上に表示される
    console.log(`::error file=${f.file},line=${f.line}::${f.ref}: ${f.reason}`)
  }
  console.log(`checked ${checked.length} files, ${findings.length} unpinned`)
  return findings.length === 0 ? 0 : 1
}

if (import.meta.main) process.exitCode = await main()
