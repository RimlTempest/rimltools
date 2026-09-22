# Plan 004: 読めるのに作れない 1D バーコード（Code 39 / Code 93 / EAN-8 / ITF / Codabar）を生成できるようにする

> **Executor instructions**: 上から順に実行し、各ステップの検証コマンドを必ず走らせて
> 期待結果を確認してから次へ進むこと。「STOP conditions」に該当したら勝手に判断せず
> **止めて報告**すること。完了したら `plans/README.md` の該当行を更新すること。
>
> **Drift check（最初に実行）**:
> `git diff --stat 57f52ad..HEAD -- features/generate`
> plans/002 の変更（`acceptsPayloads` の追加）は**入っている前提**。
> それ以外の差分があれば「Current state」と突き合わせ、食い違えば STOP。

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/002（これが済むまで着手しない）
- **Category**: direction
- **Planned at**: commit `57f52ad`, 2026-09-06

## Why this matters

このアプリは **21 種類のバーコードを読める**が、**作れるのは 3 種類だけ**。
Code 39 も EAN-8 も ITF も「読めるのに作れない」状態になっている。

そして生成エンジンが既に依存している `barcoders` crate は **9 種類**を持っていて、
使っているのは 2 つだけ。

```
features/generate/engine/Cargo.toml → barcoders.workspace = true
barcoders の src/sym/: codabar code11 code128✅ code39 code93 ean13✅ ean8 ean_supp tf
```

つまり **新しい依存を 1 つも足さずに**、読み書きの非対称を大きく埋められる。
ITF は日本の物流（ITF-14 集合包装）で実用。

wasm の予算にも余裕がある。**生成 wasm は 86,756 bytes gzip、CI の上限は
200,000 bytes**（`.github/workflows/ci.yml` の「wasm バンドルサイズの上限を守ること」）。

## Current state

### いま作れる符号

```ts
// features/generate/contract/symbology.ts
export const SYMBOLOGY_META: { readonly [K in SymbologyKind]: SymbologyMeta<K> } = {
  qr: {
    label: 'QR コード',
    description: '日本語も URL も入る 2 次元コード。誤り訂正レベルを選べます。',
    oneDimensional: false,
    quietZone: 4,
    defaults: { kind: 'qr', ec: 'M' },
    example: 'https://example.com',
  },
  code128: {
    label: 'Code 128',
    description: '英数字を高密度で表せる 1 次元バーコード。物流や在庫でよく使われます。',
    oneDimensional: true,
    quietZone: 10,
    defaults: { kind: 'code128', charset: 'auto' },
    example: 'ABC-12345',
  },
  ean13: {
    label: 'EAN-13 / JAN',
    description: '商品識別に使う 13 桁のバーコード。12 桁を入れると検査数字を計算します。',
    oneDimensional: true,
    quietZone: 9,
    defaults: { kind: 'ean13' },
    example: '750103131130',
  },
}

export type SymbologyKind = Symbology['kind']
```

plans/002 のあと、各エントリは `acceptsPayloads: 'all' | readonly PayloadKind[]`
も持っている。

### 読み取り側の語彙（合わせる相手）

```ts
// features/scan/contract/symbology.ts
codabar: { label: 'Codabar', oneDimensional: true, detectorFormat: 'codabar' },
code39:  { label: 'Code 39', oneDimensional: true, detectorFormat: 'code_39' },
code93:  { label: 'Code 93', oneDimensional: true, detectorFormat: 'code_93' },
ean8:    { label: 'EAN-8', oneDimensional: true, detectorFormat: 'ean_8' },
itf:     { label: 'ITF（インターリーブド 2 of 5）', oneDimensional: true, detectorFormat: 'itf' },
```

**ラベルはこの表記に揃えること。** 同じものを作る側と読む側で違う名前で
呼ぶと、利用者が別物だと思う。

### Rust 側の作り

`features/generate/engine/src/symbology.rs` に、符号ごとの enum variant と
`barcoders` 呼び出しがある。`code128` の実装が手本になる。

```rust
pub enum Code128Charset { /* Auto / A / B / C */ }

// Symbology の variant
Code128 { charset: Code128Charset },

// 名前・1D 判定・クワイエットゾーン・符号化の 4 箇所に分岐がある
Self::Code128 { .. } => "Code128",
Self::Code128 { .. } | Self::Ean13 => true,
Self::Code128 { .. } => 10,
Self::Code128 { charset } => encode_code128(data, *charset),

fn encode_code128(data: &str, charset: Code128Charset) -> Result<Modules, EncodeError> {
    // barcoders は文字集合を先頭の 1 文字で指定する
    let encoded = barcoders::sym::code128::Code128::new(&source)
    // ...
}
```

**着手前に `features/generate/engine/src/symbology.rs` を最後まで読むこと。**
分岐は 4 箇所あり、1 つでも埋め忘れると Rust のコンパイルが落ちる（それが安全網）。

### 適合テスト

```
features/generate/fixtures/render-cases.json
```

