# Plan 003: 設計済みで未実装の内容の種類（名刺・メール・電話・SMS・地図・予定）を実装する

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

`docs/domain-model.md` の `CodePayload` には**内容の種類が 11 個設計されている**が、
実装されているのは `text` / `url` / `wifi` の **3 個だけ**。名刺・メール・電話・
SMS・地図・予定は設計だけあって箱が空のまま残っている。

同じドキュメントに拡張の道も書いてある（`docs/domain-model.md:96-98`）:

> 各 kind は `encode(payload): Result<EncodedData, PayloadError>` を持ち、
> `features/generate/core/payload/<kind>.ts` に 1 ファイルずつ実装する。
> レジストリは Mapped Type なので**追加漏れがコンパイルエラーになる**。

ところが `features/generate/core/` の中身は `index.ts` 1 ファイル・2 行だけ
（`export const FEATURE_NAME = 'generate'`）。**設計した箱が空**。

名刺 QR（MeCard）は日本で最も多い非 URL 用途で、メール・電話・SMS・地図は
どの QR ツールにもある。**純粋な TypeScript だけで実装でき、Rust も wasm も
サーバも触らない**ので、このリポジトリで最も安く価値が出る。

## Current state

### いまの内容の種類

```ts
// features/generate/contract/payload.ts
import type { HttpUrl, NonEmptyText } from '@qrcc/contract'

export type WifiAuth =
  | { readonly kind: 'nopass' }
  | { readonly kind: 'wep'; readonly password: string }
  | { readonly kind: 'wpa'; readonly password: string }

export type CodePayload =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'url'; readonly url: HttpUrl }
  | {
      readonly kind: 'wifi'
      readonly ssid: NonEmptyText
      readonly auth: WifiAuth
      readonly hidden: boolean
    }

export type PayloadKind = CodePayload['kind']

type PayloadMeta = {
  readonly label: string
  readonly description: string
}

/** `CodePayload` にメンバーを足すと、ここも埋めるまでコンパイルが通らない。 */
export const PAYLOAD_META: { readonly [K in PayloadKind]: PayloadMeta } = {
  text: { label: 'テキスト', description: '任意の文字列をそのまま入れます。' },
  url: { label: 'URL', description: '読み取るとブラウザで開きます。' },
  wifi: {
    label: 'Wi-Fi 設定',
    description: '読み取るとネットワークに接続できます。パスワードはコードに含まれます。',
  },
}
```

### 文字列への変換は今どこにあるか

**Rust 側（`features/generate/engine/src/payload.rs`）が `CodePayload` を
受け取って文字列に変換している。** TS 側は「フォームの値を `CodePayload` に
組み立てる」だけ。実例は `features/generate/ui/generate-schema.tsx` ではなく
`features/generate/ui/generate-screen.tsx` の `buildPayload`:

```ts
const buildPayload = (state: FormState): Result<CodePayload, BuildError> => {
  switch (state.payloadKind) {
    case 'text':
      return state.text.length === 0
        ? { ok: false, error: { field: '内容', reason: '文字を入力してください' } }
        : { ok: true, value: { kind: 'text', text: state.text } }
    case 'url': {
      const url = parseHttpUrl(state.url)
      return url.ok
        ? { ok: true, value: { kind: 'url', url: url.value } }
        : {
            ok: false,
            error: { field: 'URL', reason: 'http:// か https:// で始まる URL を入力してください' },
          }
    }
    case 'wifi': {
      /* ssid を parseNonEmptyText して組み立てる */
    }
  }
}
```

**着手前に必ず `features/generate/engine/src/payload.rs` を読むこと。**
TS で足した種類は、Rust 側にも同じ形で足さないと生成できない。
Rust の `CodePayload` は serde でこの JSON を読む。

### 符号との互換性（002 で変わっている）

plans/002 のあと、互換性は `SYMBOLOGY_META[kind].acceptsPayloads` が持つ。
QR は `'all'` なので、**新しい種類は QR で自動的に使えるようになる**。
`code128` / `ean13` は明示リストなので、**このレーンでは `symbology.ts` を
一切触らない**（名刺や地図を 1D バーコードに載せる必要は無い）。

### フォームの作り

内容ごとの入力欄は `generate-screen.tsx` のベタ書き分岐:

```tsx
{state.payloadKind === 'text' ? ( /* テキスト欄 */ ) : undefined}
{state.payloadKind === 'url' ? ( /* URL 欄 */ ) : undefined}
{state.payloadKind === 'wifi' ? ( /* SSID・パスワード・ステルス */ ) : undefined}
```

種類の選択そのものは `PAYLOAD_KINDS.map(...)` で自動生成されるので、
**ラジオボタンは足さなくてよい**。増やすのは入力欄だけ。

