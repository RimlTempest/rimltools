# ドメインモデル

型は `shared/contract/src/` に置き、TS と Rust の両方がこの定義に従う。
「不正な状態を表現できない」ことを最優先する。

## 1. エンティティ

```
User ──┬── Folder ──┐
       │            ├── Code ──┬── ShareLink
       └── ScanEntry            └── PrintPreset
```

| エンティティ  | 説明                                     | 所有            |
| ------------- | ---------------------------------------- | --------------- |
| `User`        | Google または匿名（ゲスト）ユーザー      | —               |
| `Folder`      | コードの入れ物。ネスト 1 段まで（YAGNI） | User            |
| `Code`        | 保存された QR / バーコード 1 件          | User (+ Folder) |
| `ShareLink`   | 閲覧/編集用の共有トークン                | Code            |
| `ScanEntry`   | 読み取り履歴                             | User            |
| `PrintPreset` | ラベル台紙 + 面付け設定                  | User            |

## 2. 識別子（Branded）

実装は `shared/contract/src/id.ts`。

```ts
export type UserId = Brand<string, 'UserId'> // usr_ + 24 文字
export type CodeId = Brand<string, 'CodeId'> // cd_  + 24 文字
export type FolderId = Brand<string, 'FolderId'> // fld_ + 24 文字
export type ShareToken = Brand<string, 'ShareToken'> // 32 文字（接頭辞なし）
export type SpecHash = Brand<string, 'SpecHash'> // 生成仕様の SHA-256（64 桁小文字16進）
```

- 本体は **Crockford base32**（`0-9` `a-z` から `i` `l` `o` `u` を除いた 32 文字）。
  読み上げても取り違えにくく、大文字小文字の揺れも起きない。
  ID は 120 bit、ShareToken は 160 bit の乱数。
- **接頭辞で種類を実行時にも判別する。** `parseUserId('cd_…')` は失敗する。
  型（Branded）とデータ（接頭辞）の両方で取り違えを止める。
- 生成は必ずパース関数を通す（`as` 禁止のため唯一の生成手段であり、
  同時にエンコーダの健全性チェックになる）。
- **乱数は引数で受け取る**（`RandomBytes`）。この層に I/O はなく、
  `crypto.getRandomValues` の注入は composition root の仕事。

## 3. `Code`

```ts
export type Code = {
  readonly id: CodeId
  readonly ownerId: UserId
  readonly folderId: FolderId | undefined
  readonly name: NonEmptyText
  readonly payload: CodePayload
  readonly symbology: Symbology
  readonly style: RenderStyle
  readonly visibility: Visibility
  readonly tags: readonly Tag[]
  readonly createdAt: Date
  readonly updatedAt: Date
}
```

`payload` と `symbology` は独立に持つ。「Wi-Fi 設定を DataMatrix で」も表現できる。
組み合わせの妥当性は `validateCombination(payload, symbology): Result<void, …>` が判定する
（型で全組み合わせを禁止すると爆発するため、ここだけは実行時検証）。

## 4. `CodePayload`（判別可能ユニオン）

エンコードされる内容。**種類ごとに構造が違う**ので union で持つ。

```ts
export type CodePayload =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'url'; readonly url: HttpUrl }
  | {
      readonly kind: 'email'
      readonly to: EmailAddress
      readonly subject: string
      readonly body: string
    }
  | { readonly kind: 'tel'; readonly number: PhoneNumber }
  | { readonly kind: 'sms'; readonly number: PhoneNumber; readonly body: string }
  | {
      readonly kind: 'wifi'
      readonly ssid: NonEmptyText
      readonly auth: WifiAuth
      readonly hidden: boolean
    }
  | { readonly kind: 'vcard'; readonly card: VCard }
  | { readonly kind: 'geo'; readonly lat: Latitude; readonly lon: Longitude }
  | { readonly kind: 'event'; readonly event: CalendarEvent }
  | { readonly kind: 'gs1'; readonly elements: readonly Gs1Element[] }
  | { readonly kind: 'raw'; readonly bytes: Uint8Array }
```

各 kind は `encode(payload): Result<EncodedData, PayloadError>` を持ち、
`features/generate/core/payload/<kind>.ts` に 1 ファイルずつ実装する。
レジストリは Mapped Type なので**追加漏れがコンパイルエラーになる**。

**実装状況**（`features/generate/contract/payload.ts` の `PAYLOAD_KINDS`）:

| kind                                                | 状態     | 備考                                                                                                        |
| --------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `text` / `url` / `wifi`                             | 実装済み | 最初から実装されていた 3 種類                                                                               |
| `tel` / `email` / `sms` / `geo` / `event` / `vcard` | 実装済み | plans/003 で追加。`features/generate/core/payload/*.ts`                                                     |
| `gs1`                                               | 未実装   | 読み取り側の解釈（`features/scan/core/interpret/gs1.ts`）と対で設計すべき（plans/005 の Maintenance notes） |
| `raw`                                               | 未実装   | バイト列の扱いが別問題                                                                                      |