TS が組み立てる `RenderRequest` の JSON と、Rust が読む形が一致することを
両側から確かめる仕組み。`features/generate/contract/conformance.test.ts` と
`features/generate/engine/tests/conformance.rs` が同じ JSON を読む。
**符号を足したらここにも 1 件足す。**

### フォームは触らなくてよい

符号の選択はレジストリから自動生成されている。

```tsx
// features/generate/ui/generate-screen.tsx
<div role="radiogroup" aria-label="コードの種類">
  {SYMBOLOGY_KINDS.map((kind) => (
    <label key={kind}>
      <input type="radio" ... />
      {SYMBOLOGY_META[kind].label}
    </label>
  ))}
</div>
```

**`generate-screen.tsx` は編集しない。** そこは plans/003 が所有している。

### 守るべきリポジトリの決まり（`CLAUDE.md` から。実行者は読んでいない前提）

- **`any` / `as` / `!` / `class` / `enum` を書かない**（TS 側。`as const` は許可）。
- **ドメイン層で `throw` しない。** 失敗は `Result<T, E>`。
  Rust 側も `Result<_, EncodeError>` を返す（既存に倣う）。
- **`*/engine`（Rust）は `worker` crate に依存しない。** ブラウザ向け wasm が壊れる。
- **実装より先に失敗するテストを書く**（red → green）。
- コメントは日本語、識別子は英語。

## Commands you will need

| 目的        | コマンド                                                | 成功時  |
| ----------- | ------------------------------------------------------- | ------- |
| 型検査      | `bun run typecheck`                                     | exit 0  |
| TS テスト   | `bun test features/generate`                            | 全 pass |
| Rust テスト | `cargo test -p qrcc-generate`                           | 全 pass |
| Rust lint   | `cargo clippy --workspace --all-targets -- -D warnings` | exit 0  |
| 一式        | `bun run check`                                         | exit 0  |
| wasm を作る | `bun run --filter '@qrcc/wasm' build`                   | exit 0  |
| e2e         | `bun run e2e`                                           | 全 pass |

**wasm サイズの測り方**（CI と同じ）:

```bash
bun run build
find services/web/dist/client -name 'qrcc_wasm_bg*.wasm' -exec gzip -c {} + | wc -c
# 200000 未満であること
```

## Scope

**In scope**:

- `features/generate/contract/symbology.ts`
- `features/generate/contract/symbology.test.ts` / `conformance.test.ts`
- `features/generate/engine/src/symbology.rs`
- `features/generate/engine/tests/`（ゴールデンテスト）
- `features/generate/fixtures/render-cases.json`
- `e2e/tests/generate.spec.ts`

**Out of scope**（触らない）:

- `features/generate/ui/generate-screen.tsx` — **plans/003 が所有している。**
  符号のラジオはレジストリから自動生成されるので、触る必要が無い
- `features/generate/contract/payload.ts` — 同上
- `features/scan/**` — 読み取り側は既に対応済み。語彙を**合わせる**だけで、
  読み取り側を変えない
- **2 次元の符号（Data Matrix / PDF417 / Aztec）** — `qrcode` crate は QR しか
  作れず、別 crate が要る。wasm 予算への影響も別問題。この計画に含めない

## 実装する符号

| kind      | ラベル（読み取り側と揃える）     | barcoders      |
| --------- | -------------------------------- | -------------- |
| `code39`  | `Code 39`                        | `sym::code39`  |
| `code93`  | `Code 93`                        | `sym::code93`  |
| `ean8`    | `EAN-8`                          | `sym::ean8`    |
| `itf`     | `ITF（インターリーブド 2 of 5）` | `sym::tf`      |
| `codabar` | `Codabar`                        | `sym::codabar` |

`code11` と `ean_supp` は入れない（前者は用途がほぼ無く、後者は単独で
成立しない補助記号）。

`acceptsPayloads` は**すべて `['text']`**。1D バーコードに名刺や地図を
載せる用途は無い。

## Git workflow

- ブランチ: `feat/1d-symbologies`
- Conventional Commits。**符号ごとに 1 コミット**。
  例: `feat(generate): Code 39 を生成できるようにする`
- **push や PR 作成は指示されるまで行わない。**

## Steps

### Step 1: 1 種類目（`code39`）で往復を通す

いきなり 5 種類作らない。**Code 39 で TS → Rust → 適合テストの往復を
1 周させてから**残りに展開する。

1. `symbology.ts` の `Symbology` ユニオンに `{ kind: 'code39' }` を足す。
   → `SYMBOLOGY_META` が Mapped Type なので**この時点でコンパイルが落ちる**。
   落ちることを確認してから埋める（`oneDimensional: true`、
   `quietZone` は仕様どおり、`example`、`acceptsPayloads: ['text']`）。
2. `features/generate/engine/src/symbology.rs` に variant を足す。
   **分岐は 4 箇所**（名前 / 1D 判定 / クワイエットゾーン / 符号化）。
   埋め忘れると Rust が落ちる。
3. `encode_code39` を書く。`encode_code128` が手本。
   `barcoders` が受け付けない文字は `EncodeError` で返す（`panic!` しない）。