### 守るべきリポジトリの決まり（`CLAUDE.md` から。実行者は読んでいない前提）

- **`any` / `as` / `!` / `class` / `enum` を書かない**（`as const` は許可）。
- **ドメイン層（`features/*/contract` / `features/*/core`）で `throw` しない。**
  失敗は `Result<T, E>` で返す。`ok()` / `err()` は `@qrcc/contract` にある。
  使用例は `features/scan/ui/browser-scan.ts:38-47`。
- **依存（時計・乱数・DOM）は関数引数で受け取る。**
- **実装より先に失敗するテストを書く**（red → green）。
- **アクセシビリティは WCAG AAA を狙っている。** 新しい入力欄も既存と同じく
  `@qrcc/ui` の `Field` を使い、ラベル・ヒント・エラーを結びつけること。
  markuplint と axe（e2e）が CI で走る。
- コメントは日本語、識別子は英語。

## Commands you will need

| 目的           | コマンド                      | 成功時  |
| -------------- | ----------------------------- | ------- |
| 型検査         | `bun run typecheck`           | exit 0  |
| テスト（絞る） | `bun test features/generate`  | 全 pass |
| テスト（全体） | `bun run test`                | 全 pass |
| 一式           | `bun run check`               | exit 0  |
| Rust テスト    | `cargo test -p qrcc-generate` | 全 pass |
| e2e            | `bun run e2e`                 | 全 pass |

## Scope

**In scope**:

- `features/generate/contract/payload.ts`
- `features/generate/core/payload/*.ts`（新規。1 種類 1 ファイル）
- `features/generate/core/index.ts`
- `features/generate/core/payload/*.test.ts`（新規）
- `features/generate/ui/generate-screen.tsx`（入力欄）
- `features/generate/ui/generate-screen.test.tsx`
- `features/generate/engine/src/payload.rs`（Rust 側の対応する型と変換）
- `features/generate/fixtures/render-cases.json`（適合テストの追加）
- `e2e/tests/generate.spec.ts`
- `docs/domain-model.md`（実装済みに更新）

**Out of scope**（触らない）:

- `features/generate/contract/symbology.ts` — **plans/004 が所有している。**
  新しい内容は QR で自動的に使える（002 の `acceptsPayloads: 'all'`）ので、
  1D の符号に載せようとしないこと
- `features/generate/engine/src/symbology.rs` — 同上
- `features/scan/**` — 読み取り側は plans/005 の担当
- `features/manage/**` — 保存されたコードの編集画面。今回は増やさない
  （`code-editor-screen.tsx` は既存 3 種類のままで構わない。壊さないこと）

## 実装する種類

`docs/domain-model.md:70-93` の設計に合わせる。**設計にある形を勝手に変えない。**

| kind    | 形式                                      | 備考                                                    |
| ------- | ----------------------------------------- | ------------------------------------------------------- |
| `email` | `to` / `subject` / `body`                 | `mailto:` 形式                                          |
| `tel`   | `number`                                  | `tel:` 形式                                             |
| `sms`   | `number` / `body`                         | `SMSTO:` 形式（Android / iOS の QR リーダで最も通る）   |
| `vcard` | `VCard`（氏名・組織・電話・メール・URL）  | **MeCard を既定にする**。日本の携帯・スマホで最も読める |
| `geo`   | `lat` / `lon`                             | `geo:` 形式                                             |
| `event` | `CalendarEvent`（件名・開始・終了・場所） | iCalendar の `VEVENT`                                   |

`gs1` と `raw` は**この計画に含めない**（`gs1` は plans/005 の解釈側と対で
設計すべき、`raw` はバイト列の扱いが別問題）。

## Git workflow

- ブランチ: `feat/payload-kinds`
- Conventional Commits。**種類ごとに 1 コミット**にすると差し戻しやすい。
  例: `feat(generate): 名刺（MeCard）を内容の種類に足す`
- **push や PR 作成は指示されるまで行わない。**

## Steps

### Step 1: 1 種類目（`tel`）で往復を通す

いきなり 6 種類作らない。**最も単純な `tel` で、TS → Rust → フォーム →
テストの往復を 1 周させてから**残りに展開する。

1. `payload.ts` の `CodePayload` に `tel` を足す。
   → `PAYLOAD_META` が Mapped Type なので**この時点でコンパイルが落ちる**。
   落ちることを確認してから `PAYLOAD_META` を埋める。
2. `features/generate/core/payload/tel.ts` に電話番号の検証を書く。
   `Result` で返し、`throw` しない。番号の正規化（ハイフン・全角の扱い）は
   ここに閉じる。
3. `features/generate/engine/src/payload.rs` に対応する variant と、
   `tel:` 形式への変換を足す。
