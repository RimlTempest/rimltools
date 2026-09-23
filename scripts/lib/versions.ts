/**
 * workspace 間で同じパッケージの版がずれていないかを調べる（`scripts/check-versions.ts` が使う）。
 *
 * きっかけは better-auth: qrcc が 1.7.2、noter が 1.7.3 を固定していて、共通パッケージに
 * 版の違う型が 2 つ流れ込んだ。react・@tanstack/*・wrangler のように全ツールが使うものも、
 * 版がずれると 1 つの Worker やバンドルに 2 つ入る。
 *
 * 見るもの:
 * - `dependencies` / `devDependencies` の確定版（範囲でない指定）が workspace 間で一致しているか
 * - `peerDependencies` の範囲を、workspace が固定している版が満たしているか
 * - 2 つ以上の workspace が使うパッケージが、bun.lock で 1 つの版にしか解決されていないか（入れ子の別コピーが無いか）
 */

export type Manifest = {
  readonly path: string
  readonly dependencies?: Readonly<Record<string, string>>
  readonly devDependencies?: Readonly<Record<string, string>>
  readonly peerDependencies?: Readonly<Record<string, string>>
}

export type VersionProblem = {
  readonly kind: 'pinned-drift' | 'peer-unsatisfied' | 'lock-duplicate'
  readonly name: string
  readonly detail: string
}

/** 範囲ではなく 1 つの版を指す指定（`1.2.3`、`1.2.3-rc.1`）。 */
const EXACT = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

const isLocal = (spec: string): boolean =>
  spec.startsWith('workspace:') || spec.startsWith('file:') || spec.startsWith('link:')

type Use = { readonly spec: string; readonly path: string }

const pinnedUses = (manifests: readonly Manifest[]): Map<string, Use[]> => {
  const uses = new Map<string, Use[]>()
  for (const manifest of manifests) {
    for (const section of [manifest.dependencies, manifest.devDependencies]) {
      for (const [name, spec] of Object.entries(section ?? {})) {
        if (isLocal(spec)) continue
        uses.set(name, [...(uses.get(name) ?? []), { spec, path: manifest.path }])
      }
    }
  }
  return uses
}

const unique = (values: readonly string[]): string[] => [...new Set(values)].toSorted()

export const findVersionProblems = (
  manifests: readonly Manifest[],
  lockVersions: ReadonlyMap<string, readonly string[]>,
): VersionProblem[] => {
  const problems: VersionProblem[] = []
  const uses = pinnedUses(manifests)

  for (const [name, list] of [...uses].toSorted(([a], [b]) => a.localeCompare(b))) {
    const specs = unique(list.map((use) => use.spec))
    if (specs.length > 1) {
      const detail = specs
        .map((spec) => {
          const paths = unique(list.filter((use) => use.spec === spec).map((use) => use.path))
          return `${spec} (${paths.join(', ')})`
        })
        .join(', ')
      problems.push({ kind: 'pinned-drift', name, detail })
    }

    const workspaces = unique(list.map((use) => use.path))
    const resolved = unique(lockVersions.get(name) ?? [])
    if (workspaces.length > 1 && resolved.length > 1) {
      problems.push({ kind: 'lock-duplicate', name, detail: `bun.lock has ${resolved.join(', ')}` })
    }
  }

  for (const manifest of manifests) {
    for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
      if (isLocal(range)) continue
      const pinned = unique(
        (uses.get(name) ?? []).map((use) => use.spec).filter((spec) => EXACT.test(spec)),
      )
      const failing = pinned.filter((version) => !Bun.semver.satisfies(version, range))
      if (failing.length > 0) {
        problems.push({
          kind: 'peer-unsatisfied',
          name,
          detail: `${manifest.path} wants ${range}, workspaces pin ${failing.join(', ')}`,
        })
      }
    }
  }

  return problems
}

// "<key>": ["<name>@<version>", ...]  — key は入れ子なら "a/b/<name>"
const LOCK_ENTRY = /^\s*"[^"]+":\s*\["((?:@[^/"@]+\/)?[^/"@]+)@([^"]+)"/gm

/** bun.lock（テキスト形式）の packages から、パッケージ名ごとの解決済みの版を集める。 */
export const parseLockVersions = (lockText: string): Map<string, string[]> => {
  const versions = new Map<string, string[]>()
  for (const match of lockText.matchAll(LOCK_ENTRY)) {
    const name = match[1]
    const version = match[2]
    if (name === undefined || version === undefined || !EXACT.test(version)) continue
    versions.set(name, unique([...(versions.get(name) ?? []), version]))
  }
  return versions
}

export const describeProblem = (problem: VersionProblem): string => {
  switch (problem.kind) {
    case 'pinned-drift':
      return `${problem.name}: workspaces pin different versions: ${problem.detail}`
    case 'peer-unsatisfied':
      return `${problem.name}: peer range not satisfied: ${problem.detail}`
    case 'lock-duplicate':
      return `${problem.name}: more than one copy would be installed: ${problem.detail}`
  }
}
