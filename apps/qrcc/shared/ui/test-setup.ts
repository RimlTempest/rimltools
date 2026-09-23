/**
 * bun test 用の DOM 環境。`bunfig.toml` の `[test] preload` から読み込まれる。
 *
 * import より先に登録する必要があるため、テストファイル内では登録できない
 * （ESM の import は本体より先に評価される）。
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator'

if (globalThis.document === undefined) {
  GlobalRegistrator.register({ url: 'https://qrcc.riml4i.com/' })
}
