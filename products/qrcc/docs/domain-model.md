# ドメインモデル

型は `packages/contracts/src/` に置き、TS と Rust の両方がこの定義に従う。
「不正な状態を表現できない」ことを最優先する。

## 1. エンティティ

```
User ──┬── Folder ──┐
       │            ├── Code ──┬── ShareLink
       └── ScanEntry            └── RenderArtifact (R2)
                                └── PrintPreset
```

| エンティティ     | 説明                                     | 所有                 |
| ---------------- | ---------------------------------------- | -------------------- |
| `User`           | Google または匿名（ゲスト）ユーザー      | —                    |
| `Folder`         | コードの入れ物。ネスト 1 段まで（YAGNI） | User                 |
| `Code`           | 保存された QR / バーコード 1 件          | User (+ Folder)      |
| `ShareLink`      | 閲覧/編集用の共有トークン                | Code                 |
| `ScanEntry`      | 読み取り履歴                             | User                 |
| `PrintPreset`    | ラベル台紙 + 面付け設定                  | User                 |
| `RenderArtifact` | R2 上の生成済み成果物（キャッシュ）      | Code（仕様ハッシュ） |

## 2. 識別子（Branded）

```ts
export type UserId = Brand<string, 'UserId'> // usr_…
export type CodeId = Brand<string, 'CodeId'> // cd_…
export type FolderId = Brand<string, 'FolderId'> // fld_…
export type ShareToken = Brand<string, 'ShareToken'> // 32 文字の URL-safe 乱数
export type SpecHash = Brand<string, 'SpecHash'> // 生成仕様の SHA-256（R2 キー）
```

生成は必ずパース関数経由（`as` 禁止）。詳細は
`.claude/skills/qrcc-typescript/references/type-patterns.md`。

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
`packages/core/src/payload/<kind>.ts` に 1 ファイルずつ実装する。
レジストリは Mapped Type なので**追加漏れがコンパイルエラーになる**。

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
- 共有リンクの解決は KV キャッシュ（TTL 60s）→ D1 の順。

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

台紙定義はデータ。新しい型番の追加は `packages/core/src/print/sheets/` に
1 ファイル足すだけで、面付けアルゴリズムは触らない。

## 9. 永続化（D1 スキーマ方針）

- テーブルは正規化しすぎない。`symbology` / `style` / `payload` は
  **JSON 1 列**に格納し、検索対象の列（`kind`, `name`, `updated_at`, `folder_id`,
  `owner_id`）だけを実列に出す。無料枠の row read を節約するため。
- JSON は読み出し時に必ずパース関数を通す（スキーマ変更に強くする）。
- マイグレーションは `apps/api/migrations/NNNN_*.sql` に連番で追加。ロールバックは書かない
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
