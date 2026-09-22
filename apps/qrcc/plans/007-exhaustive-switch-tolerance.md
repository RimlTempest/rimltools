# Plan 007: 種類を増やしたときに壊れる 4 つの switch を、増やしても壊れない形にする

> **Executor instructions**: 上から順に実行し、各ステップの検証コマンドを必ず走らせて
> 期待結果を確認してから次へ進むこと。「STOP conditions」に該当したら勝手に判断せず
> **止めて報告**すること。完了したら `plans/README.md` の該当行を更新すること。
>
> **Drift check（最初に実行）**:
> `git diff --stat 9b347a8..HEAD -- features/generate/ui features/manage`
> 出力が空でなければ「Current state」の引用と実際のコードを突き合わせ、
> 食い違えば STOP condition として扱うこと。

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/002（取り込み済み）
- **Blocks**: plans/003（内容の種類）, plans/004（1D 符号）
- **Category**: tech-debt
- **Planned at**: commit `9b347a8`, 2026-09-06

## Why this matters

**この計画は実測から生まれた。** plans/003 と plans/004 を並行で走らせたところ、
**両方とも 1 行目で止まった**。原因は同じで、私（計画の書き手）の見落としだった。

このリポジトリは「ユニオンにメンバーを足したらコンパイルが落ちる」ことを
安全網にしている（CLAUDE.md / `docs/domain-model.md`）。その網は
`PAYLOAD_META` や `SYMBOLOGY_META` のような**レジストリ**だけでなく、
**そのユニオンを網羅する `switch` すべて**に張られている。

実測された壊れ方:

- `CodePayload` に 1 メンバー足すと → `features/generate/ui/generate-screen.tsx`
  に加えて **`features/manage` の 2 ファイル**が `TS2366` で落ちる
- `Symbology` に 1 メンバー足すと → **`generate-screen.tsx` と
  `features/manage/core/code-form.ts`** が `TS2366` で落ちる

つまり 003 と 004 は、計画が「触らなくてよい」と書いた場所を触らないと
`bun run typecheck` を通せない。**両方が同じ 2 ファイルを必要とするので、
並行実行もできない。**

この計画は振る舞いを変えずに、**「増えても壊れなくてよい switch」だけを
壊れない形にする**。安全網は必要な場所（レジストリと、種類ごとに人の判断が
要る場所）に残す。

## 網羅を残す場所と、外す場所（判断の根拠）

| switch            | 場所                             | 方針                     | 理由                                                                                      |
| ----------------- | -------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| `buildPayload`    | `generate-screen.tsx:87`         | **網羅のまま残す**       | 種類ごとに入力欄が違う。増やした人に「フォームをどうするか」を必ず考えさせたい            |
| `buildSymbology`  | `generate-screen.tsx:125`        | **レジストリ由来にする** | 既定値は `SYMBOLOGY_META[kind].defaults` に既にある。二重に持つ必要が無い                 |
| `buildSymbology`  | `manage/core/code-form.ts:89`    | **同上**                 | 同じ関数が 2 箇所にある                                                                   |
| `toCodeContent`   | `manage/core/code-form.ts:138`   | **`default` を足す**     | `CodeContent` に既に `other` があり、「専用の編集欄が無い種類は `other`」という意図が既存 |
| `describePayload` | `manage/ui/testing-fakes.ts:227` | **`default` を足す**     | テスト用の偽物。説明文が出れば十分                                                        |

**`buildPayload` の網羅を外してはならない。** ここを `default` にすると、
新しい種類が「フォームに欄が無いのに選べる」状態で素通りする。

## Current state

### `features/generate/ui/generate-screen.tsx`

```ts
// 87 行目付近 — これは網羅のまま残す
const buildPayload = (state: FormState): Result<CodePayload, BuildError> => {
  switch (state.payloadKind) {
    case 'text': /* … */
    case 'url': /* … */
    case 'wifi': /* … */
  }
}

// 125 行目付近 — これをレジストリ由来にする
const buildSymbology = (state: FormState): Symbology => {
  switch (state.symbologyKind) {
    case 'qr':
      return { kind: 'qr', ec: state.qrEc }
    case 'code128':
      return { kind: 'code128', charset: 'auto' }
    case 'ean13':
      return { kind: 'ean13' }
  }
}
```

