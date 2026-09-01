/** Vite の `?url` 付きインポート（wasm はアセットとして配信する）。 */
declare module '*.wasm?url' {
  const url: string
  export default url
}
