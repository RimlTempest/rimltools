import { describe, expect, test } from 'bun:test'

import { parseTools } from './tools.ts'

const valid = {
  domain: 'tools.example.com',
  zone: 'example.com',
  tools: [
    {
      name: 'qrcc',
      title: 'QR',
      description: 'd',
      path: 'apps/qrcc',
      subdomain: 'qrcc',
      legacyHosts: ['qrcc.example.com'],
      rust: true,
      services: [
        { name: 'qrcc-api', role: 'internal', buildConfig: 'a.json' },
        { name: 'qrcc-web', role: 'public', buildConfig: 'b.json' },
      ],
      d1: [{ name: 'qrcc', binding: 'DB', migrationsConfig: 'services/api/wrangler.jsonc' }],
      release: { mode: 'canary', steps: [10, 50, 100], bakeMinutes: 10 },
      slo: { availability: 99.5, windowDays: 28 },
      smoke: { cli: 'bun run smoke', browser: 'bun run smoke:browser', e2ePackage: '@qrcc/e2e' },
    },
  ],
}

describe('parseTools', () => {
  test('accepts the registry and derives hosts', () => {
    const result = parseTools(valid)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const [tool] = result.value.tools
    expect(tool?.name).toBe('qrcc')
    expect(tool?.host).toBe('qrcc.tools.example.com')
  })

  test('rejects a tool without exactly one public worker', () => {
    const broken = structuredClone(valid)
    const [tool] = broken.tools
    if (tool === undefined) return
    for (const worker of tool.services) worker.role = 'internal'
    const result = parseTools(broken)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('qrcc: exactly one public worker')
  })

  test('rejects canary steps that do not end at 100', () => {
    const broken = structuredClone(valid)
    const [tool] = broken.tools
    if (tool === undefined) return
    tool.release.steps = [10, 50]
    const result = parseTools(broken)
    expect(result.ok).toBe(false)
  })

  test('rejects duplicate tool names', () => {
    const broken = structuredClone(valid)
    const [tool] = broken.tools
    if (tool === undefined) return
    broken.tools.push(structuredClone(tool))
    const result = parseTools(broken)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('duplicate tool name: qrcc')
  })

  test('lists tools by default and derives apex hosts from the domain', () => {
    const withPortal = structuredClone(valid)
    const [tool] = withPortal.tools
    if (tool === undefined) return
    withPortal.tools.push({ ...structuredClone(tool), name: 'portal', subdomain: 'portal' })
    const portal = withPortal.tools[1]
    if (portal === undefined) return
    Object.assign(portal, { apex: true, listed: false })
    const result = parseTools(withPortal)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const [qrcc, parsedPortal] = result.value.tools
    expect(qrcc?.listed).toBe(true)
    expect(parsedPortal?.listed).toBe(false)
    expect(parsedPortal?.host).toBe('tools.example.com')
  })

  test('accepts a tool without D1 databases', () => {
    const noDb = structuredClone(valid)
    const [tool] = noDb.tools
    if (tool === undefined) return
    tool.d1 = []
    expect(parseTools(noDb).ok).toBe(true)
  })

  test('reads the app secret names the public worker needs', () => {
    const withSecrets = structuredClone(valid)
    const [tool] = withSecrets.tools
    if (tool === undefined) return
    Object.assign(tool, { appSecrets: ['BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_ID'] })
    const result = parseTools(withSecrets)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.tools[0]?.appSecrets).toEqual(['BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_ID'])
  })

  test('defaults app secrets to none', () => {
    const result = parseTools(valid)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.tools[0]?.appSecrets).toEqual([])
  })

  test('rejects app secret names that wrangler cannot bind', () => {
    const broken = structuredClone(valid)
    const [tool] = broken.tools
    if (tool === undefined) return
    Object.assign(tool, { appSecrets: ['better-auth'] })
    const result = parseTools(broken)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('appSecrets')
  })

  test('rejects non-objects', () => {
    expect(parseTools(null).ok).toBe(false)
    expect(parseTools({ tools: 'x' }).ok).toBe(false)
  })
})

describe('fixedDevPort', () => {
  test('省略すると null（認証の無いツール）', () => {
    const result = parseTools(valid)
    expect(result.ok && result.value.tools[0]?.fixedDevPort).toBeNull()
  })

  test('1024〜65535 の整数を受け付ける', () => {
    const withPort = structuredClone(valid)
    const [tool] = withPort.tools
    if (tool === undefined) return
    Object.assign(tool, { fixedDevPort: 5173 })
    const result = parseTools(withPort)
    expect(result.ok && result.value.tools[0]?.fixedDevPort).toBe(5173)
  })

  test.each([80, 70000, 5173.5, '5173'])('不正な値 %p を拒否する', (port) => {
    const broken = structuredClone(valid)
    const [tool] = broken.tools
    if (tool === undefined) return
    Object.assign(tool, { fixedDevPort: port })
    expect(parseTools(broken).ok).toBe(false)
  })

  test('ツール間で同じポートは使えない（Google のリダイレクト URI がぶつかる）', () => {
    const broken = structuredClone(valid)
    const [tool] = broken.tools
    if (tool === undefined) return
    Object.assign(tool, { fixedDevPort: 5173 })
    broken.tools.push({ ...structuredClone(tool), name: 'other', subdomain: 'other' })
    const result = parseTools(broken)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('fixedDevPort 5173')
  })
})
