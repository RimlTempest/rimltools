import { describe, expect, test } from 'bun:test'

import { quotaStatus } from './quota.ts'
import { DASHBOARD_MARKER, renderDashboard, renderFreeze } from './report.ts'
import { errorBudget } from './slo.ts'

const base = 'https://github.com/o/r/blob/develop'

const input = {
  docsBase: base,
  generatedAt: '2026-09-22T00:15:00Z',
  windowDays: 28,
  tools: [
    {
      name: 'qrcc',
      host: 'qrcc.tools.example.com',
      budget: errorBudget(99.5, { requests: 10_000, errors: 10 }),
    },
    {
      name: 'noter',
      host: 'noter.tools.example.com',
      budget: errorBudget(99.5, { requests: 0, errors: 0 }),
    },
  ],
  quota: [
    {
      day: '2026-09-21',
      items: quotaStatus({ workersRequests: 80_000, d1RowsWritten: 1_000, d1RowsRead: 10 }),
    },
  ],
  notes: [],
}

describe('renderDashboard', () => {
  test('carries a marker so the job can find its own issue', () => {
    expect(renderDashboard(input)).toContain(DASHBOARD_MARKER)
  })

  test('shows availability, remaining budget and quota ratios', () => {
    const body = renderDashboard(input)
    expect(body).toContain('| qrcc | 99.900% | 99.5% | 80.0% | 🟢 healthy |')
    expect(body).toContain('| noter | — | 99.5% | 100.0% | ⚪ no-traffic |')
    expect(body).toContain('| Workers requests | 80,000 | 100,000 | 80.0% ⚠️ |')
  })

  test('includes notes such as skipped data sources', () => {
    expect(renderDashboard({ ...input, notes: ['Cloudflare credentials missing'] })).toContain(
      '- Cloudflare credentials missing',
    )
  })
})

describe('renderFreeze', () => {
  test('names the exhausted tools and how to lift the freeze', () => {
    const body = renderFreeze(['qrcc'], base)
    expect(body).toContain('qrcc')
    expect(body).toContain('release-freeze')
    expect(body).toContain(`${base}/docs/slo.md`)
  })

  test('links to the docs with absolute URLs (issue bodies do not resolve relative links)', () => {
    expect(renderDashboard(input)).toContain(`(${base}/docs/slo.md)`)
  })
})