4. `generate-screen.tsx` に入力欄を足す（`Field` を使う）。
5. `render-cases.json` に 1 件足す（TS と Rust の形が一致することの担保）。

**Verify**:
`bun test features/generate` → 全 pass
`cargo test -p qrcc-generate` → 全 pass
`bun run typecheck` → exit 0

### Step 2: 残り 5 種類を同じ手順で足す

`email` → `sms` → `geo` → `event` → `vcard` の順（単純な順）。
**1 種類ごとにコミットし、その都度 Step 1 の検証を通すこと。**

`vcard` が最後なのは、項目数が多く形式（MeCard / vCard）の選択があるため。

### Step 3: 生成できることを e2e で確かめる

`e2e/tests/generate.spec.ts` に、種類を切り替えて入力し、プレビューに
その内容がテキストで出ることを確かめるテストを足す。

**既存の書き方に合わせること**: この spec は生成側のランドマークに限定して
見ている（`generate(page)` ヘルパ）。固定待ち（`waitForTimeout`）は使わず、
`await expect(...)` の自動待ちだけを使う。

**Verify**: `bun run e2e` → 全 pass。

### Step 4: ドキュメントを実態に合わせる

`docs/domain-model.md` の `CodePayload` の節に、どれが実装済みでどれが
未実装（`gs1` / `raw`）かが分かるように書き足す。

**Verify**: `bun run check` → exit 0。

## Test plan

| ファイル                                        | 内容                                                                                                                                                |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/generate/core/payload/<kind>.test.ts` | 種類ごと: 正常系 1、**その形式でよくある入力ミス** 2〜3（空、記号だけ、桁が足りない等）。`throw` せず `Result` で返ること                           |
| `features/generate/ui/generate-screen.test.tsx` | 種類を切り替えると入力欄が入れ替わること（既存の「内容の種類を変えると入力欄が入れ替わる」が手本）。組み立てた `CodePayload` が期待どおりであること |
| `features/generate/engine/tests/`（Rust）       | 各形式の文字列が仕様どおりであること（`MECARD:N:...;;` など）。ゴールデンテスト                                                                     |
| `features/generate/fixtures/render-cases.json`  | 種類ごとに 1 件。TS と Rust の JSON が一致することの担保                                                                                            |
| `e2e/tests/generate.spec.ts`                    | 代表 2 種類（`tel` と `vcard`）で、生成結果がテキストで出ること                                                                                     |

**すべて red → green の順で書くこと。**

## Done criteria

- [ ] `bun run check` が exit 0
- [ ] `bun run test` が exit 0
- [ ] `cargo test --workspace` が exit 0
- [ ] `bun run e2e` が exit 0
- [ ] `bun -e "import('./features/generate/contract/payload.ts').then(m=>console.log(m.PAYLOAD_KINDS.length))"`
      が **9** を出力（既存 3 + 新規 6）
- [ ] `/bin/ls features/generate/core/payload/` に 6 つの実装ファイルがある
- [ ] `git diff --name-only` に `features/generate/contract/symbology.ts` が
      **含まれない**（004 のレーンと衝突していない証拠）
- [ ] In scope 以外のファイルが変更されていない
- [ ] `plans/README.md` の 003 の行が DONE

## STOP conditions

止めて報告すること:

- plans/002 が未完了（`grep -c acceptsPayloads features/generate/contract/symbology.ts`
  が 0）。**002 が入る前に着手しない。**
- `features/generate/contract/symbology.ts` を編集したくなった。範囲外。
- `docs/domain-model.md` の設計と違う形にしたくなった。理由を添えて報告し、
  勝手に変えない。
- Rust 側の `CodePayload` が serde で読めず、TS と Rust の形を変えないと
  通らないことが判明した（適合テストが落ち続ける）。
- 検証コマンドが、妥当な修正を 1 回試しても 2 回連続で失敗する。

## Maintenance notes

- **形式の選択は利用者に見せないほうがよい。** 名刺は MeCard を既定にする
  （日本の読み取り機での通りが最も良い）。vCard も出したくなったら、
  「詳しい設定」の中に隠すこと。入口で形式を選ばせると、ほとんどの人が
  違いを判断できない。
- `PAYLOAD_META` は Mapped Type なので、**種類を足すと必ずコンパイルが落ちる**。
  この安全網を消さないこと（既定値やインデックスシグネチャを入れない）。
- 保存されたコードの編集画面（`features/manage/ui/code-editor-screen.tsx`）は
  今回**意図的に触っていない**。新しい種類を保存・編集できるようにするのは
  別の作業で、`features/manage/contract/spec.ts` の変更を伴う。
- 読み取り側で `MECARD:` や `BEGIN:VCARD` を**解釈して表示する**のは
  plans/005（GS1）と同じ性質の作業。まとめてやると筋が良い。