追加した 6 種類の実際の形（`VCard` / `CalendarEvent` / `Latitude` / `Longitude` は
このドキュメントでは未定義だったため、実装時に決めた）:

```ts
/** 検証は features/generate/core/payload/geo.ts。範囲は -90..=90 / -180..=180。 */
export type Latitude = Brand<number, 'Latitude'>
export type Longitude = Brand<number, 'Longitude'>

/**
 * `<input type="datetime-local">` の値そのまま（`YYYY-MM-DDTHH:mm`）。
 * タイムゾーンを持たない「その場の時刻」として扱う。
 */
export type CalendarTimestamp = Brand<string, 'CalendarTimestamp'>

export type CalendarEvent = {
  readonly subject: NonEmptyText
  readonly start: CalendarTimestamp
  readonly end: CalendarTimestamp
  readonly location: string
}

/** 既定では MeCard 形式で符号化する（日本の携帯・スマホで最も通りが良いため）。 */
export type VCard = {
  readonly name: NonEmptyText
  readonly organization: string
  readonly tel: PhoneNumber | undefined
  readonly email: EmailAddress | undefined
  readonly url: HttpUrl | undefined
}
```

`tel` / `sms` の電話番号、`vcard` の任意項目（組織・電話・メール・URL）の
正規化とフォーム入力からの組み立ては `features/generate/core/payload/phone.ts`
（`tel` と `sms` で共有）と各 `<kind>.ts` に閉じている。Rust 側の対応する型は
`features/generate/engine/src/payload.rs`（`Latitude` / `Longitude` は
`serde(try_from = "f64")`、`CalendarTimestamp` は `serde(try_from = "String")`
で境界を検証する）。

### 4.1 読み取り側の解釈（`Interpretation`）

`CodePayload` は生成側（`features/generate`）の型。読み取り側は
`Detection.text`（生の文字列。`features/scan/contract/decode.ts`）を入力に
`interpret(text): Interpretation` という別の判別可能ユニオンへ変換する
（`features/scan/contract/interpretation.ts`）。

形式ごとの解釈ロジックは `features/scan/core/interpret/<kind>.ts` に
1 ファイルずつあり、`interpret()`（`features/scan/core/interpret/index.ts`）
が順に試して最初に一致したものを返す。どれにも当てはまらなければ
`{ kind: 'plain' }` になる。GS1 だけは `elements: readonly Gs1Element[]`
という、この `CodePayload` の `gs1` と同じ語彙を使う。

**`CodePayload` と `Interpretation` はあえて型を共有しない。**
生成側と読み取り側が同時に改修されるレーンが分かれていること、
読み取りは「壊れた入力でも常に何か返す」ことを崩さないための緩さが要ること
（`throw` しない、未対応の値は `unknown`/`plain` に落ちる）が理由。
両方が落ち着いたら、`MECARD:` などの形式文字列を 1 箇所に寄せることを
検討する（`plans/005-scan-content-interpretation.md` の Maintenance notes）。

## 5. `Symbology`（判別可能ユニオン）

シンボル体系と、その体系固有の設定。**細かく設定できる**ことが要件なので、
各体系が持てるパラメータをすべて型に出す。

```ts
export type Symbology =
  // 2D
  | {
      kind: 'qr'
      ec: 'L' | 'M' | 'Q' | 'H'
      version: 'auto' | QrVersion
      mask: 'auto' | QrMask
      encoding: QrEncoding
      eci: EciCode | undefined
      structuredAppend: boolean
    }
  | { kind: 'micro_qr'; ec: 'L' | 'M' | 'Q'; version: 'auto' | MicroQrVersion }
  | { kind: 'rmqr'; ec: 'M' | 'H'; size: RmqrSize }
  | {
      kind: 'data_matrix'
      shape: 'square' | 'rectangle'
      size: 'auto' | DataMatrixSize
      gs1: boolean
    }
  | { kind: 'aztec'; ecPercent: AztecEcPercent; layers: 'auto' | AztecLayers; rune: boolean }
  | {
      kind: 'pdf417'
      columns: 'auto' | Pdf417Columns
      rows: 'auto' | Pdf417Rows
      ec: Pdf417Ec
      compact: boolean
    }
  // 1D
  | { kind: 'code128'; charset: 'auto' | 'a' | 'b' | 'c'; gs1: boolean }
  | { kind: 'code39'; checkDigit: boolean; fullAscii: boolean }
  | { kind: 'code93'; fullAscii: boolean }
  | { kind: 'itf'; checkDigit: boolean; bearerBars: BearerBarStyle }
  | { kind: 'codabar'; startStop: CodabarStartStop; checkDigit: boolean }
  | {
      kind: 'ean13' | 'ean8' | 'upca' | 'upce'
      addOn: AddOn2 | AddOn5 | undefined
      quietZoneIndicator: boolean
    }
```