4. `render-cases.json` に 1 件足す。

**Verify**:
`cargo test -p qrcc-generate` → 全 pass
`bun test features/generate` → 全 pass
`bun run typecheck` → exit 0

### Step 2: 残り 4 種類を同じ手順で足す

`code93` → `ean8` → `codabar` → `itf` の順。
**1 種類ごとにコミットし、その都度 Step 1 の検証を通すこと。**

`ean8` は EAN-13 と同じく**検査数字の扱い**がある（7 桁を入れたら計算する）。
`ean13` の実装に倣うこと。

`itf` は**桁数が偶数でなければならない**。奇数のときは分かりやすいエラーを返す。

### Step 3: wasm のサイズが上限を超えていないことを確かめる

```bash
bun run build
find services/web/dist/client -name 'qrcc_wasm_bg*.wasm' -exec gzip -c {} + | wc -c
```

**200,000 未満であること。** 着手前は 86,756 だった。
超えたら STOP（勝手に上限を上げない）。

### Step 4: 作った符号が実際に読めることを e2e で確かめる

これがこの計画の肝。**作って読み返せて初めて「対応した」と言える。**

`e2e/tests/generate.spec.ts` に、代表 2 種類（`code39` と `ean8`）で
生成し、プレビューに内容がテキストで出ることを確かめるテストを足す。

既存の書き方に合わせること: 生成側のランドマークに限定（`generate(page)`）、
固定待ちを使わず `await expect(...)` の自動待ちだけ。

**Verify**: `bun run e2e` → 全 pass。

### Step 5: ドキュメントを更新する

`README.md` と `docs/architecture.md` の「対応する符号」に関する記述があれば
実態に合わせる。無ければ何もしない。

**Verify**: `bun run check` → exit 0。

## Test plan

| ファイル                                         | 内容                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/generate/engine/tests/`（Rust）        | 符号ごとにゴールデンテスト（既知の入力 → 既知のモジュール列）。**外部の実装と突き合わせた値を使うこと**。自分の出力をそのまま期待値にしない |
| Rust の異常系                                    | 各符号が受け付けない文字・桁数で `EncodeError` を返すこと（`panic!` しない）                                                                |
| `features/generate/contract/conformance.test.ts` | `render-cases.json` に足した分が TS 側でも読めること                                                                                        |
| `e2e/tests/generate.spec.ts`                     | `code39` と `ean8` を生成して結果が出ること                                                                                                 |

**ゴールデンテストの期待値について**: 自分が書いたエンコーダの出力をそのまま
期待値にすると、間違っていても永久に気づけない。**仕様書か既存の実装で
検算した値**を使うこと。検算できない場合は STOP して報告する。

## Done criteria

- [ ] `bun run check` が exit 0
- [ ] `cargo test --workspace` が exit 0
- [ ] `bun run test` が exit 0
- [ ] `bun run e2e` が exit 0
- [ ] 生成 wasm の gzip サイズが **200,000 bytes 未満**
- [ ] `grep -c "oneDimensional" features/generate/contract/symbology.ts` が **8 以上**
      （型定義 + 8 エントリ）
- [ ] 作れる符号のラベルが読み取り側（`features/scan/contract/symbology.ts`）と
      **文字列として一致**している（`code39` / `code93` / `ean8` / `itf` / `codabar`）
- [ ] `git diff --name-only` に `features/generate/ui/generate-screen.tsx` が
      **含まれない**（003 のレーンと衝突していない証拠）
- [ ] In scope 以外のファイルが変更されていない
- [ ] `plans/README.md` の 004 の行が DONE

## STOP conditions

止めて報告すること:

- plans/002 が未完了（`grep -c acceptsPayloads features/generate/contract/symbology.ts`
  が 0）。**002 が入る前に着手しない。**
- `features/generate/ui/generate-screen.tsx` か `contract/payload.ts` を
  編集したくなった。範囲外。
- **wasm の gzip サイズが 200,000 bytes を超えた。** 上限を上げてはならない。
  どの符号でどれだけ増えたかを測って報告すること。
- ゴールデンテストの期待値を、仕様書や既存実装で**検算できない**。
- `barcoders` が想定した符号を持っていない、または API が
  「Current state」の引用と違う。

## Maintenance notes

- **2 次元（Data Matrix / PDF417 / Aztec）は別問題。** `qrcode` crate は QR
  しか作れない。`rxing` は encoders を持つがデコード用の重い crate（780KB gzip）
  で、生成側に入れると 200KB の上限を確実に超える。やるなら crate の選定から。
- 作る側と読む側で**同じものを違う名前で呼ばない**。`SYMBOLOGY_META` と
  `SCAN_SYMBOLOGY_META` のラベルは手で揃えている。片方だけ直すと利用者が
  別物だと思う。将来ここを 1 つの語彙に寄せるのは筋が良い。
- レビューで見るべき点: ゴールデンテストの期待値がどこから来たか。
  自分の出力をコピーしただけの期待値は、テストではなく記録。