`SYMBOLOGY_META` は既に各符号の既定値を持っている（plans/002 で
`acceptsPayloads` を足したのと同じレジストリ）:

```ts
qr:      { …, defaults: { kind: 'qr', ec: 'M' } },
code128: { …, defaults: { kind: 'code128', charset: 'auto' } },
ean13:   { …, defaults: { kind: 'ean13' } },
```

**`code128` と `ean13` は `defaults` と `buildSymbology` の戻り値が完全に一致する。**
QR だけが利用者の選んだ `ec` で上書きする必要がある。

### `features/manage/core/code-form.ts`

```ts
// 89 行目付近 — generate-screen とまったく同じ形
const buildSymbology = (state: CodeFormState): Symbology => {
  switch (state.symbologyKind) {
    case 'qr':
      return { kind: 'qr', ec: state.qrEc }
    case 'code128':
      return { kind: 'code128', charset: 'auto' }
    case 'ean13':
      return { kind: 'ean13' }
  }
}

// 138 行目付近 — 'other' に落ちる意図が既にある
export const toCodeContent = (payload: CodePayload): CodeContent => {
  switch (payload.kind) {
    case 'text':
      return { kind: 'text', text: payload.text }
    case 'url':
      return { kind: 'url', url: payload.url }
    case 'wifi':
      return { kind: 'other', payload }
  }
}
```

### `features/manage/ui/testing-fakes.ts`

```ts
// 227 行目付近
const describePayload = (payload: CodePayload): string => {
  switch (payload.kind) {
    case 'url':
      return `URL: ${payload.url}`
    case 'text':
      return `テキスト: ${payload.text}`
    case 'wifi':
      return `Wi-Fi: ${payload.ssid}`
  }
}
```

### レーンの所有について（実行者への申し送り）

`scripts/lanes.tsv` は `features/manage` を `feat/manage` レーンの所有と
書いているが、**そのレーンはとうに完了してマージ済み**（`git branch -a` で
リモートに `main` しか無いことを確認できる）。`lanes.tsv` は初回の並行構築の
記録であって、現在の所有権ではない。**この計画は `features/manage` を
触ってよい。**

### 守るべきリポジトリの決まり（`CLAUDE.md` から。実行者は読んでいない前提）

- **`any` / `as` / `!` / `class` / `enum` を書かない**（`as const` は許可）。
- **ドメイン層（`features/*/contract` / `features/*/core`）で `throw` しない。**
  失敗は `Result<T, E>` で返す。
- **feature 同士は `@qrcc/<name>` の公開サブパス経由でのみ依存する**（ADR-0007）。
  `code-form.ts` は既に `@qrcc/generate/contract` から型を import している。
  値（`SYMBOLOGY_META`）も同じ経路で import できる。
- **実装より先に失敗するテストを書く**（red → green）。
- コメントは日本語、識別子は英語。

## Commands you will need

| 目的           | コマンド            | 成功時  |
| -------------- | ------------------- | ------- |
| 依存           | `bun install`       | exit 0  |
| 型検査         | `bun run typecheck` | exit 0  |
| テスト（全体） | `bun run test`      | 全 pass |
| 一式           | `bun run check`     | exit 0  |
| e2e            | `bun run e2e`       | 全 pass |

## Scope

**In scope**:

- `features/generate/ui/generate-screen.tsx`（`buildSymbology` **だけ**）
- `features/manage/core/code-form.ts`（`buildSymbology` と `toCodeContent` **だけ**）
- `features/manage/core/code-form.test.ts`
- `features/manage/ui/testing-fakes.ts`（`describePayload` **だけ**）
- `features/generate/ui/generate-screen.test.tsx`（必要なら）

**Out of scope**（触らない）:

- `features/generate/contract/payload.ts` と `symbology.ts` — **種類を増やさない。**
  この計画は「増やせる形にする」だけで、1 つも増やさない
