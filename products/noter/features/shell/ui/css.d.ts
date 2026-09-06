/**
 * Vite の `?url` 付き CSS インポート。パッケージの exports には
 * クエリ付きの指定子を書けないため、ここでアンビエント宣言する。
 */
declare module '*.css?url' {
  const url: string
  export default url
}
