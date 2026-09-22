# Plan 002: 内容と符号の互換性を、総当たり switch から符号側のメタデータに移す

> **Executor instructions**: 上から順に実行し、各ステップの検証コマンドを必ず走らせて
> 期待結果を確認してから次へ進むこと。「STOP conditions」に該当したら勝手に判断せず
> **止めて報告**すること。完了したら `plans/README.md` の該当行を更新すること。
>
> **Drift check（最初に実行）**:
> `git diff --stat 57f52ad..HEAD -- features/generate/contract`
> 出力が空でなければ、下の「Current state」の引用と実際のコードを突き合わせ、
> 食い違っていたら STOP condition として扱うこと。

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Blocks**: plans/003（内容の種類）, plans/004（1D 符号）
- **Category**: tech-debt
- **Planned at**: commit `57f52ad`, 2026-09-06

## Why this matters

「どの内容がどの符号に載るか」がいま `isPayloadCompatible` という**総当たりの
switch 1 箇所**に集まっている。この形だと、**内容を増やす作業と符号を増やす作業が
必ず同じ関数を編集する**ため、並行して進めると確実に衝突する。

この計画は振る舞いを 1 ミリも変えずに、判定を**符号側のメタデータ**へ移す。
そうすると:

- 符号を足す人は `symbology.ts` の自分のエントリだけを書く
- 内容を足す人は `payload.ts` だけを書く（QR は既定で全部受け入れる）

これが済んで初めて、003 と 004 を別々のレーンで同時に進められる。

## Current state

### いまの判定（これを置き換える）

```ts
// features/generate/contract/render.ts
export const isPayloadCompatible = (
  payloadKind: CodePayload['kind'],
  symbologyKind: SymbologyKind,
): boolean => {
  switch (symbologyKind) {
    case 'qr':
      return true
    // EAN-13 は数字だけなので、テキスト以外は入れられない
    case 'ean13':
      return payloadKind === 'text'
    // Code128 は ASCII のみ。URL とテキストは載るが、日本語混じりの Wi-Fi 設定は載らない
    case 'code128':
      return payloadKind === 'text' || payloadKind === 'url'
  }
}
```

**いまの答えの全量（3 × 3）。この表は変えてはならない。**

|         | text | url   | wifi  |
| ------- | ---- | ----- | ----- |
| qr      | true | true  | true  |
| code128 | true | true  | false |
| ean13   | true | false | false |

### 置き先のレジストリ

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
  code128: {/* label / description / oneDimensional: true / quietZone: 10 / defaults / example */},
  ean13: {/* 同上。quietZone: 9 */},
}

export type SymbologyKind = Symbology['kind']
```

`PayloadKind` も同じ作りで、`payload.ts` にある。

```ts
// features/generate/contract/payload.ts
export type PayloadKind = CodePayload['kind']
```

### 守るべきリポジトリの決まり（`CLAUDE.md` から。実行者は読んでいない前提）

- **`any` / `as` / `!` / `class` / `enum` を書かない。** `.oxlintrc.json` の
  `qrcc/*` ルールが落とす（`as const` は許可）。
- **ドメイン層（`features/*/contract` / `features/*/core`）で `throw` しない。**
  失敗は `Result<T, E>` で返す。この計画で扱う関数は `boolean` を返すので該当しない。
- **実装より先に失敗するテストを書く**（red → green）。
- コメントは日本語、識別子は英語。既存ファイルのコメント密度に合わせる。

`SYMBOLOGY_META` は Mapped Type なので、**メンバーを足すと埋めるまでコンパイルが
通らない**。この性質を壊さないこと。

## Commands you will need

| 目的           | コマンド                     | 成功時  |
| -------------- | ---------------------------- | ------- |
| 型検査         | `bun run typecheck`          | exit 0  |
| テスト（絞る） | `bun test features/generate` | 全 pass |
| テスト（全体） | `bun run test`               | 全 pass |
| 一式           | `bun run check`              | exit 0  |

## Scope

**In scope**:

- `features/generate/contract/symbology.ts`
- `features/generate/contract/render.ts`
- `features/generate/contract/render.test.ts`

**Out of scope**（関係ありそうでも触らない）:

- `features/generate/contract/payload.ts` — 内容の種類は 003 の担当。
  ここでは 1 行も変えない
- `features/generate/engine/**`（Rust）— 互換性の判定は TS 側だけの関心事。
  Rust は不正な組み合わせを受けたらエラーを返す設計で、変更不要
- `features/generate/ui/**` — `isPayloadCompatible` の**呼び出し方は変えない**。
  引数の順序も戻り値も同じにすること

## Git workflow

- ブランチ: `feat/compat-registry`
- Conventional Commits。`commit-msg` フックが検証する。
  例: `refactor(generate): 互換性の判定を符号側のメタデータに移す`
- **push や PR 作成は指示されるまで行わない。**

## Steps

### Step 1: いまの答えを全量で固定する（red にはならない）

`features/generate/contract/render.test.ts` に、上の 3 × 3 の表をそのまま
確かめるテストを足す。**この時点では通る**（リファクタ前後で答えが同じことを
保証するための土台）。

```ts
const EXPECTED: readonly (readonly [PayloadKind, SymbologyKind, boolean])[] = [
  ['text', 'qr', true],
  ['url', 'qr', true],
  ['wifi', 'qr', true],
  ['text', 'code128', true],
  ['url', 'code128', true],
  ['wifi', 'code128', false],
  ['text', 'ean13', true],
  ['url', 'ean13', false],
  ['wifi', 'ean13', false],
]
```

全組み合わせを網羅していること自体も確かめる
（`EXPECTED.length === PAYLOAD_KINDS.length * SYMBOLOGY_KINDS.length`）。

**Verify**: `bun test features/generate/contract/render.test.ts` → 全 pass。

### Step 2: 符号側にメタデータを足す（red）

`SymbologyMeta` に次を足す。

```ts
/**
 * この符号に載せられる内容の種類。
 *
 * `'all'` は「これから増える種類も含めて全部」。QR は文字数さえ足りれば
 * 何でも載るので `'all'` にしておく。こうすると**内容を増やす作業が
 * この表を触らずに済む**（1D の符号は明示した種類だけを受け入れる）。
 */