- `features/generate/ui/generate-screen.tsx` の `buildPayload` —
  **網羅のまま残す**（上の表の理由）
- `features/generate/engine/**`（Rust）
- `features/scan/**`, `features/nfc/**` — 別レーンが同時に動いている
- 画面の見た目・文言 — この計画で変わるものは何も無い

## Git workflow

- ブランチ: `feat/switch-tolerance`
- Conventional Commits。例:
  `refactor(generate): 符号の組み立てをレジストリ由来にする`
- **push や PR 作成は指示されるまで行わない。**

## Steps

### Step 1: いまの振る舞いを固定する

`features/manage/core/code-form.test.ts` に、現在の答えを固定するテストを足す
（無ければ作る）。**この時点では通る。**

- `buildSymbology` 相当: `qr`（`ec` が反映される）/ `code128` / `ean13` の
  3 通りで、返る `Symbology` が現在と同じであること
- `toCodeContent`: `text` → `{kind:'text'}`, `url` → `{kind:'url'}`,
  `wifi` → `{kind:'other'}` であること

`buildSymbology` が export されていない場合は、それを使う公開関数
（`buildCodeDraft`）経由で確かめること。**テストのために export を増やさない。**

**Verify**: `bun test features/manage` → 全 pass。

### Step 2: 増やしたら落ちることを実際に見る（この計画の出発点の再現）

`features/generate/contract/symbology.ts` の `Symbology` に架空のメンバーを
1 つ足し、`bun run typecheck` が **`generate-screen.tsx` と `code-form.ts` の
両方で TS2366 になる**ことを確認する。**確認したら必ず元に戻すこと。**

同じことを `CodePayload` でも行い、`code-form.ts` と `testing-fakes.ts` が
落ちることを確認して、元に戻す。

これは「この計画が本当に必要か」を自分の目で確かめる手順。

**Verify**: 一時変更で `bun run typecheck` が exit 1（対象ファイル名がエラーに
出ること）→ 戻して exit 0。

### Step 3: `buildSymbology` をレジストリ由来にする（2 箇所）

両方の `buildSymbology` を、`SYMBOLOGY_META[kind].defaults` を使う形にする。
QR だけ利用者が選んだ `ec` で上書きする。

```ts
/**
 * 符号の既定値はレジストリが持っている（`SYMBOLOGY_META[kind].defaults`）。
 * ここで二重に持たない。こうすると**符号を増やす作業がこの関数を
 * 触らずに済む**。QR だけは利用者が誤り訂正レベルを選ぶので上書きする。
 */
const buildSymbology = (state: FormState): Symbology =>
  state.symbologyKind === 'qr'
    ? { kind: 'qr', ec: state.qrEc }
    : SYMBOLOGY_META[state.symbologyKind].defaults
```

`code-form.ts` 側は `@qrcc/generate/contract` から `SYMBOLOGY_META` を
import する（型は既にそこから取っている）。

**振る舞いが変わらないこと**を Step 1 のテストで確認すること。
`code128` の `charset: 'auto'`、`ean13` の形が `defaults` と一致することは
「Current state」で確認済み。

**Verify**: `bun test features/manage features/generate` → 全 pass。
`bun run typecheck` → exit 0。

### Step 4: `toCodeContent` と `describePayload` に `default` を足す

```ts
export const toCodeContent = (payload: CodePayload): CodeContent => {
  switch (payload.kind) {
    case 'text':
      return { kind: 'text', text: payload.text }
    case 'url':
      return { kind: 'url', url: payload.url }
    // 専用の編集欄を持たない種類は、そのまま抱えて `other` にする。
    // 種類が増えてもこの関数は変えなくてよい（増やした人が編集欄を
    // 用意したくなったときだけ case を足す）
    default:
      return { kind: 'other', payload }
  }
}
```

`describePayload` も同様に `default` を足す。説明文は
`` `${payload.kind}` `` を含む短いもので構わない（テスト用の偽物）。

**`wifi` の case を消して `default` に含める**こと。振る舞いは同じ
（どちらも `{ kind: 'other', payload }`）で、Step 1 のテストが守る。

**Verify**: `bun test features/manage` → 全 pass。

