/**
 * ブラウザ側の計装（Grafana Faro）。docs/observability.md §ブラウザ。
 *
 * - 設定は Worker が <head> に埋め込んだ meta（`rimltools-telemetry`）から読む
 * - セッションのサンプリングは SDK を読み込む**前**に決める（外れたら 1 バイトも増えない）
 * - SDK は動的 import（初期表示のバンドルに入らない）
 * - 送る前に URL のクエリとハッシュを落とす（共有リンクのトークンなどを送らない）
 */

import {
  BROWSER_META_NAME,
  parseBrowserConfig,
  type BrowserConfig,
} from '../core/browser-config.ts'

export {
  BROWSER_META_NAME,
  parseBrowserConfig,
  type BrowserConfig,
} from '../core/browser-config.ts'

export type FaroInitOptions = {
  readonly url: string
  readonly app: {
    readonly name: string
    readonly version: string
    readonly environment: string
    readonly namespace: string
  }
}

export type FaroLoader = () => Promise<{ readonly initialize: (options: FaroInitOptions) => void }>

export type StartResult = 'disabled' | 'unsampled' | 'started' | 'failed'

const URL_WITH_QUERY = /^((?:https?:\/\/[^\s?#]*)|(?:\/[^\s?#]*))[?#]\S*$/

/** URL（絶対 or `/` 始まり）ならクエリとハッシュを落とす。それ以外はそのまま。 */
export const stripQuery = (value: string): string => URL_WITH_QUERY.exec(value)?.[1] ?? value

/** Faro の送信 item を走査し、URL らしき文字列のクエリを落とす（その場で書き換える）。 */
export const redactUrls = (value: unknown): void => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (typeof item === 'string') value[index] = stripQuery(item)
      else redactUrls(item)
    })
    return
  }
  if (typeof value !== 'object' || value === null) return
  for (const key of Object.keys(value)) {
    const child: unknown = Reflect.get(value, key)
    if (typeof child === 'string') Reflect.set(value, key, stripQuery(child))
    else redactUrls(child)
  }
}

export const startBrowserTelemetry = async (
  config: BrowserConfig | null,
  deps: { readonly load: FaroLoader; readonly random: () => number },
): Promise<StartResult> => {
  if (config === null) return 'disabled'
  if (deps.random() >= config.sampleRate) return 'unsampled'
  try {
    const faro = await deps.load()
    faro.initialize({
      url: config.url,
      app: {
        name: config.app,
        version: config.version,
        environment: config.environment,
        namespace: 'rimltools',
      },
    })
    return 'started'
  } catch {
    return 'failed'
  }
}

/**
 * 本物の Faro を読み込む。Web Vitals・JS エラー・fetch の計測と、同一オリジンの fetch への
 * traceparent 付与（Worker の trace と繋がる）を有効にする。console は拾わない（個人情報対策）。
 */
export const loadFaro: FaroLoader = async () => {
  const [sdk, tracing] = await Promise.all([
    import('@grafana/faro-web-sdk'),
    import('@grafana/faro-web-tracing'),
  ])
  return {
    initialize: (options) => {
      sdk.initializeFaro({
        url: options.url,
        app: options.app,
        instrumentations: [
          ...sdk.getWebInstrumentations({ captureConsole: false }),
          new tracing.TracingInstrumentation(),
        ],
        // どのセッションを送るかは startBrowserTelemetry が決めた
        sessionTracking: { samplingRate: 1 },
        beforeSend: (item) => {
          redactUrls(item)
          return item
        },
      })
    },
  }
}

/** DOM の型に依存しないための最小の形（パッケージは DOM lib なしで型検査する） */
export type MetaDocument = {
  readonly querySelector: (
    selector: string,
  ) => { readonly getAttribute: (name: string) => string | null } | null
}

/** Worker が埋め込んだ meta を読んで開始する。meta が無い・壊れていれば何もしない。 */
export const startFromDocument = (
  doc: MetaDocument,
  deps: { readonly load: FaroLoader; readonly random: () => number } = {
    load: loadFaro,
    random: () => Math.random(),
  },
): Promise<StartResult> => {
  const content = doc.querySelector(`meta[name="${BROWSER_META_NAME}"]`)?.getAttribute('content')
  const config = parseBrowserConfig(content ?? null)
  return startBrowserTelemetry(config.ok ? config.value : null, deps)
}
