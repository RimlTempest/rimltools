/**
 * infra/secrets に平文の秘密が無いことを確かめる（ADR-0009）。
 *
 *   bun scripts/check-secrets.ts
 *
 * lefthook の pre-commit と CI（security.yml）から呼ぶ。ディレクトリ全体を見る
 * （ステージしたファイルだけを見ると、既にある平文ファイルを見逃すため）。
 */
import { checkSecretsDirectory } from './lib/sops-guard.ts'

const DIR = 'infra/secrets'

const glob = new Bun.Glob(`${DIR}/**/*`)
const paths = await Array.fromAsync(glob.scan({ dot: true, onlyFiles: true }))
const contents = new Map(
  await Promise.all(paths.map(async (path) => [path, await Bun.file(path).text()] as const)),
)

const result = checkSecretsDirectory(paths.toSorted(), (path) => contents.get(path) ?? '')
if (!result.ok) {
  for (const line of result.error.split('\n')) console.error(`::error::${line}`)
  console.error('Encrypt secrets with sops before committing (infra/secrets/README.md).')
  process.exit(1)
}
console.log(`${DIR}: ${result.value} sops file(s) encrypted, no plaintext secrets.`)
