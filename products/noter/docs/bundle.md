# Worker のバンドルサイズ

Workers Free の Worker は、アップロードするコード全体が **gzip で 3 MiB** までに制限される。
noter-web は 2026-09 の時点で 2.47 MiB になり、残りが 0.6 MiB を切っていた。この文書は、
何がサイズを占めていたか、どう減らしたか、今後どう守るかをまとめる。

## 結果

|                                                    |    変更前 |    変更後 |                                差 |
| -------------------------------------------------- | --------: | --------: | --------------------------------: |
| noter-web のサーバ（`apps/web/dist/server`、gzip） | 2,472 KiB |   869 KiB |            **-1,603 KiB（-65%）** |
| 上限 3 MiB に対する割合                            |       80% |       28% |                                   |
| サーバのチャンク数                                 |       142 |        47 |                                   |
| クライアント JS の合計（gzip）                     | 1,401 KiB | 1,406 KiB | +5 KiB（チャンクが 1 つ増えた分） |
| トップページで先読みする JS（gzip）                | 127,297 B | 127,416 B |                            +119 B |

| 手当て                                                    | サーバ（gzip） |
| --------------------------------------------------------- | -------------: |
| 変更前                                                    |      2,472 KiB |
| mermaid をサーバのビルドから外す                          |      1,177 KiB |
| CodeMirror をブラウザでだけ読む                           |      1,000 KiB |
| UI の入口から CodeMirror のモジュールの再 export をやめる |        869 KiB |

## 何が占めていたか（変更前、上位）

`scripts/bundle-report.ts` による推定（チャンクの gzip を sourcemap の文字数比で按分した目安）。

| パッケージ                                     | 推定 gzip (KiB) | 入っていた経路                                                                                                  |
| ---------------------------------------------- | --------------: | --------------------------------------------------------------------------------------------------------------- |
| `mermaid`                                      |             466 | `features/formats/ui/mermaid-block.tsx` の `import('mermaid')`                                                  |
| `@mermaid-js/parser`                           |             188 | 同上（mermaid の依存）                                                                                          |
| `cytoscape`                                    |             173 | 同上                                                                                                            |
| `katex`                                        |              85 | 同上（noter は直接使っていない。mermaid の数式ラベル用）                                                        |
| `@codemirror/view` ほか CodeMirror・Lezer 一式 |          約 200 | `features/editor/ui/code-editor.tsx` の静的 import と、`ui/index.ts` の `noterTheme` / `languageOf` の再 export |
| `layout-base` / `cose-base` / dagre など       |           約 90 | mermaid の図の実装                                                                                              |

## 何をしたか

どれも**サーバの描画では使っていないのに、サーバのバンドルに同梱されていた**ものを外しただけで、
画面の振る舞いは変えていない。

1. **mermaid**: 図の描画はもともと effect の中（ブラウザ）だけで行っていた。ただ `import('mermaid')`
   のままだと、Vite の SSR ビルドが動的 import の先まで Worker に入れる。
   `import.meta.env.SSR` はビルド時の定数なので、`import.meta.env.SSR ? null : () => import('mermaid')`
   にするとサーバ側では import ごと消える。
2. **CodeMirror**: サーバが返していたのはエディタの入れ物の `<div>` だけで、EditorView は effect で作っていた。
   CodeMirror・Lezer・y-codemirror に触る処理を `features/editor/ui/code-editor-view.ts` に集め、
   `code-editor.tsx` からは型だけを参照し、本体は `import.meta.env.SSR` で分岐させた動的 import で読む。
   ブラウザではモジュールの評価と同時に取りに行くので、ハイドレーションと並行して読み込まれる。
   入れ物は `block-size: 100%` なので、中身が後から入ってもレイアウトはずれない（CLS なし）。
3. **UI の入口**: `features/editor/ui/index.ts` が `noterTheme` と `languageOf` を再 export していた。
   どこからも使われていないが、`theme.ts` は読み込み時に `EditorView.theme()` を呼ぶ副作用があるので、
   tree-shaking で消えずにサーバへ入っていた。再 export をやめた。

### SSR の出力

主要なページ（`/`、`/sign-in`、`/d/<id>`、`/s/<token>`）の SSR の HTML を前後で比べた。
違いは、共通の contract を切り出した小さなチャンク（`src-*.js`、1.3 KiB）の `modulepreload` が 1 行増えたことだけで、
本文・見出し・フォーム・ARIA 属性は同じ。

### a11y

- mermaid の図の代替は変わらない。SSR が出す `<details>`（「mermaid のソース」）はそのまま残り、
  図は描画後に `role="img"` と `aria-label` を付ける（`docs/accessibility.md` §2 の 1.1.1）。
  JS が動かない環境でも、ソースは読める。
- エディタのアクセシブル名（`aria-label="本文"`）と、Tab でエディタから抜けられる設定は、
  `code-editor-view.ts` に移しただけで変えていない。
- 検証: noter の e2e 224 件（WebSocket 同期・a11y・mermaid の描画を含む）がすべて通る。

## 予算（CI で守る）

`products/<tool>/bundle-budget.json` に予算を書き、`scripts/check-bundle.sh` がビルドの後に
`bun ../../scripts/bundle-budget.ts .` を呼ぶ（CI では `product-ci.yml` の build ジョブ）。

| プロダクト | 対象                                      | 予算（gzip） | 実測（2026-09） | 根拠                                                                |
| ---------- | ----------------------------------------- | -----------: | --------------: | ------------------------------------------------------------------- |
| noter      | `apps/web/dist/server` の js / mjs / wasm |      1.5 MiB |         869 KiB | 上限 3 MiB の半分。約 660 KiB の伸びしろを残す                      |
| qrcc       | `apps/web/dist/server` の js / mjs / wasm |        2 MiB |        1.51 MiB | 上限の 2/3。wasm の上限（ADR-0003）は既存の検査が別に見る           |
| portal     | `dist` の html / css / svg                |       32 KiB |         2.3 KiB | script を持たない静的ページ。大きな資産が紛れ込んだら気づけるように |

- ファイルは 1 つずつ gzip して合計する。まとめて gzip した値より大きくなるので、判定は安全側に倒れる。
- 対象のファイルが 1 つも無いときも失敗にする（出力先の名前が変わって検査が素通りになるのを防ぐ）。
- 予算を上げるときは、`reason` に理由を書く（必須項目）。

## 次に減らせるもの

- **エディタ画面のチャンク（240 KiB）**: yaml・yjs・markdown-it・dompurify・smol-toml など、プレビューと書式の検査と同期に使うもの。
  これもサーバでは使っていない可能性が高いが、外すには `DocumentPreview`・診断・同期のフックを遅延読み込みに作り替える必要があり、
  今回は見送った。
- **qrcc-web のサーバ（1.51 MiB）**: 同じ手法（`bun scripts/bundle-report.ts` で内訳を出し、サーバで使わないものを分岐させる）が使える。

## 内訳の出し方

```bash
NOTER_BUNDLE_ANALYZE=1 bun run --cwd products/noter build   # サーバの sourcemap を出す（本番では出さない）
bun scripts/bundle-report.ts products/noter/apps/web/dist/server 25
```
