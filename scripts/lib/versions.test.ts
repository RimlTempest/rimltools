import { describe, expect, test } from 'bun:test'

import { findVersionProblems, parseLockVersions } from './versions.ts'
import type { Manifest } from './versions.ts'

const manifest = (path: string, sections: Omit<Manifest, 'path'>): Manifest => ({
  path,
  ...sections,
})

describe('findVersionProblems', () => {
  test('agreeing pins and satisfied peer ranges are fine; workspace links are ignored', () => {
    const problems = findVersionProblems(
      [
        manifest('a', { dependencies: { react: '19.2.8', '@x/y': 'workspace:*' } }),
        manifest('b', {
          devDependencies: { react: '19.2.8' },
          peerDependencies: { react: '^19.2.0' },
        }),
      ],
      new Map([['react', ['19.2.8']]]),
    )
    expect(problems).toEqual([])
  })

  test('reports the same package pinned to different versions, with who uses which', () => {
    const problems = findVersionProblems(
      [
        manifest('apps/qrcc', { dependencies: { 'better-auth': '1.7.2' } }),
        manifest('apps/noter', { dependencies: { 'better-auth': '1.7.3' } }),
      ],
      new Map([['better-auth', ['1.7.2', '1.7.3']]]),
    )
    expect(problems).toContainEqual({
      kind: 'pinned-drift',
      name: 'better-auth',
      detail: '1.7.2 (apps/qrcc), 1.7.3 (apps/noter)',
    })
  })

  test('reports a peer range that the pinned version does not satisfy', () => {
    const problems = findVersionProblems(
      [
        manifest('app', { dependencies: { react: '19.2.8' } }),
        manifest('lib', { peerDependencies: { react: '^18.0.0' } }),
      ],
      new Map([['react', ['19.2.8']]]),
    )
    expect(problems).toEqual([
      {
        kind: 'peer-unsatisfied',
        name: 'react',
        detail: 'lib wants ^18.0.0, workspaces pin 19.2.8',
      },
    ])
  })

  test('reports a shared package that resolved to more than one version in bun.lock', () => {
    const problems = findVersionProblems(
      [
        manifest('a', { dependencies: { 'better-auth': '1.7.5' } }),
        manifest('b', { devDependencies: { 'better-auth': '1.7.5' } }),
      ],
      new Map([['better-auth', ['1.7.3', '1.7.5']]]),
    )
    expect(problems).toEqual([
      { kind: 'lock-duplicate', name: 'better-auth', detail: 'bun.lock has 1.7.3, 1.7.5' },
    ])
  })

  test('packages used by a single workspace are not checked against bun.lock', () => {
    const problems = findVersionProblems(
      [manifest('a', { dependencies: { solo: '1.0.0' } })],
      new Map([['solo', ['0.9.0', '1.0.0']]]),
    )
    expect(problems).toEqual([])
  })
})

describe('parseLockVersions', () => {
  test('collects every resolved version per package name, including nested copies', () => {
    const lock = `{
  "lockfileVersion": 1,
  "packages": {
    "better-auth": ["better-auth@1.7.5", "", {}, "sha512-a"],
    "@rimltools/auth/better-auth": ["better-auth@1.7.3", "", {}, "sha512-b"],
    "@better-auth/core": ["@better-auth/core@1.7.5", "", {}, "sha512-c"],
    "@rimltools/auth": ["@rimltools/auth@workspace:packages/auth"],
  }
}`
    const versions = parseLockVersions(lock)
    expect(versions.get('better-auth')).toEqual(['1.7.3', '1.7.5'])
    expect(versions.get('@better-auth/core')).toEqual(['1.7.5'])
    expect(versions.has('@rimltools/auth')).toBe(false)
  })
})
