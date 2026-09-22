/**
 * HTML が参照している資産（JS・CSS・画像など）の URL を拾う。
 * 0% 検証の smoke（scripts/release）・プロダクトの smoke（scripts/smoke）・外形監視（scripts/ops）が
 * 同じ実装を使い、「どこまでを資産と見るか」だけを ASSET_SCOPES で変える。
 *
 * 返すのはページと同じオリジンの絶対 URL（出現順・重複なし）。data: URL は除く。
 */

export type AssetScope = {
  /** 資産として見る要素。'*' は href / src を持つすべての要素 */
  readonly elements: readonly string[] | '*'
  /** link 要素は、この rel を 1 つでも持つものだけ（無指定なら rel を問わない） */
  readonly linkRels?: readonly string[]
  /** このパスで始まるものだけ */
  readonly pathPrefix?: string
}

export const ASSET_SCOPES = {
  /**
   * 自分がアップロードした資産（`/assets/`）だけ。プロダクトの smoke 用。外部 CDN やファビコンまで
   * 叩くと、他人の障害でデプロイが落ちるため。
   */
  deployedAssets: { elements: '*', pathPrefix: '/assets/' },
  /** 新しい版の検証（0% 段階）。アイコンと manifest を含め、版に含まれるものを広く見る */
  release: {
    elements: ['script', 'link', 'img'],
    linkRels: ['stylesheet', 'modulepreload', 'preload', 'icon', 'manifest'],
  },
  /** 外形監視。表示に要るスクリプトとスタイルだけ（リクエスト数を抑えるため） */
  synthetic: {
    elements: ['script', 'link'],
    linkRels: ['stylesheet', 'modulepreload', 'preload'],
  },
} as const satisfies Record<string, AssetScope>

const TAG = /<([a-zA-Z][\w-]*)\b([^>]*)>/g
const ATTRIBUTE = /([^\s"'=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

const attributesOf = (source: string): Map<string, string> => {
  const attributes = new Map<string, string>()
  for (const match of source.matchAll(ATTRIBUTE)) {
    const name = (match[1] ?? '').toLowerCase()
    const value = match[2] ?? match[3] ?? ''
    if (!attributes.has(name)) attributes.set(name, value)
  }
  return attributes
}

// 要素ごとに、資産の場所を持つ属性
const referenceOf = (element: string, attributes: Map<string, string>): string[] => {
  if (element === 'link' || element === 'a') return [attributes.get('href') ?? '']
  if (element === 'script' || element === 'img' || element === 'source') {
    return [attributes.get('src') ?? '']
  }
  return [attributes.get('href') ?? '', attributes.get('src') ?? '']
}

const inScope = (element: string, attributes: Map<string, string>, scope: AssetScope): boolean => {
  if (scope.elements !== '*' && !scope.elements.includes(element)) return false
  if (element !== 'link' || scope.linkRels === undefined) return true
  const rels = (attributes.get('rel') ?? '').toLowerCase().split(/\s+/)
  return rels.some((rel) => scope.linkRels?.includes(rel) ?? false)
}

export const extractAssets = (html: string, pageUrl: string, scope: AssetScope): string[] => {
  const origin = new URL(pageUrl).origin
  const found = new Set<string>()
  for (const match of html.matchAll(TAG)) {
    const element = (match[1] ?? '').toLowerCase()
    const attributes = attributesOf(match[2] ?? '')
    if (!inScope(element, attributes, scope)) continue
    for (const reference of referenceOf(element, attributes)) {
      if (reference === '' || reference.startsWith('data:')) continue
      const url = new URL(reference, pageUrl)
      if (url.origin !== origin) continue
      if (scope.pathPrefix !== undefined && !url.pathname.startsWith(scope.pathPrefix)) continue
      found.add(url.href)
    }
  }
  return [...found]
}
