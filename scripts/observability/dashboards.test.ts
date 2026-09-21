import { describe, expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'

import { checkDashboard } from './dashboards.ts'

const DIR = new URL('../../observability/dashboards/', import.meta.url)

describe('checkDashboard', () => {
  const panel = (id: number, uid: string) => ({
    id,
    type: 'timeseries',
    title: `p${id}`,
    datasource: { type: 'prometheus', uid },
    targets: [{ refId: 'A', datasource: { type: 'prometheus', uid }, expr: 'up' }],
  })
  const dashboard = (panels: unknown[]) => ({
    uid: 'rimltools-x',
    title: 'x',
    schemaVersion: 39,
    panels,
    annotations: {
      list: [
        { datasource: { type: 'grafana', uid: '-- Grafana --' }, target: { tags: ['deploy'] } },
      ],
    },
  })

  test('accepts a dashboard that only uses the managed data sources', () => {
    expect(checkDashboard(dashboard([panel(1, 'rt-mimir')]))).toEqual([])
  })

  test('rejects unknown data source uids, duplicate panel ids and duplicate refIds', () => {
    const bad = panel(1, 'rt-mimir')
    bad.targets.push({ refId: 'A', datasource: { type: 'prometheus', uid: 'rt-mimir' }, expr: 'x' })
    const errors = checkDashboard(dashboard([bad, panel(1, 'grafanacloud-prom')]))
    expect(errors.join('\n')).toContain('unknown data source uid "grafanacloud-prom"')
    expect(errors.join('\n')).toContain('duplicate panel id 1')
    expect(errors.join('\n')).toContain('duplicate refId "A"')
  })

  test('requires the rimltools- uid prefix and the deploy annotation', () => {
    const errors = checkDashboard({ uid: 'x', title: 't', schemaVersion: 39, panels: [] })
    expect(errors.join('\n')).toContain('uid must start with "rimltools-"')
    expect(errors.join('\n')).toContain('deploy annotation')
  })

  test('checks panels nested in rows', () => {
    const errors = checkDashboard(
      dashboard([{ id: 1, type: 'row', title: 'r', panels: [panel(2, 'nope')] }]),
    )
    expect(errors.join('\n')).toContain('unknown data source uid "nope"')
  })
})

describe('observability/dashboards/*.json', () => {
  test('every committed dashboard passes the checks and has a unique uid', async () => {
    const files = (await readdir(DIR)).filter((f) => f.endsWith('.json'))
    expect(files.length).toBeGreaterThan(0)
    const uids = new Set<string>()
    for (const file of files) {
      const raw: unknown = await Bun.file(new URL(file, DIR)).json()
      const errors = checkDashboard(raw)
      if (errors.length > 0) console.error(file, errors)
      expect(errors).toEqual([])
      const uid = typeof raw === 'object' && raw !== null && 'uid' in raw ? String(raw.uid) : ''
      expect(uids.has(uid)).toBe(false)
      uids.add(uid)
    }
  })
})
