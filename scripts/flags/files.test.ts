import { describe, expect, test } from 'bun:test'

import { parseTools } from '../lib/tools.ts'
import type { Registry } from '../lib/tools.ts'
import { validateFlagFiles } from './files.ts'

const toolEntry = (name: string, d1: boolean) => ({
  name,
  title: name,
  description: name,
  path: `products/${name}`,
  subdomain: name,
  legacyHosts: [],
  workers: [{ name: `${name}-web`, role: 'public', buildConfig: 'x' }],
  d1: d1 ? [{ name, binding: 'DB', migrationsConfig: 'x' }] : [],
  release: { mode: 'canary', steps: [100], bakeMinutes: 1 },
  slo: { availability: 99.5, windowDays: 28 },
  smoke: { cli: 'x', browser: 'x', e2ePackage: 'x' },
})

const parsed = parseTools({
  domain: 'tools.example.com',
  zone: 'example.com',
  tools: [toolEntry('qrcc', true), toolEntry('noter', true), toolEntry('static', false)],
})
const registry: Registry = parsed.ok ? parsed.value : { domain: '', zone: '', tools: [] }

const empty = (tool: string) => ({ tool, flags: [], remove: [] })

describe('validateFlagFiles', () => {
  test('accepts one file per tool', () => {
    const result = validateFlagFiles(registry, {
      'qrcc.json': empty('qrcc'),
      'noter.json': empty('noter'),
    })
    expect(result.ok).toBe(true)
  })

  test('requires the file name to match the tool', () => {
    const result = validateFlagFiles(registry, { 'noter.json': empty('qrcc') })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.join()).toContain('noter.json')
  })

  test('rejects files for unknown tools and tools without D1', () => {
    expect(parsed.ok).toBe(true)
    expect(validateFlagFiles(registry, { 'ghost.json': empty('ghost') }).ok).toBe(false)
    expect(validateFlagFiles(registry, { 'static.json': empty('static') }).ok).toBe(false)
  })

  test('rejects removing a flag that is still defined', () => {
    const file = {
      tool: 'qrcc',
      remove: ['beta'],
      flags: [
        {
          key: 'beta',
          description: 'd',
          type: 'boolean',
          enabled: false,
          variants: { on: true, off: false },
          defaultVariant: 'off',
        },
      ],
    }
    const result = validateFlagFiles(registry, { 'qrcc.json': file })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.join()).toContain('beta')
  })

  test('reports flag definition errors with the file name', () => {
    const file = { tool: 'qrcc', remove: [], flags: [{ key: 'Bad Key' }] }
    const result = validateFlagFiles(registry, { 'qrcc.json': file })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.join()).toContain('qrcc.json')
  })
})
