# Plan 005: 読み取った内容を解釈して見せる（GS1 の識別子・名刺・Wi-Fi・連絡先）

> **Executor instructions**: 上から順に実行し、各ステップの検証コマンドを必ず走らせて
> 期待結果を確認してから次へ進むこと。「STOP conditions」に該当したら勝手に判断せず
> **止めて報告**すること。完了したら `plans/README.md` の該当行を更新すること。
>
> **Drift check（最初に実行）**:
> `git diff --stat 57f52ad..HEAD -- features/scan`
> 出力が空でなければ「Current state」の引用と実際のコードを突き合わせ、
> 食い違えば STOP condition として扱うこと。

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none（他のレーンと完全に独立）
- **Category**: direction
- **Planned at**: commit `57f52ad`, 2026-09-06

## Why this matters

読み取りは既に 21 種類の符号に対応していて、GS1 DataBar も ITF も EAN も
**読める**。ところが読み取った結果は**生の文字列をそのまま出しているだけ**で、
中身を解釈していない。

たとえば商品の箱にある GS1 バーコードを読むと、いまはこう出る:

```
0104912345678904152512311012345
```

これは実際には「GTIN = 04912345678904 / 賞味期限 = 2025-12-31 / ロット = 12345」
という構造を持っている。解釈して見せれば、小売や物流でそのまま使える情報になる。

同じことが**自分たちが生成している形式**にも当てはまる。qrcc で作った Wi-Fi の
QR を qrcc で読み返すと `WIFI:S:MyNet;T:WPA;P:secret;;` と出る。
**自分が作れる形式を自分で読めない**のはちぐはぐで、直す価値がある。

## Current state

### いま読み取り結果をどう出しているか

```tsx
// features/scan/ui/scan-screen.tsx:57-90
/**
 * 読み取った内容 1 件。
 *
 * http(s) のときだけリンクにする。`javascript:` などを踏ませないため、
 * 判定は `@qrcc/contract` の `parseHttpUrl` に任せる（自前で書かない）。
 */
const DetectionItem = ({ detection, copyText, onCopied, onCopyFailed }) => {
  const url = parseHttpUrl(detection.text)

  return (
    <li className="qrcc-scan__result">
      <p className="qrcc-scan__result-text">
        {url.ok ? (
          <a href={url.value} rel="noreferrer">
            {detection.text}
          </a>
        ) : (
          detection.text
        )}
      </p>
      <p className="qrcc-scan__result-kind">
        種類: {SCAN_SYMBOLOGY_META[detection.symbology].label}
      </p>
      {/* コピーボタン */}
    </li>
  )
}
```

つまり**解釈は「http(s) かどうか」の 1 つだけ**。それ以外は素通し。

### 読み取り結果の型

```ts
// features/scan/contract/decode.ts
export type Detection = {
  readonly text: string
  readonly symbology: ScanSymbology
  readonly corners: readonly Corner[]
}

export type DecodeResponse = {
  readonly detections: readonly Detection[]
}
```

**この型は変えない。** 解釈はこの `text` を入力にとる純粋関数として、
別に足す（デコーダの出力そのものは記録として残す）。

### ドメインモデルにある設計

`docs/domain-model.md:92` に `{ readonly kind: 'gs1'; readonly elements: readonly Gs1Element[] }`
が設計として置かれている。**この語彙に合わせること。**

### セキュリティ上、既に効いている判断（壊さないこと）

`parseHttpUrl` は `javascript:` などを踏ませないために置かれている
（上のコメント）。**解釈を足しても、リンクにするのは http(s) だけという
判断を緩めてはならない。** `tel:` や `mailto:` をリンクにしたくなっても、
この計画では**リンクにせず、テキストとボタンで扱う**こと。

### 守るべきリポジトリの決まり（`CLAUDE.md` から。実行者は読んでいない前提）

- **`any` / `as` / `!` / `class` / `enum` を書かない**（`as const` は許可）。
- **ドメイン層（`features/*/contract` / `features/*/core`）で `throw` しない。**
  失敗は `Result<T, E>` で返す。`ok()` / `err()` は `@qrcc/contract`。
  使用例は `features/scan/ui/browser-scan.ts:38-47`。
- **依存（時計・乱数・DOM）は関数引数で受け取る。**
- **feature 同士は `@qrcc/<name>` の公開サブパス経由でのみ依存する**（ADR-0007）。
- **実装より先に失敗するテストを書く**（red → green）。
- **アクセシビリティは WCAG AAA を狙っている。** 解釈結果は
  「色や記号だけ」で意味を伝えない。markuplint と axe（e2e）が CI で走る。
- コメントは日本語、識別子は英語。

## Commands you will need

