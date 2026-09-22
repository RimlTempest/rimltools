import { describe, expect, test } from 'bun:test'

import { findForbiddenJs, NO_JS_EXCEPTIONS } from './no-js.ts'

describe('findForbiddenJs', () => {
  test('flags JavaScript sources anywhere in the repository', () => {
    expect(
      findForbiddenJs([
        'scripts/a.js',
        'tools/x/index.mjs',
        'apps/qrcc/services/web/public/sw.js',
        'packages/ui/src/b.jsx',
        'c.cjs',
      ]),
    ).toEqual([
      'apps/qrcc/services/web/public/sw.js',
      'c.cjs',
      'packages/ui/src/b.jsx',
      'scripts/a.js',
      'tools/x/index.mjs',
    ])
  })

  test('allows TypeScript, JSON and files that only look similar', () => {
    expect(
      findForbiddenJs(['a.ts', 'b.tsx', 'c.json', 'd.js.map', 'e.jsonc', 'docs/f.md', 'g.d.ts']),
    ).toEqual([])
  })

  test('allows the documented exceptions only', () => {
    expect(findForbiddenJs(['.agents/skills/some-skill/scripts/run.js'])).toEqual([])
    expect(findForbiddenJs(['.agents/skills-extra/run.js'])).toEqual([
      '.agents/skills-extra/run.js',
    ])
  })

  test('every exception has a reason', () => {
    for (const exception of NO_JS_EXCEPTIONS) expect(exception.reason.length).toBeGreaterThan(10)
  })
})