readonly acceptsPayloads: 'all' | readonly PayloadKind[]
```

`SYMBOLOGY_META` の 3 エントリに、上の表と同じ意味の値を入れる。

- `qr`: `'all'`
- `code128`: `['text', 'url']`
- `ean13`: `['text']`

まだ `isPayloadCompatible` は書き換えない。この時点で
**「メタデータから引いた答えが表と一致する」テスト**を足すと red になる。

**Verify**: `bun test features/generate/contract/render.test.ts` → 新しいテストが fail。

### Step 3: 判定をメタデータ由来に置き換える（green）

`isPayloadCompatible` の中身を、`SYMBOLOGY_META[symbologyKind].acceptsPayloads`
を見る形にする。**引数の順序・名前・戻り値の型は変えない**（呼び出し側を壊さない）。

`switch` が消えるので、`symbology.ts` からの import が必要になる。
循環 import にならないことを確認すること（`render.ts` は既に `symbology.ts` から
型を import している）。

**Verify**:
`bun test features/generate` → 全 pass（Step 1 の 3 × 3 も含めて）。
`bun run typecheck` → exit 0。

### Step 4: 追加漏れがコンパイルエラーになることを確かめる

`Symbology` のユニオンに架空のメンバーを 1 つ足して `bun run typecheck` が
**落ちる**ことを確認し、確認できたら**必ず元に戻す**。

これは「レジストリの安全網が生きているか」の確認であり、
`switch` から `Record` に移したことで壊れていないかを見るためのもの。

**Verify**: 一時変更で `bun run typecheck` が exit 1 → 戻して exit 0。

### Step 5: 後続レーンへの申し送りをコメントに残す

`SYMBOLOGY_META` の直前に、次の意味のコメントを日本語で置く。

> 内容の種類（`PAYLOAD_KINDS`）を増やすときは、**このファイルを触らなくてよい**。
> QR は `'all'` なので自動的に受け入れる。1D の符号に新しい種類を載せたいときだけ、
> その符号の `acceptsPayloads` に足す。

**Verify**: `bun run check` → exit 0。

## Test plan

| ファイル                                    | 内容                                                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `features/generate/contract/render.test.ts` | 3 × 3 の全量表（Step 1）、組み合わせを網羅していることの確認、メタデータ由来の判定が表と一致すること |

手本は同ファイルの既存テスト（`for (const kind of PAYLOAD_KINDS) expect(isPayloadCompatible(kind, 'qr')).toBe(true)` のあたり）。

検証: `bun run test` → 既存 636 件 + 新規が pass。

## Done criteria

- [ ] `bun run check` が exit 0
- [ ] `bun run test` が exit 0
- [ ] `grep -n "switch (symbologyKind)" features/generate/contract/render.ts` が **0 件**
- [ ] `grep -c "acceptsPayloads" features/generate/contract/symbology.ts` が **4 以上**
      （型定義 1 + エントリ 3）
- [ ] `isPayloadCompatible` の**シグネチャが変わっていない**
      （`git diff` で引数と戻り値の型に変更が無いこと）
- [ ] In scope 以外のファイルが変更されていない（`git status`）
- [ ] `plans/README.md` の 002 の行が DONE

## STOP conditions

止めて報告すること:

- Drift check で「Current state」の引用と実際のコードが食い違っている。
- **3 × 3 の答えが 1 マスでも変わった。** これは振る舞いを変えない作業。
- `render.ts` と `symbology.ts` の間で循環 import になる。
- `payload.ts` を編集したくなった。**それは 003 の担当**で、範囲外。

## Maintenance notes

- これ以降、**内容の種類を増やす人は `symbology.ts` を触らなくてよい**。
  QR が `'all'` なので自動的に載る。1D に載せたいときだけ明示的に足す。
- 逆に、**新しい 1D 符号は「何を受け入れるか」を自分で宣言する**。
  既定を `'all'` にしないこと。数字しか入らない符号に vCard を載せられると
  利用者が困る。
- レビューで見るべき点: `acceptsPayloads` の既定値を作らないこと。
  Mapped Type の「埋めるまで通らない」性質が消える。