- `'auto'` を明示的な union メンバーにして、「未指定」を `undefined` で表さない。
- `micro_qr` が EC レベル `H` を取れないことなど、**仕様上の制約を型に出す**。
- 1D 系のヒューマンリーダブル表示（下部の文字）は `RenderStyle` 側に持つ
  （見た目の関心事なので symbology から分離）。

## 6. `RenderStyle`

```ts
export type RenderStyle = {
  readonly foreground: Paint
  readonly background: Paint // 'transparent' も Paint のメンバー
  readonly quietZone: ModuleCount // 静寂域（モジュール数）。既定は仕様値
  readonly moduleShape: ModuleShape // square | dot | rounded | classy
  readonly eyeShape: EyeShape | undefined // 2D のみ
  readonly logo: LogoOverlay | undefined // 2D のみ。EC レベルとの整合を検証
  readonly humanReadable: HumanReadable | undefined // 1D のみ
  readonly scale: PositiveInt // 1 モジュールあたりの px
  readonly rotation: 0 | 90 | 180 | 270
}

export type Paint =
  | { readonly kind: 'solid'; readonly color: Color }
  | {
      readonly kind: 'linear-gradient'
      readonly stops: readonly ColorStop[]
      readonly angle: Degrees
    }
  | { readonly kind: 'radial-gradient'; readonly stops: readonly ColorStop[] }
  | { readonly kind: 'transparent' }
```

**コントラスト検証**: `foreground` と `background` の輝度比が読み取り可能な
閾値（3:1 以上、推奨 7:1）を下回る場合、保存前に警告を返す。
これは装飾の自由と読み取り成功率のトレードオフをユーザーに明示するため。

`logo` を置くと誤り訂正が消費されるため、
`validateLogo(symbology, logo): Result<void, LogoError>` が EC レベルと被覆率から
可否を判定し、必要な EC レベルを提案する。

## 7. `Visibility` と共有

```ts
export type Visibility =
  | { readonly kind: 'private' }
  | { readonly kind: 'unlisted'; readonly token: ShareToken; readonly expiresAt: Date | undefined }
  | { readonly kind: 'public' }

export type SharePermission = 'view' | 'edit'
```

- ゲスト（匿名）ユーザーも共有リンクを作れる。ただし有効期限は必須（既定 30 日）。
- `edit` 共有はログイン済みユーザーのみが作成できる。
- 共有リンクの解決は D1 の 1 行読み取り（`share_link_code_idx`）。
  キャッシュは置かない（[ADR-0009](adr/0009-stay-on-workers-free.md)）。

## 8. 印刷 / ラベル

```ts
export type PrintPreset = {
  readonly sheet: LabelSheet // 台紙の物理寸法
  readonly items: readonly PrintItem[] // どのコードをどのセルに置くか
  readonly showCaption: boolean
  readonly captionSource: 'name' | 'payload' | 'custom'
}

export type LabelSheet = {
  readonly id: LabelSheetId // 例: 'a4-24-70x33.9'
  readonly page: { readonly width: Millimeter; readonly height: Millimeter }
  readonly margin: Edges<Millimeter>
  readonly cell: { readonly width: Millimeter; readonly height: Millimeter }
  readonly gap: { readonly x: Millimeter; readonly y: Millimeter }
  readonly columns: PositiveInt
  readonly rows: PositiveInt
}
```

台紙定義はデータ。新しい型番の追加は `features/print/core/sheets/` に
1 ファイル足すだけで、面付けアルゴリズムは触らない。

## 9. 永続化（D1 スキーマ方針）

- テーブルは正規化しすぎない。`symbology` / `style` / `payload` は
  **JSON 1 列**に格納し、検索対象の列（`kind`, `name`, `updated_at`, `folder_id`,
  `owner_id`）だけを実列に出す。無料枠の row read を節約するため。
- JSON は読み出し時に必ずパース関数を通す（スキーマ変更に強くする）。
- マイグレーションは `services/api/migrations/NNNN_*.sql` に連番で追加。ロールバックは書かない
  （D1 は前方移行のみ運用）。

## 10. 不変条件

| 不変条件                               | 強制方法                                    |
| -------------------------------------- | ------------------------------------------- |
| `CodeId` は他 ID と取り違えられない    | Branded type                                |
| `micro_qr` に EC `H` は存在しない      | union のメンバー定義                        |
| symbology を足したら描画実装も必ずある | Mapped Type レジストリ / Rust の match 網羅 |
| 匿名ユーザーの共有リンクは必ず期限付き | `Visibility` 生成関数が `Result` で拒否     |
| ロゴ被覆率が EC レベルを超えない       | `validateLogo`                              |
| 前景/背景のコントラストが読み取り可能  | `validateContrast`（警告付きで保存は許可）  |
