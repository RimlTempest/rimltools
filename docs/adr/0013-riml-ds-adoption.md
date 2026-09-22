# ADR-0013: 見た目と部品は riml-ds に寄せる（段階的に）

- 状態: 採用（2026-09-22）
- 関連: qrcc の ADR-0011（トークン）/ ADR-0012（窓の見た目）、[`docs/riml-ds-feedback.md`](../riml-ds-feedback.md)

## 背景

riml-ds（`@rimltempest/riml-ds-*`）は、RimlTools のアプリが共有するデザインシステム。2026-09-21 に npm で 0.3.0 が公開され、
トークン・CSS に加えて、Lit のカスタム要素（`riml-ds-elements`）とその React ラッパー（`riml-ds-react`）が揃った。

2026-09-22 時点の利用状況:

| アプリ / パッケージ              | riml-ds の使い方                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| qrcc（`apps/qrcc/shared/ui`）    | `riml-ds-tokens`（`themes/qrcc`）と `riml-ds-css`（patterns / typography / atoms）。`--qrcc-*` は `--rd-*` の別名 |
| noter                            | 使っていない（独自のトークンと CSS）。riml-ds には noter 用の `themes/noter` がある                               |
| `packages/ui` / `packages/shell` | 使っていない。qrcc と noter の両方が使うので、class 名の接頭辞をアプリから受け取る                                |
| portal                           | 使っていない（script の無い静的ページ、予算 32 KiB）                                                              |

## 決定

見た目と部品の正本を riml-ds に寄せる。ただし次の順に 1 段ずつ進め、各段で a11y（WCAG 2.2 AAA の方針）を下げない。

1. **トークンと CSS を最新に保つ**（qrcc、完了）。0.3.0 に上げた。npm の tokens / css 0.3.0 は 0.2.0 と中身が同じで、見た目は変わらない。
2. **noter も riml-ds のトークンを使う**（未着手・要判断）。qrcc の段階 1 と同じく `--noter-*` を `--rd-*`（`themes/noter`）の別名にする。
   noter の見た目が変わるので、画面ごとの前後比較を見てから決める。
3. **共有パッケージの部品を riml-ds の CSS クラスに寄せる**（2 の後）。`packages/ui` / `packages/shell` は qrcc と noter の両方が使う。
   noter が riml-ds の CSS を読み込む前に `.rd-*` へ置き換えると、noter の見た目が壊れる。
4. **JS が要る部品を `riml-ds-react` に置き換える**（riml-ds 側の修正待ち）。`riml-ds-react` / `riml-ds-elements` は、
   公開されている全版（0.2.0 / 0.3.0）の `peerDependencies` に `workspace:*` が残っていて、bun でも npm でも入らない
   （`Workspace dependency "@rimltempest/riml-ds-elements" not found`）。直った版が出たら、下の対応表に沿って置き換える。

## 部品の対応表（段階 3・4 の作業票）

「今すぐ使える」は、qrcc が既に読み込んでいる `riml-ds-css` のクラスで代わりが効くもの。

| いまの部品                                      | riml-ds の対応                                    | 今すぐ使えるか                       | 置き換えの前提・注意                                                                                        |
| ----------------------------------------------- | ------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `Button`（`packages/ui`）                       | `rd-button` / `RdButton`                          | いいえ（npm の不具合）               | 無効状態は qrcc が AAA 1.4.1 のために riml-ds から外している（qrcc ADR-0012）。riml-ds 側で直るまで据え置く |
| `Field`（`packages/ui`）                        | `rd-text-field` / `rd-number-field` / `rd-select` | いいえ（npm の不具合）               | ラベル・ヒント・エラーの関連付け（`aria-describedby`）が同等か、置き換え時に確かめる                        |
| `LiveRegion`（`packages/ui`）                   | `rd-live-region`                                  | いいえ（npm の不具合）               | 読み上げの重複を避ける既存の挙動を保つ                                                                      |
| `SkipLink`（`packages/ui`）                     | `.rd-skip-link`（utilities.css）                  | CSS はある                           | 段階 2 の後（noter が riml-ds の CSS を読むこと）                                                           |
| `VisuallyHidden`（`packages/ui`）               | `.rd-visually-hidden`（utilities.css）            | CSS はある                           | 段階 2 の後                                                                                                 |
| `ThemeToggle` と theme store（`packages/ui`）   | 対応なし                                          | —                                    | アプリの設定（保存キー、`light-dark()` の切り替え）なので残す                                               |
| `reset.css`（`packages/ui`）                    | `riml-ds-css/reset.css`                           | CSS はある                           | 段階 2 の後。qrcc の ADR-0011 の「段階 2（reset / base の切り替え）」にあたる                               |
| `Breadcrumbs`（`packages/shell`）               | `.rd-breadcrumb`（navigation.css）                | CSS はある                           | 段階 2 の後。現在地の `aria-current` を保つ                                                                 |
| `GlobalNav`（`packages/shell`）                 | `.rd-nav-menu`（navigation.css）                  | CSS はある                           | 段階 2 の後                                                                                                 |
| `AppShell` / `RootDocument`（`packages/shell`） | 対応なし（レイアウトの骨組み）                    | —                                    | 残す。中の部品だけ寄せる                                                                                    |
| `Window`（qrcc）                                | `rd-window` / `RdWindow`                          | 見た目は `.rd-window` で既に riml-ds | 帯の丸がボタンになる挙動（riml-ds ADR-0014）は `RdWindow` に移すと部品側が持つ。npm の不具合が直ってから    |
| `Avatar`（noter）                               | `.rd-avatar`（atoms.css）                         | CSS はある                           | 段階 2 の後                                                                                                 |

## 結果

- qrcc の見た目は変わらない。qrcc の古い vendoring スクリプト（`scripts/vendor-riml-ds.sh`）は消した。
- riml-ds 側で直してほしい点は [`docs/riml-ds-feedback.md`](../riml-ds-feedback.md) にまとめた（このリポジトリからは riml-ds に変更を加えない）。
- 段階 2 に進むかどうかは、noter の見た目の前後比較を見てユーザーが決める。
