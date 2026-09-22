/**
 * workspace 間で同じパッケージの版がずれていないかを確かめる（判定は scripts/lib/versions.ts）。
 * `bun run check:root` と CI の root ジョブから呼ぶ。ずれていたら 1 で終わる。
 *
 *   bun scripts/check-versions.ts
 */
import { Glob } from 'bun'

import { describeProblem, findVersionProblems, parseLockVersions } from './lib/versions.ts'
import type { Manifest } from './lib/versions.ts'

const ROOT = new URL('..', import.meta.url).pathname

const readJson = async (path: string): Promise<unknown> => Bun.file(path).json()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const stringMap = (value: unknown): Record<string, string> | undefined => {
  if (!isRecord(value)) return undefined
  const out: Record<string, string> = {}
  for (const [key, spec] of Object.entries(value)) if (typeof spec === 'string') out[key] = spec
  return out
}

const toManifest = (path: string, raw: unknown): Manifest => {
  const source = isRecord(raw) ? raw : {}
  const manifest: {
    path: string
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  } = { path }
  const dependencies = stringMap(source['dependencies'])
  const devDependencies = stringMap(source['devDependencies'])
  const peerDependencies = stringMap(source['peerDependencies'])
  if (dependencies !== undefined) manifest.dependencies = dependencies
  if (devDependencies !== undefined) manifest.devDependencies = devDependencies
  if (peerDependencies !== undefined) manifest.peerDependencies = peerDependencies
  return manifest
}

const rootManifest = await readJson(`${ROOT}package.json`)
const patterns =
  isRecord(rootManifest) && Array.isArray(rootManifest['workspaces'])
    ? rootManifest['workspaces'].filter((p): p is string => typeof p === 'string')
    : []

const scanned = await Promise.all(
  patterns.map((pattern) =>
    Array.fromAsync(new Glob(`${pattern}/package.json`).scan({ cwd: ROOT })),
  ),
)
const paths = ['package.json', ...scanned.flat()]

const manifests = await Promise.all(
  paths
    .toSorted()
    .map(async (path) =>
      toManifest(path.replace(/\/?package\.json$/, '') || '.', await readJson(`${ROOT}${path}`)),
    ),
)
const lockVersions = parseLockVersions(await Bun.file(`${ROOT}bun.lock`).text())

const problems = findVersionProblems(manifests, lockVersions)
if (problems.length > 0) {
  for (const problem of problems) console.error(`::error::${describeProblem(problem)}`)
  console.error(
    '\nAlign the versions in every package.json (Dependabot groups them), then run bun install.',
  )
  process.exit(1)
}
console.log(`versions agree across ${manifests.length} workspaces`)
