/**
 * テレメトリ（Grafana Faro）の起動。設定は Worker が <head> に埋め込む（docs/ops/telemetry.md）。
 * 初期表示が落ち着いてから、サンプリングに当たったセッションだけ SDK を読み込む。
 *
 * 呼び出し側は `import.meta.env.SSR` が偽のときだけ呼ぶこと（SSR のバンドルに Faro を入れない）。
 */
const startTelemetry = () => {
  import('@rimltools/telemetry/browser')
    .then(({ startFromDocument }) => startFromDocument(document))
    // 計測が読めなくても画面には影響させない
    .catch(() => undefined)
}

export const scheduleTelemetry = () => {
  if ('requestIdleCallback' in window) window.requestIdleCallback(startTelemetry, { timeout: 5000 })
  else setTimeout(startTelemetry, 2000)
}
