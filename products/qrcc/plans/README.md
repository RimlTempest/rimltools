# Implementation Plans

improve スキルが作成（001 は 2026-09-03、002〜006 は 2026-09-06）。
実行者は計画を最後まで読んでから着手し、STOP conditions を守り、
終わったら自分の行を更新すること。

## Execution order & status

| Plan | Title                                                                                               | Priority | Effort | Depends on | Status |
| ---- | --------------------------------------------------------------------------------------------------- | -------- | ------ | ---------- | ------ |
| 002  | 内容と符号の互換性を、総当たり switch から符号側のメタデータに移す                                  | P1       | S      | —          | DONE   |
| 007  | 種類を増やしたときに壊れる 4 つの switch を、増やしても壊れない形にする                             | P1       | S      | 002        | DONE   |
| 003  | 設計済みで未実装の内容の種類（名刺・メール・電話・SMS・地図・予定）を実装する                       | P1       | M      | 002, 007   | TODO   |
| 004  | 読めるのに作れない 1D バーコード（Code 39 / Code 93 / EAN-8 / ITF / Codabar）を生成できるようにする | P1       | M      | 002, 007   | TODO   |
| 005  | 読み取った内容を解釈して見せる（GS1 の識別子・名刺・Wi-Fi・連絡先）                                 | P2       | M      | —          | DONE   |
| 006  | NFC タグに書き込めるようにする（QR・バーコード以外の運び方）                                        | P3       | M      | —          | DONE   |
| 001  | トップページの生成と読み取りを WebMCP のツールとしてエージェントに公開する                          | P2       | M      | —          | TODO   |

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
