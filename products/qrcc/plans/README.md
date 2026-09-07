# Implementation Plans

improve スキルが作成（001 は 2026-09-03、002〜006 は 2026-09-06、011〜012 は 2026-09-08、main `fc1896b`）。
実行者は計画を最後まで読んでから着手し、STOP conditions を守り、
終わったら自分の行を更新すること。

## Execution order & status

| Plan | Title                                                                                               | Priority | Effort | Depends on       | Status |
| ---- | --------------------------------------------------------------------------------------------------- | -------- | ------ | ---------------- | ------ |
| 002  | 内容と符号の互換性を、総当たり switch から符号側のメタデータに移す                                  | P1       | S      | —                | DONE   |
| 007  | 種類を増やしたときに壊れる 4 つの switch を、増やしても壊れない形にする                             | P1       | S      | 002              | DONE   |
| 003  | 設計済みで未実装の内容の種類（名刺・メール・電話・SMS・地図・予定）を実装する                       | P1       | M      | 002, 007         | DONE   |
| 004  | 読めるのに作れない 1D バーコード（Code 39 / Code 93 / EAN-8 / ITF / Codabar）を生成できるようにする | P1       | M      | 002, 007         | DONE   |
| 005  | 読み取った内容を解釈して見せる（GS1 の識別子・名刺・Wi-Fi・連絡先）                                 | P2       | M      | —                | DONE   |
| 006  | NFC タグに書き込めるようにする（QR・バーコード以外の運び方）                                        | P3       | M      | —                | DONE   |
| 001  | トップページの生成と読み取りを WebMCP のツールとしてエージェントに公開する                          | P2       | M      | —                | DONE   |
| 008  | 生成ツールから 9 種類すべての内容を作れるようにする                                                 | P2       | M      | 001, 003         | DONE   |
| 009  | PWA にする（ホーム画面に追加・オフラインで生成と読み取り）                                          | P2       | M      | —                | DONE   |
| 010  | デザイントークンを riml-ds から取る（段階 1: `--qrcc-*` を `--rd-*` の別名にする）                  | P2       | M      | riml-ds 013      | DONE   |
| 011  | 窓（Mado）の見た目を qrcc に入れる — 基盤（shared/ui: patterns.css・ピルボタン・`<Window>`）        | P1       | M      | 010, riml-ds 015 | DONE   |
| 012  | 窓（Mado）の見た目を qrcc に入れる — 画面（features/*/ui の板を `<Window>` に、シェルを窓の言語に） | P1       | M      | 011              | TODO   |

Status の値: TODO / IN PROGRESS / DONE / BLOCKED（理由を 1 行）/ REJECTED（理由を 1 行）

## 003 / 004 が止まった経緯（2026-09-06）

003 と 004 を並行で走らせたところ、**両方とも着手直後に STOP した**。
どちらも正しい判断で、原因は計画側（レビュアー）の見落としだった。

このリポジトリは「ユニオンにメンバーを足したらコンパイルが落ちる」ことを
安全網にしている。その網はレジストリ（`PAYLOAD_META` / `SYMBOLOGY_META`）
だけでなく、**そのユニオンを網羅する `switch` すべて**に張られている。

実測された壊れ方:

| 足すもの                    | 落ちるファイル                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `CodePayload` に 1 メンバー | `generate-screen.tsx`（想定内）+ `manage/core/code-form.ts` + `manage/ui/testing-fakes.ts`（**想定外**） |
| `Symbology` に 1 メンバー   | `generate-screen.tsx` + `manage/core/code-form.ts`（**どちらも想定外**）                                 |

計画は「フォームはレジストリ駆動だから触らなくてよい」と書いていたが、
それはラジオボタンの描画についてだけ正しく、`buildSymbology` /
`buildPayload` という**網羅 switch** を見落としていた。

結果、003 と 004 は同じ 2 ファイルを必要とし、並行実行もできない。
**plans/007 でこの結合を外してから、両方を再実行する。**

## 並行実行の設計

**002 は 2026-09-06 にレビュー済みで main に取り込んだ（`754c8d3`）。**
003 / 004 / 005 / 006 は着手可能。

**002 だけは先に単独で入れること。** それが済めば 003 / 004 / 005 / 006 は
所有ファイルが重ならないので、同時に進められる。

```
002（S・単独・DONE）→ 007（S・単独）
 ├─→ 003  features/generate/{contract/payload.ts, core/, ui/}, engine/src/payload.rs
 └─→ 004  features/generate/{contract/symbology.ts}, engine/src/symbology.rs

     005  features/scan/**                      （002 に依存しない）
     006  features/nfc/**（新規）+ 配線 3 行     （002 に依存しない）
```

### なぜ 002 が要るか

`isPayloadCompatible` は**内容 × 符号の総当たり switch** で、内容を増やす
作業（003）と符号を増やす作業（004）が**必ず同じ関数を編集する**。
002 で判定を符号側のメタデータに移すと、この共有点が消える。
振る舞いは 1 ミリも変えない（3 × 3 の表をテストで固定してから移す）。

### レーンごとの所有ファイル

| Plan | 所有                                                                                        | 触ってはいけない                                               |
| ---- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 003  | `contract/payload.ts`, `core/payload/**`, `ui/generate-screen.tsx`, `engine/src/payload.rs` | `contract/symbology.ts`, `engine/src/symbology.rs`             |
| 004  | `contract/symbology.ts`, `engine/src/symbology.rs`                                          | `ui/generate-screen.tsx`, `contract/payload.ts`                |
| 005  | `features/scan/**`                                                                          | `features/generate/**`, `contract/decode.ts` の `Detection` 型 |
| 006  | `features/nfc/**` + `routes.ts` / `nav-items.ts` / `app.css` / `tsconfig.json` に各 1 行    | `features/generate/**`, `features/scan/**`, `home.route.tsx`   |

**共有する追記ポイント**: `apps/web/src/routes.ts`、`features/shell/ui/nav-items.ts`、
`apps/web/src/styles/app.css`、ルートの `tsconfig.json`。いずれも 006 だけが
1 行ずつ足す。他のレーンは触らない。

### 001（WebMCP）との関係

001 は `features/shell/ui/home.route.tsx` に配線を足す。006 は同じファイルを
**触らない**設計（独立ページ `/nfc`）にしてあるので衝突しない。
003 が `generate-screen.tsx` を大きく変えるため、**001 は 003 のあとに回すのが安全**。

## この計画群の背景（オーナーの判断）

「アプリをより拡張したい。QR・バーコード以外にも対応できるものは無いか」
という相談に対する提案のうち、**1・2・4・6 を並行で実装する**と決めた。

- 003 = 提案 1（内容の種類）
- 004 = 提案 2（1D 符号）
- 005 = 提案 4（読み取り結果の解釈）
- 006 = 提案 6（Web NFC）

## Findings considered and rejected

- **2 次元の符号（Data Matrix / PDF417 / Aztec）を生成する**: 今回は見送り。
  `qrcode` crate は QR しか作れず、`rxing` の encoders はデコード用の重い crate
  （780KB gzip）で、生成 wasm の上限 200KB を確実に超える。1D（004）が
  落ち着いてから crate の選定として別途判断する。
- **動的 QR（印刷後に宛先を変えられる）**: 今回は見送り。読み取り 1 回 =
  Worker 1 リクエストで、印刷物に載る QR はトラフィックを制御できない。
  ADR-0009（Workers Free に留まる）の前提と正面衝突するため、
  やるなら先に「上限に達したときの縮退」を ADR で決める必要がある。
- **`features/print/engine` の stub crate を畳む**: 掃除であって拡張ではないため
  今回の 4 本には含めない。ただし**機能ゼロの 5 行のために 85 crate を
  CI で毎回コンパイルしている**（`qrcc-generate` は 23）。ADR-0005 で PDF は
  スコープ外と決めたので、いつ畳んでもよい。労力 S。
- **読み取り履歴（`ScanEntry`）**: `docs/domain-model.md` に設計はあるが
  今回は含めない。サーバに置くと D1 書き込みが増えて無料枠に効くので、
  やるなら端末内（IndexedDB）が筋。

## 積み残し（次にやるなら）

- ~~`generate-code` ツールが内容の種類を url / text しか受け付けない~~
  → **plans/008 として計画化した。**
- **006（Web NFC）の実機確認が未了。** Android の Chrome が CI にも開発機にも
  無いため、偽の NDEFReader で経路を固定しているだけ。本物のタグに書けたことは
  誰も確認していない。
- **WebMCP の Origin Trial トークンは未登録。** 仕様が正式化するまで実ユーザーには
  効かない。登録するなら docs/adr/0010-webmcp.md を参照。

### 010 の実行メモ（2026-09-07）

- riml-ds は npm 未公開のため `vendor/riml-ds/*.tgz` を `file:` 依存で取り込んでいる（`scripts/vendor-riml-ds.sh`）。
  `bun install --frozen-lockfile` は tgz の整合性ハッシュで通る。公開後は `shared/ui/package.json` の 1 行と
  `vendor/` の削除だけ（ADR-0011）
- `--qrcc-*` は全部 `var(--rd-*)` の別名になった。残した生値は `radius-lg` / `measure` / `text-base|lg|xl|2xl` の 6 つ
  （`shared/ui/src/styles/tokens.test.ts` の `KEPT_LOCAL`）。新しい `--qrcc-*` を足すとテストが落ちる。新しい CSS は `--rd-*` を直接使う
- 新規 worktree で `apps/web` 単体ビルドをする前に `bun run build`（wasm / api 込み）が要る（`apps/api/build/worker/shim.mjs` が無いと
  @cloudflare/vite-plugin が失敗）。トークンとは無関係
- 受け入れた視覚差分（border が 0.72→0.6 で 3:1 を満たすようになった等）は ADR-0011 の表。a11y 180 passed、テスト 890
- 段階 2（riml-ds の reset / base）は css tgz の peerDependency 解決（registry 404）を解く必要がある。npm 公開後に始める

### 011 の実行メモ（2026-09-08）

- マージ `6e606d8`。`shared/ui` に `@rimltempest/riml-ds-css` 0.2.0（`patterns.css`）が入り、層順は
  `reset, base, rd.tokens, rd.components, tokens, components, utilities`（理由は ADR-0012 §4、実ブラウザの勝ち負けは
  `e2e/tests/mado.spec.ts`）。`<Window>` は `shared/ui/src/components/window.tsx`、トーンは**見出し側**の `data-tone`
- **css tgz の peerDependency 404 は解けた**: `scripts/vendor-riml-ds.sh` が vendor する css tgz の中で
  `peerDependenciesMeta.optional` を立てて詰め直す（`bun pm pack` で詰め直すのでハッシュは安定）。
  本筋は riml-ds 側で `peerDependenciesMeta` を持つこと → riml-ds の次の小 plan に載せる。npm 公開でブロックごと消える
- riml-ds を正として計画から変えたもの: ボタン `padding-inline` は `--rd-space-4`、transition は `background-color, color` だけ
  （押下 `translate` は `prefers-reduced-motion: no-preference` の中）、入力欄の inset 影は入れない。
  計画を採ったのは無効ボタン（`grayscale` + 内側の破線 outline、AAA 1.4.1）。詳細は ADR-0012 の表
- red コミット（`7d8e472`、`eed9459`）は `window.tsx` 未作成のため typecheck が通らない。fmt + lint のみで commit している
  （red → green の順序上避けられない）。以降は毎コミット `bun run check` 通過
- **`--qrcc-radius-lg` が 1.5rem → 1rem** になったので `features/{scan,generate,manage}/ui/*.css` のカード角丸が小さくなっている。
  見た目の最終判断は 012 で（012 はそのカードを `<Window>` に置き換える）
- a11y 180 passed / e2e 428 passed / `bun run check` exit 0（レビュー時に main 側でも再実行）
