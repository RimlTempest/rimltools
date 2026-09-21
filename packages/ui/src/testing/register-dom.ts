/**
 * bun test 用の DOM 環境。`packages/ui/bunfig.toml` の `[test] preload` から読み込まれる。
 *
 * import より先に登録する必要があるため、テストファイル内では登録できない
 * （testing-library が読み込み時に document を掴む）。
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator'

if (globalThis.document === undefined) {
  GlobalRegistrator.register({ url: 'https://tools.riml4i.com/' })
}
