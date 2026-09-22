/**
 * ops/dashboards/*.json（Terraform が Grafana に配る正本）の整合性チェック。
 * data source は Terraform が作る 3 つ（infra/grafana/datasources.tf）だけを参照させる。
 * そうしておくと、相関（exemplar → trace、trace → log、log → trace）が常に効く。
 */

export const MANAGED_DATASOURCES: ReadonlySet<string> = new Set([
  'rt-mimir',
  'rt-loki',
  'rt-tempo',
  // Grafana 組み込み（annotation など）
  '-- Grafana --',
  'grafana',
  // 変数で差し替える場合
  '${datasource}',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

const datasourceUid = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value
  if (isRecord(value) && typeof value['uid'] === 'string') return value['uid']
  return undefined
}

const flattenPanels = (panels: unknown[]): Record<string, unknown>[] =>
  panels.flatMap((p) => (isRecord(p) ? [p, ...flattenPanels(list(p['panels']))] : []))

const checkPanel = (panel: Record<string, unknown>, errors: string[]): void => {
  const label = `panel ${String(panel['id'])} "${String(panel['title'])}"`
  const uids = [
    datasourceUid(panel['datasource']),
    ...list(panel['targets']).map((t) =>
      isRecord(t) ? datasourceUid(t['datasource']) : undefined,
    ),
  ].filter((uid): uid is string => uid !== undefined)
  for (const uid of uids) {
    if (!MANAGED_DATASOURCES.has(uid)) errors.push(`${label}: unknown data source uid "${uid}"`)
  }
  const refIds = new Set<string>()
  for (const target of list(panel['targets'])) {
    if (!isRecord(target)) continue
    const refId = String(target['refId'])
    if (refIds.has(refId)) errors.push(`${label}: duplicate refId "${refId}"`)
    refIds.add(refId)
  }
}

export const checkDashboard = (raw: unknown): string[] => {
  if (!isRecord(raw)) return ['dashboard: expected an object']
  const errors: string[] = []
  const uid = typeof raw['uid'] === 'string' ? raw['uid'] : ''
  if (!uid.startsWith('rimltools-')) errors.push('uid must start with "rimltools-"')
  if (typeof raw['title'] !== 'string' || raw['title'] === '') errors.push('title is required')
  if (typeof raw['schemaVersion'] !== 'number') errors.push('schemaVersion is required')

  const annotations = isRecord(raw['annotations']) ? list(raw['annotations']['list']) : []
  const hasDeploy = annotations.some(
    (a) => isRecord(a) && isRecord(a['target']) && list(a['target']['tags']).includes('deploy'),
  )
  if (!hasDeploy) errors.push('the deploy annotation (tags: ["deploy"]) is required')

  const ids = new Set<number>()
  for (const panel of flattenPanels(list(raw['panels']))) {
    const id = panel['id']
    if (typeof id === 'number') {
      if (ids.has(id)) errors.push(`duplicate panel id ${id}`)
      ids.add(id)
    }
    if (panel['type'] !== 'row') checkPanel(panel, errors)
  }
  return errors
}
