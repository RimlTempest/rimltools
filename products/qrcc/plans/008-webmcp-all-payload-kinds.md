# Plan 008: 生成ツールから 9 種類すべての内容を作れるようにする

> **Executor instructions**: 上から順に実行し、各ステップの検証コマンドを必ず走らせて
> 期待結果を確認してから次へ進むこと。「STOP conditions」に該当したら勝手に判断せず
> **止めて報告**すること。完了したら `plans/README.md` の該当行を更新すること。
>
> **Drift check（最初に実行）**:
> `git diff --stat 94c7cae..HEAD -- features/generate`
> 出力が空でなければ「Current state」の引用と実際のコードを突き合わせ、
> 食い違えば STOP condition として扱うこと。

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/001（取り込み済み）, plans/003（取り込み済み）
- **Category**: direction
- **Planned at**: commit `94c7cae`, 2026-09-06

## Why this matters

plans/003 で内容の種類を 3 → 9 に増やし、plans/001 で WebMCP のツールを公開した。
ところが **`generate-code` ツールは url と text しか受け付けない**。

```ts
// features/generate/ui/webmcp-tools.ts の現状
description: `QR コードやバーコードを生成します。内容が http(s) の URL として
読めれば ${PAYLOAD_META.url.label}、読めなければ ${PAYLOAD_META.text.label}
として符号化します。…`
inputSchema: { properties: { text, symbology, includeSvg }, required: ['text'] }
```

つまり **名刺・メール・電話・SMS・地図・予定・Wi-Fi はエージェントから使えない**。
「この連絡先の名刺 QR を作って」が WebMCP の一番おいしい使い方なのに、
そこだけ穴が空いている。

画面には全 9 種類の入力欄があり、`features/generate/core/payload/` に
検証済みのビルダーもある。**ツールがそれを呼んでいないだけ**なので、
新しいロジックはほとんど要らない。

## Current state

### いまのツール

`features/generate/ui/webmcp-tools.ts`。読むべき点:

- `inputSchema` の `symbology` は `SYMBOLOGY_KINDS` から組み立てている（そのまま踏襲する）
- `isPayloadCompatible(payload.kind, symbologyKind)` で載らない組み合わせを弾いている
- `buildPayload(text)` が `parseHttpUrl` の成否で `url` / `text` を自動判別している
- 戻り値は `textResult(...)`（`@qrcc/webmcp`）

**着手前にこのファイルを最後まで読むこと。**

### 使えるビルダー（plans/003 が作った）

すべて `features/generate/core/payload/<kind>.ts` にあり、**文字列を受け取って
`Result<CodePayload, 固有のエラー>` を返す**。`throw` しない。

```ts
export type EmailInput = { readonly to: string; readonly subject: string; readonly body: string }
export const buildEmailPayload = (input: EmailInput): Result<EmailPayload, EmailError>

export type SmsInput = { readonly number: string; readonly body: string }
export const buildSmsPayload = (input: SmsInput): Result<SmsPayload, SmsError>

export type GeoInput = { readonly lat: string; readonly lon: string }

export type EventInput = {
  readonly subject: string; readonly start: string
  readonly end: string; readonly location: string
}
// start / end は `YYYY-MM-DDTHH:mm`（<input type="datetime-local"> と同じ形）

export type VCardInput = {
  readonly name: string; readonly organization: string
  readonly tel: string; readonly email: string; readonly url: string
}
```

`tel` のビルダーもある。ただし **`buildTelPayload` は文字列を直接受け取る**
（オブジェクトではない）。**各ファイルを開いて、入力の形とエラーの種類を
自分で確かめること。**

### ⚠ `wifi` のビルダーは存在しない（2026-09-06 に修正）

**この計画の初版は「`wifi` のビルダーもある」と書いていたが、誤りだった。**
実行者が実際にディレクトリを調べて指摘した。あるのは 7 本:

```
email.ts  event.ts  geo.ts  phone.ts(共有ヘルパ)  sms.ts  tel.ts  vcard.ts
```

`wifi` は **003 より前からある種類**なので、ビルダーが作られたことがなく、
画面（`generate-screen.tsx` の `buildPayload`）が直接組み立てている:

```ts
case 'wifi': {
  const ssid = parseNonEmptyText(state.ssid)
  return ssid.ok
    ? { ok: true, value: {
        kind: 'wifi', ssid: ssid.value,
        auth: state.password.length === 0
          ? { kind: 'nopass' }
          : { kind: 'wpa', password: state.password },
        hidden: state.hidden,
      } }
    : { ok: false, error: { field: 'ネットワーク名', reason: 'ネットワーク名を入力してください' } }
}
```

**対応方針（この計画で行う）**: `features/generate/core/payload/wifi.ts` を
**新しく作り**、他の 6 本と同じ形（`WifiInput` を受け取り `Result` を返す）に
そろえる。そのうえで**ツールと画面の両方がそれを呼ぶ**ようにする。
検証を 2 箇所に持たないため。振る舞いは変えない
（`ssid` が空なら失敗、パスワードが空なら `nopass`）。