| 目的           | コマンド                 | 成功時  |
| -------------- | ------------------------ | ------- |
| 型検査         | `bun run typecheck`      | exit 0  |
| テスト（絞る） | `bun test features/scan` | 全 pass |
| テスト（全体） | `bun run test`           | 全 pass |
| 一式           | `bun run check`          | exit 0  |
| e2e            | `bun run e2e`            | 全 pass |

## Scope

**In scope**:

- `features/scan/core/**`（新規。解釈の純粋ロジック）
- `features/scan/contract/interpretation.ts`（新規。解釈結果の型）
- `features/scan/contract/index.ts`（エクスポート追記）
- `features/scan/ui/scan-screen.tsx`（解釈結果の表示）
- `features/scan/ui/scan-screen.test.tsx`
- `features/scan/ui/scan.css`
- `features/scan/package.json`（`./core` サブパスを公開する場合）
- `e2e/tests/scan.spec.ts`
- `e2e/fixtures/`（GS1 の固定画像が要る場合）
- `docs/domain-model.md`

**Out of scope**（触らない）:

- `features/scan/contract/decode.ts` の `Detection` 型 — **変えない。**
  デコーダの生の出力は記録として残す。解釈は別の層
- `features/scan/engine/**`（Rust）と `features/scan/ui/browser-scan.ts` —
  読み取りそのものは既に動いている。**解釈のために触らない**
- `features/generate/**` — plans/003 と 004 が所有している。
  生成側の形式定義を参照したくなっても、**この計画では自前で持つ**
  （理由は Maintenance notes）

## 解釈する形式

| 形式           | 見分け方                                                        | 出すもの                                                         |
| -------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| GS1（AI 付き） | `]C1` / `]e0` の記号、または ITF-14・GS1 DataBar で読めた数字列 | GTIN・賞味期限・ロット番号など、AI ごとの意味と値                |
| Wi-Fi          | `WIFI:` で始まる                                                | ネットワーク名・暗号方式（**パスワードは伏せ、押したら見せる**） |
| 名刺（MeCard） | `MECARD:` で始まる                                              | 氏名・電話・メール・組織                                         |
| 名刺（vCard）  | `BEGIN:VCARD` で始まる                                          | 同上                                                             |
| メール         | `mailto:` で始まる                                              | 宛先・件名                                                       |
| 電話           | `tel:` で始まる                                                 | 電話番号                                                         |
| SMS            | `SMSTO:` / `sms:` で始まる                                      | 宛先・本文                                                       |
| 地図           | `geo:` で始まる                                                 | 緯度・経度                                                       |
| 予定           | `BEGIN:VEVENT` を含む                                           | 件名・開始・終了・場所                                           |

**どれにも当てはまらなければ、いまと同じく素のテキストとして出す。**
解釈できないことは失敗ではない。

GS1 の AI は**全部を実装しない**。最初は次の 5 つだけ:
`01`（GTIN）, `10`（ロット）, `11`（製造日）, `17`（有効期限）, `21`（シリアル）。
知らない AI は「未対応の識別子」として値だけ出す。

## Git workflow

- ブランチ: `feat/scan-interpretation`
- Conventional Commits。**形式ごとに 1 コミット**。
  例: `feat(scan): Wi-Fi の QR を解釈して表示する`
- **push や PR 作成は指示されるまで行わない。**

## Steps

### Step 1: 解釈結果の型を決める（red）

`features/scan/contract/interpretation.ts` に、判別可能ユニオンで定義する。

```ts
export type Interpretation =
  | { readonly kind: 'plain'; readonly text: string }
  | { readonly kind: 'url'; readonly url: HttpUrl }
  | { readonly kind: 'wifi'; readonly ssid: string; readonly auth: string }
  | { readonly kind: 'gs1'; readonly elements: readonly Gs1Element[] }
// …以下、表のとおり
```

`Gs1Element` は `docs/domain-model.md` の語彙に合わせる。

`interpret(text: string): Interpretation` の**シグネチャだけ**を書き、
まだ中身は `plain` を返すだけにする。テストを先に書いて red にすること。

**Verify**: `bun test features/scan` → 新しいテストが fail。

### Step 2: 形式ごとに解釈を足す（green）

`features/scan/core/interpret/<kind>.ts` に 1 形式 1 ファイル。
**単純な順**に: `tel` → `mailto` → `sms` → `geo` → `wifi` → `mecard` →
`vcard` → `vevent` → `gs1`。

`gs1` を最後にするのは、AI の連結規則（可変長 AI は区切り文字が要る）が
最も込み入っているため。

**1 形式ごとにコミットし、その都度テストを通すこと。**

**Verify**: `bun test features/scan` → 全 pass。

### Step 3: 画面に出す

`DetectionItem` に解釈結果の表示を足す。

守ること:

- **生のテキストも必ず残す。** 解釈が間違っていたとき、利用者が元の値を
  見られなくなる。「読み取った内容」と「解釈」を両方見せる
- **リンクにするのは http(s) だけ。** `tel:` や `mailto:` はリンクにしない
  （既存のセキュリティ判断を緩めない）
- **Wi-Fi のパスワードは既定で伏せる。** 押したら見せるボタンを置く。
  読み取り画面は人前で開かれることがある
- 見出しレベルは周囲に合わせる（読み取り画面は `headingLevel` を受け取る）
- 表形式で出すなら `<dl>` を使う。色や記号だけで意味を伝えない

**Verify**: `bun test features/scan` → 全 pass。`bun run check` → exit 0。

### Step 4: e2e で確かめる

`e2e/tests/scan.spec.ts` に、代表 2 形式（Wi-Fi と GS1）の固定画像を読ませて
解釈が出ることを確かめるテストを足す。

既存の書き方に合わせること: 読み取り側のランドマークに限定（`scan(page)`
ヘルパ）、固定待ちを使わず `await expect(...)` の自動待ちだけ。

固定画像が要るなら `e2e/fixtures/` に足す。既存の `qr-url.png` が手本で、
**生成側を変えても読み取り側のテストが道連れにならないよう画像を固定してある**。

**Verify**: `bun run e2e` → 全 pass。

### Step 5: ドキュメント

`docs/domain-model.md` に、解釈がどの層にあるか（`features/scan/core/interpret/`）
を書き足す。

**Verify**: `bun run check` → exit 0。

## Test plan

| ファイル                                      | 内容                                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `features/scan/core/interpret/<kind>.test.ts` | 形式ごと: 正常系 1、**壊れた入力** 2〜3（途中で切れている、区切りが無い、値が空）。`throw` せず必ず `Interpretation` を返すこと |
| 同上（`gs1`）                                 | AI の連結（`01` + `17` + `10`）、可変長 AI の区切り、**知らない AI** の扱い                                                     |
| `features/scan/ui/scan-screen.test.tsx`       | 解釈が出ること。**生のテキストも同時に出ていること**。Wi-Fi のパスワードが既定で伏せられていること                              |
| `e2e/tests/scan.spec.ts`                      | Wi-Fi と GS1 の固定画像で解釈が出ること                                                                                         |

**壊れた入力を必ず入れること。** バーコードは汚れ・切れ・読み違いで、
仕様どおりでない文字列が普通に来る。解釈が例外を投げると読み取り画面ごと落ちる。

## Done criteria

- [ ] `bun run check` が exit 0
- [ ] `bun run test` が exit 0
- [ ] `bun run e2e` が exit 0
- [ ] `grep -rn "throw" features/scan/core/` が **0 件**
- [ ] `git diff --name-only` に `features/scan/contract/decode.ts` が
      **含まれない**（`Detection` を変えていない証拠）
- [ ] `git diff --name-only` に `features/generate/` が **含まれない**
      （003 / 004 のレーンと衝突していない証拠）
- [ ] 解釈できない入力で、いまと同じ表示（素のテキスト）になるテストがある
- [ ] In scope 以外のファイルが変更されていない
- [ ] `plans/README.md` の 005 の行が DONE

## STOP conditions

止めて報告すること:

- Drift check で「Current state」の引用と実際のコードが食い違っている。
- `Detection` 型を変えないと解釈できない、と判断した。
- `features/generate/**` を参照したくなった。**範囲外**（理由は下記）。
- `tel:` や `mailto:` をリンクにしたくなった。既存のセキュリティ判断を
  この計画で緩めない。必要だと考えるなら報告すること。
- GS1 の AI 連結規則が、手元の資料で確定できない。**推測で実装しない。**
- 検証コマンドが、妥当な修正を 1 回試しても 2 回連続で失敗する。

## Maintenance notes

- **生成側の形式定義を共有しなかったのは意図的。** いま同時に別のレーンで
  `features/generate` に形式を足している（plans/003）。共有すると両レーンが
  同じファイルを編集して衝突する。**両方が落ち着いてから**、`MECARD:` などの
  形式文字列を 1 箇所に寄せるのが筋。その時が来たら
  `shared/contract` か新しい `features/*/contract` に置く
- 解釈は**必ず失敗しうる**。壊れたバーコードは日常なので、`Interpretation` は
  常に値を返し、最後は `plain` に落ちる設計を崩さないこと
- GS1 の AI は 100 種類以上ある。全部を実装する価値は無い。
  **実際に読まれたのに未対応だった AI** を見て足すのが正しい増やし方
- レビューで見るべき点: 解釈結果だけを表示して生のテキストを消していないか。
  解釈が外れたときに利用者が詰む
