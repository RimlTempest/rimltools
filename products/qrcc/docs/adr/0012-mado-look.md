# ADR-0012: 窓（Mado）の見た目を riml-ds から取る

- 状態: Accepted
- 日付: 2026-09-08
- 関連: [ADR-0011](0011-riml-ds-tokens.md)、riml-ds ADR-0013 / `docs/brand.md`

## 文脈

ADR-0011 の段階 1 で `--qrcc-*` を `--rd-*` の別名にした。その後 riml-ds がブランド
（riml: 紙色の地・インク色の文字・青紫のアクセント）と **窓（Mado）** の見た目を決めた
（riml-ds `docs/brand.md` §7、`docs/adr/0013-riml-brand-and-mado.md`）。要点:

- 部品は**窓**。クリーム色の面に、灰茶色の**タイトル帯**（左に 3 つの丸、中央に太い丸ゴシックの題）を載せ、
  ぼかしの無い**硬い影**（`--rd-shadow-raised`: 右下 0.25rem）で浮かせる
- ボタンは**ピル**（`--rd-radius-full`）、太字、枠線なし。面の切り替えだけで区切る
- 入力欄は「浮いた面 + 枝色の枠」の井戸
- 区切りは**点線**（0.125rem dotted）
- 見出し h1/h2 は丸ゴシック系の `--rd-font-family-display`

トークンの別名だけでは、角丸・影・書体は流れてきても**形**（窓・ピル・帯）は流れてこない。

## 決定

1. qrcc は riml-ds から**形と質感**（窓・ピル・硬い影・点線・丸ゴシック見出し）を取る。
   **色相は qrcc テーマのまま**（青 hue 255 / 中性色 hue 265）。riml のクリーム地に変えるかは別の判断で、
   `themes/qrcc.css` の 1 枚を差し替えれば切り替わる。
2. 窓は `@rimltempest/riml-ds-css/patterns.css` の `.rd-window` をそのまま使い、React では `@qrcc/ui` の
   `<Window>` で包む。トーン（帯の色）は riml-ds の決まりどおり**見出し**側の `data-tone` が受ける。
   qrcc 側で `.rd-window*` を上書きしない（直したい差分は riml-ds に出す）。
3. `--qrcc-radius-lg` は riml-ds の lg（1rem）の別名にする。1.5rem にしていた「外側 = 内側 + padding」の
   同心の理由は、窓では上の角をタイトル帯が・下の角を本文の padding が占めるので消えた。
   `tokens.test.ts` の `KEPT_LOCAL` は 5 つ（`--qrcc-measure`、`--qrcc-text-base/lg/xl/2xl`）になる。
4. カスケード層の順序を `reset, base, rd.tokens, rd.components, tokens, components, utilities` にする。
   `patterns.css` は自分で `@layer rd.components { … }` に包まれていて、`rd` 層は最初に現れた位置で並ぶ。
   qrcc の `reset`（`* { margin: 0 }`）と `base`（`h2 { font-size }`、見出しの `margin-block`）が
   `.rd-window-title` に勝つと帯が崩れるので、`rd` は両者の**後**。qrcc の `components` と `utilities` は
   `.rd-window` の上に重ねたいので `rd` の**後**。変数だけの `rd.tokens` / `tokens` は順序に意味が無い。
   実ブラウザでの勝ち負けは `e2e/tests/mado.spec.ts` が固定する。
5. `shared/ui/src/styles/components.css` は当面 riml-ds の tier A CSS（`button.css` / `text-field.css` /
   `select.css`）の**写し**。riml-ds 側が変わったら差分を追って写す。段階 3（Lit 要素の React ラッパーへの
   置き換え）で写しは消える。

## 受け入れた視覚差分

| 対象               | 旧                                      | 新                                                     |
| ------------------ | --------------------------------------- | ------------------------------------------------------ |
| ボタンの角丸       | `--qrcc-radius`（0.75rem）              | `--rd-radius-full`（ピル）                             |
| ボタンの枠線       | `1px solid transparent`                 | 無し（強制配色でだけ `ButtonText` の枠を戻す）         |
| ボタンの字         | 継承                                    | `--rd-font-weight-bold`                                |
| ボタンの押下       | `scale: 0.96`                           | `translate: 0 0.0625rem`（影の方向に 1px 沈む）        |
| secondary の塗り   | `surface-raised` + `border-strong` の枠 | `surface-sunken` の塗り（枠なし）                      |
| 無効なボタン       | `grayscale(1)` + 破線の枠               | `grayscale(1)` + 内側の破線 outline                    |
| 入力欄の面         | `--qrcc-surface`（地と同じ）            | `--qrcc-surface-raised`（浮いた面）                    |
| 入力欄の枠 / 角丸  | `border-strong` / `--qrcc-radius`       | `--qrcc-border` / `--rd-radius-md`                     |
| テーマ切替の囲い   | 枠 + 角丸 1.5rem + padding              | 枠なし（囲いは窓が持つ）。選択中の段だけ sunken のピル |
| h1 / h2 の書体     | 本文書体                                | `--rd-font-family-display`（丸ゴシック）               |
| `hr`               | ブラウザ既定                            | 0.125rem dotted `--rd-color-border-default`            |
| `--qrcc-radius-lg` | 1.5rem（生値）                          | `var(--rd-radius-lg)`（1rem）                          |

AAA は崩していない。色だけで状態を表さない決まりは残していて、無効なボタンは内側の破線、
入力欄の誤りは 2px の枠と `⚠` の接頭辞、テーマ切替の選択中はラジオの丸そのものが状態を持つ。

## riml-ds から意図的に外したところ

- **無効なボタン**: riml-ds は `color: GrayText; background: transparent`（色だけ）。qrcc は AAA 1.4.1 の
  「色だけで情報を伝えない」を守るため、内側に 0.125rem の破線 outline を引いて形でも示す。
  `aria-disabled` のボタンはフォーカスできるので、フォーカス中はフォーカスリングを優先する。
- **入力欄の内側の影**: riml-ds の `text-field.css` に inset の box-shadow は無いので入れない。

## 影響

- `@rimltempest/riml-ds-css` が `shared/ui` の依存に増える（`vendor/riml-ds/*.tgz`、ADR-0011 §3 のまま）。
  この tgz は tokens を `peerDependencies` に持ち、`bun pm pack` が `workspace:*` を実バージョンに固定する。
  tokens はまだ未公開なので、そのままだと `bun install` が npm を見にいって 404 で止まる。
  `scripts/vendor-riml-ds.sh` が vendor する tgz の中でその peer を optional にして自動取得を止めている
  （tokens は `shared/ui` が `file:` で直接依存していて解決済み）。npm 公開時にこの回避もろとも消える。
- feature 画面（`features/*/ui`）への `<Window>` 適用は別 plan（012）。この ADR では `features/**` を触らない。
- ADR-0011 の「段階 1」の記述はそのまま残す。これは段階 2（部品 CSS を riml-ds から取る）にあたる。