`features/generate/ui/webmcp-tools.ts` は同じ feature の中なので、
**相対パス（`../core/payload/email.ts`）で import してよい**。
`generate-screen.tsx` が既にそうしている。`package.json` の
`exports` に `./core` を足す必要は**無い**。

### エラー文言はどこにあるか

**`core/` には無い。** 画面側（`generate-screen.tsx` の `buildPayload`）が
`{ field, reason }` の形でその場で書いている。

```ts
reason: '国番号から始まる電話番号を入力してください（例: +819012345678）'
reason: '正しいメールアドレスを入力してください'
```

**このツールは自分の文言を持つこと。** 画面のものを共有しない。
画面は人に向けて「入力してください」、ツールはエージェントに向けて
「指定してください」と書くのが自然で、register が違う。
共有すると、どちらかに引きずられて両方が不自然になる。

### 守るべきリポジトリの決まり（`CLAUDE.md` から。実行者は読んでいない前提）

- **`any` / `as` / `!` / `class` / `enum` を書かない**（`as const` は許可）。
- **ドメイン層で `throw` しない。** 失敗は `Result<T, E>`。
- **`switch` は全メンバーを明示する。** oxlint の
  `typescript/switch-exhaustiveness-check` が error で、`default` では満たせない。
  `bun run check` は lint を含む
- **実装より先に失敗するテストを書く**（red → green）。
- コメントは日本語、識別子は英語。

## Commands you will need

| 目的           | コマンド                                             | 成功時  |
| -------------- | ---------------------------------------------------- | ------- |
| 依存           | `bun install`                                        | exit 0  |
| 型検査         | `bun run typecheck`                                  | exit 0  |
| テスト（絞る） | `bun test features/generate/ui/webmcp-tools.test.ts` | 全 pass |
| テスト（全体） | `bun run test`                                       | 全 pass |
| 一式           | `bun run check`                                      | exit 0  |
| e2e            | `bun run e2e`                                        | 全 pass |

## Scope

**In scope**:

- `features/generate/ui/webmcp-tools.ts`
- `features/generate/ui/webmcp-tools.test.ts`
- `features/generate/core/payload/wifi.ts`（**新規**。上の ⚠ を参照）
- `features/generate/core/payload/wifi.test.ts`（**新規**）
- `features/generate/ui/generate-screen.tsx` — **`buildPayload` の `wifi` の case だけ**。
  新しいビルダーを呼ぶ形に置き換える。**他の case・入力欄・フォームには触らない**
- `features/generate/ui/generate-screen.test.tsx`（既存テストが通り続けること）
- `e2e/tests/webmcp.spec.ts`
- `docs/adr/0010-webmcp.md`（公開範囲の記述を実態に合わせる）

**Out of scope**（触らない）:

- `features/generate/core/payload/` の**既存 7 本** — 変えない。そのまま呼ぶ
  （新規に `wifi.ts` を足すのだけが例外）
- `features/generate/ui/generate-screen.tsx` の **`wifi` 以外**の部分 —
  入力欄・他の case・レイアウトには触らない
- `features/generate/contract/**` — 種類を増やさない
- `features/scan/**`、`shared/webmcp/**` — 読み取りツールと登録層は完成している
- `features/generate/package.json` — `./core` の公開は**不要**（同じ feature 内）

## 入力スキーマの形

**種類ごとに入れ子のオブジェクトにすること。** 平らに並べると `body`
（email と sms）、`subject`（email と event）、`tel` / `email` / `url`
（vcard と最上位）が衝突して、エージェントがどれに入れるか判断できなくなる。

```jsonc
{
  "kind": "vcard", // PAYLOAD_KINDS から作った enum。省略時は text/url を自動判別
  "text": "…", // kind が text / url のとき（既存の挙動をそのまま残す）
  "email": { "to": "…", "subject": "…", "body": "…" },
  "tel": { "number": "+819012345678" },
  "sms": { "number": "…", "body": "…" },
  "geo": { "lat": "35.681", "lon": "139.767" },
  "event": { "subject": "…", "start": "2026-10-01T13:00", "end": "…", "location": "…" },
  "vcard": { "name": "…", "organization": "…", "tel": "…", "email": "…", "url": "…" },
  "wifi": { "ssid": "…", "password": "…", "hidden": false },
  "symbology": "qr",
  "includeSvg": false,
}
```

`kind` の `enum` と各説明は **`PAYLOAD_KINDS` / `PAYLOAD_META` から組み立てる**。
直書きすると、種類が増えても schema が追随しない（plans/001 で符号側に
同じ方針を入れてある。それに倣うこと）。

**`kind` を省略したときの挙動は変えない**（`text` を URL として読めれば `url`、
読めなければ `text`）。既存の呼び出し方が壊れないようにする。

## Git workflow

- ブランチ: `feat/webmcp-payload-kinds`
- Conventional Commits。例: `feat(webmcp): 名刺をツールから作れるようにする`
- **push や PR 作成は行わない。**

## Steps

### Step 1: 1 種類目（`tel`）で往復を通す（red → green）

いきなり 7 種類やらない。**`tel` だけで schema → 検証 → エラー文言 →
テストの往復を 1 周させてから**展開する。