### Step 5: 増やしても落ちないことを確かめる

Step 2 と同じ一時変更をもう一度行い、今度は
**`bun run typecheck` が `PAYLOAD_META` / `SYMBOLOGY_META` の未記入だけを
指摘し、`generate-screen.tsx` / `code-form.ts` / `testing-fakes.ts` を
指摘しない**ことを確認する。**確認したら必ず元に戻す。**

これがこの計画の成否そのもの。

**Verify**: 一時変更時のエラーに `code-form.ts` と `testing-fakes.ts` が
**出ないこと**を目視 → 戻して `bun run check` exit 0。

### Step 6: 申し送りを残す

`buildPayload`（`generate-screen.tsx`）の直前に、次の意味のコメントを置く。

> ここは**網羅のまま残している**。内容の種類ごとに入力欄が違うので、
> 種類を足した人に「フォームをどうするか」を必ず考えさせたい。
> `default` を足さないこと。

**Verify**: `bun run check` → exit 0。`bun run e2e` → 全 pass。

## Test plan

| ファイル                                        | 内容                                                                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `features/manage/core/code-form.test.ts`        | Step 1 の固定テスト（`buildSymbology` 相当 3 通り、`toCodeContent` 3 通り）。リファクタ前後で答えが変わらないこと |
| `features/generate/ui/generate-screen.test.tsx` | 既存テストが通り続けること（新規は不要な場合が多い）                                                              |

**このリファクタで画面の振る舞いは 1 つも変わらない。** 既存の
636 件超のテストと e2e が変わらず通ることが、最大の担保。

## Done criteria

- [ ] `bun run check` が exit 0
- [ ] `bun run test` が exit 0
- [ ] `bun run e2e` が exit 0
- [ ] `grep -c "switch (state.symbologyKind)" features/generate/ui/generate-screen.tsx` が **0**
- [ ] `grep -c "switch (state.symbologyKind)" features/manage/core/code-form.ts` が **0**
- [ ] `grep -c "switch (state.payloadKind)" features/generate/ui/generate-screen.tsx` が **1**
      （`buildPayload` は網羅のまま残っている）
- [ ] Step 5 の確認を実施し、**種類を 1 つ足しても `code-form.ts` と
      `testing-fakes.ts` が型エラーにならない**ことを報告に書いている
- [ ] `features/generate/contract/` 配下が変更されていない（種類を増やしていない）
- [ ] In scope 以外のファイルが変更されていない
- [ ] `plans/README.md` の 007 の行が DONE

## STOP conditions

止めて報告すること:

- Drift check で「Current state」の引用と実際のコードが食い違っている。
- `SYMBOLOGY_META[kind].defaults` が `buildSymbology` の戻り値と**一致しない**
  符号がある（振る舞いが変わってしまう）。
- `buildPayload` を `default` にしたくなった。**明確に禁止**している。
- `features/generate/contract/` の型を変えないと通らない。
- Step 5 で、依然として `code-form.ts` か `testing-fakes.ts` が型エラーになる。
  **この計画の目的が達成できていない**ので、何が残っているかを報告すること。

## Maintenance notes

- **この計画は 003 と 004 の実行者が見つけた実測から生まれた。** 計画を
  書いた側（レビュアー）が「レジストリ駆動だからフォームは触らなくてよい」と
  判断したのが誤りで、ユニオンを網羅する `switch` という第二の結合を
  見落としていた。**新しいユニオンメンバーを足す計画を書くときは、
  必ず `grep -rn "switch (.*\.kind)"` でユニオンを網羅している場所を
  全部数えること。**
- `buildSymbology` が 2 箇所にあるのは重複。将来 1 つに寄せるなら
  `@qrcc/generate/core` あたりが置き場所になる。ただし
  `FormState` と `CodeFormState` が別の型なので、引数の形を揃える作業が要る。
  この計画では**重複を残したまま**、両方をレジストリ由来にするだけにした
  （振る舞いを変えないため）。
- レビューで見るべき点: `buildPayload` に `default` が入っていないこと。
  入っていたら、新しい内容の種類が入力欄なしで素通りする。
