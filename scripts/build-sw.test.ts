import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildServiceWorker, parseBuildSwArgs } from './build-sw.ts'

describe('parseBuildSwArgs', () => {
  test('takes an entry and an output path', () => {
    expect(parseBuildSwArgs(['src/sw/sw.ts', 'public/sw.js'])).toEqual({
      ok: true,
      value: { entry: 'src/sw/sw.ts', out: 'public/sw.js' },
    })
  })

  test.each([[[]], [['src/sw/sw.ts']], [['a.ts', 'b.js', 'c']]])('rejects %p', (argv) => {
    expect(parseBuildSwArgs(argv).ok).toBe(false)
  })

  test('refuses an output that is not a .js file', () => {
    expect(parseBuildSwArgs(['src/sw/sw.ts', 'public/sw.ts']).ok).toBe(false)
  })
})

describe('buildServiceWorker', () => {
  test('bundles TypeScript into one classic script with no imports left', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'build-sw-'))
    try {
      await writeFile(join(dir, 'dep.ts'), 'export const name: string = "v1"\n')
      await writeFile(
        join(dir, 'sw.ts'),
        'import { name } from "./dep.ts"\nconst cacheName: string = name\nconsole.warn(cacheName)\n',
      )
      const out = join(dir, 'out', 'sw.js')
      const result = await buildServiceWorker({ entry: join(dir, 'sw.ts'), out })
      expect(result.ok).toBe(true)
      const js = await readFile(out, 'utf8')
      expect(js).toContain('"v1"')
      // SW は classic script として登録する（register('/sw.js')）ので import / export が残ってはいけない
      expect(js).not.toMatch(/^\s*(import|export)\s/m)
      expect(js).not.toContain(': string')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