1. `inputSchema` に `kind`（`PAYLOAD_KINDS` 由来の enum）と `tel` オブジェクトを足す
2. `kind === 'tel'` のとき `buildTelPayload` を呼ぶ
3. 失敗したときのエージェント向け文言を書く
4. 既存の「`kind` 省略時は自動判別」が壊れていないことをテストで確かめる

**Verify**: `bun test features/generate/ui/webmcp-tools.test.ts` → 全 pass。
`bun run check` → exit 0。

### Step 2: 残り 6 種類（`email` / `sms` / `geo` / `event` / `vcard` / `wifi`）

**1 種類ごとにコミットし、その都度 Step 1 の検証を通すこと。**

`wifi` を最後にする。**`wifi` だけは先にビルダーを作る**（上の ⚠）。
画面側の `wifi` の case もそのビルダーを呼ぶ形に置き換え、
`generate-screen.test.tsx` の既存テストが通り続けることを確認すること。

パスワードを含むので、説明文に
「このコードを読み取った人はパスワードを知ることになる」旨を書き添えること
（画面の `PAYLOAD_META.wifi.description` と同じ趣旨）。

### Step 3: 互換性の判定が効いていることを確かめる

`isPayloadCompatible` は既に呼ばれている。**新しい種類でも効くこと**を
テストで固定する。たとえば `kind: 'vcard'` に `symbology: 'ean13'` を
指定したら、`render` を呼ばずに理由を返すこと。

**Verify**: そのテストが pass。

### Step 4: e2e

`e2e/tests/webmcp.spec.ts` に 1 本足す。偽の `document.modelContext` 経由で
`generate-code` を `kind: 'vcard'` で実行し、結果に生成できた旨が入ること。

既存の書き方に合わせること（固定待ちを使わず `await expect(...)` の自動待ちだけ）。

**Verify**: `bun run e2e` → 全 pass。

### Step 5: ADR を実態に合わせる

`docs/adr/0010-webmcp.md` に「生成ツールが受け付ける内容は url / text だけ」
という趣旨の記述があれば、9 種類すべてに直す。

**Verify**: `bun run check` → exit 0。

## Test plan

| 内容                     | 期待                                                                |
| ------------------------ | ------------------------------------------------------------------- |
| 種類ごとの正常系（7 件） | 対応するビルダーが呼ばれ、`render` に渡る `payload.kind` が正しい   |
| 種類ごとの異常系（7 件） | 不正な入力で **`render` を呼ばず**、日本語の理由を返す              |
| `kind` 省略（2 件）      | URL なら `url`、それ以外は `text`（**既存の挙動が変わっていない**） |
| 知らない `kind`          | 例外を投げず、理由を返す                                            |
| 互換性（1 件）           | `vcard` × `ean13` は `render` を呼ばずに拒否                        |

手本は同ファイルの既存テスト。`render` は偽物を渡して呼び出しを記録する形。

**すべて red → green の順で書くこと。**

## Done criteria

- [ ] `bun run check` が exit 0
- [ ] `bun run test` が exit 0
- [ ] `bun run e2e` が exit 0
- [ ] `grep -c "PAYLOAD_KINDS" features/generate/ui/webmcp-tools.ts` が **1 以上**
      （enum を直書きしていない証拠）
- [ ] `inputSchema` に 7 種類ぶんの入れ子オブジェクトがある
- [ ] `kind` を省略したときの自動判別が残っている（テストで確認）
- [ ] `features/generate/core/payload/` の**既存 7 本**が変更されていない
      （`git diff --name-only` に `wifi.ts` 以外の `core/payload/` が出ない）
- [ ] `generate-screen.tsx` の差分が **`wifi` の case だけ**である
- [ ] In scope 以外のファイルが変更されていない
- [ ] `plans/README.md` の 008 の行が DONE

## STOP conditions

止めて報告すること:

- Drift check で「Current state」の引用と実際のコードが食い違っている。
- **既存の**ビルダー（`core/payload/` の 7 本）を変えないと呼べない。**範囲外**。
  新規の `wifi.ts` を足すのは範囲内。
- `generate-screen.tsx` の **`wifi` の case 以外**を触りたくなった。範囲外。
- `wifi` のビルダーを作ると画面の既存テストが落ち、振る舞いを変えないと直せない。
- `kind` 省略時の既存の挙動を変えないと実装できない。
- 検証コマンドが、妥当な修正を 1 回試しても 2 回連続で失敗する。

## Maintenance notes

- **ツールは画面を動かさない**（plans/001 からの方針）。計算して結果を返すだけ。
  画面のフォームを埋める形にするなら `GenerateScreen` の状態リフトアップが要る。
  それは別の作業
- エラー文言をツールと画面で**わざと分けている**。人向けとエージェント向けで
  register が違うため。片方に寄せたくなったら、両方の読み手を考えること
- 種類が増えたら、このツールの `inputSchema` にも入れ子を 1 つ足すことになる。
  `kind` の enum 自体は `PAYLOAD_KINDS` 由来なので自動で増えるが、
  **入力フィールドは自動では増えない**。ここは手で足す前提
