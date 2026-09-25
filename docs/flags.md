# feature flag の使い方

ダークローンチ・機能単位のカナリア・A/B テスト・kill switch を、デプロイと切り離して行う仕組み。
設計の背景は `docs/adr/0004-feature-flags.md`。

## しくみ

```
flags/<tool>.json（正本・PR でレビュー）
   │  .github/workflows/flags.yml
   └─ main へ push    → production の D1 `feature_flags`
                            │  Cache API に 60 秒
                            ▼
              Worker 内の @rimltools/flags が評価
```

- 変更は **PR で `flags/<tool>.json` を直すだけ**。コードのデプロイは要らない。
- 反映までの遅延は最大で Cache API の TTL（既定 60 秒）。
- D1 に同期する行は flag の数だけ。変わっていない flag は書き込まない（rows written を消費しない）。

## flag の書き方

```jsonc
// flags/noter.json
{
  "$schema": "./schema.json",
  "tool": "noter",
  "flags": [
    {
      "key": "new-editor", // kebab-case
      "description": "新しいエディタ UI",
      "type": "boolean", // boolean | string | number | object
      "enabled": true, // false にすると常に defaultVariant（kill switch）
      "variants": { "on": true, "off": false },
      "defaultVariant": "off", // 無効時・対象外のときに返す。必ず安全側にする
      "rules": [], // 属性で出し分け（上から順、最初に一致したもの）
      "rollout": { "percentage": 10, "variant": "on" }, // 対象者の 10% に on
    },
  ],
  "remove": [], // D1 から消す flag。書かなければ JSON から消しても D1 に残る
}
```

評価の順序: `enabled` → `rules` → `rollout` → `distribution` → `defaultVariant`。
振り分けは `(flag key, targetingKey)` の一貫ハッシュなので、同じ人は同じ結果になる。
`targetingKey`（サインイン済みなら user id、未サインインなら匿名 cookie）が無いときは `defaultVariant`。

検証: `bun scripts/flags/cli.ts validate`（PR の CI でも走る）。

## 戦略ごとの手順

### ダークローンチ（本人だけに見せる）

```json
{
  "key": "new-editor",
  "description": "新しいエディタ UI",
  "type": "boolean",
  "enabled": true,
  "variants": { "on": true, "off": false },
  "defaultVariant": "off",
  "rules": [
    {
      "when": [{ "attribute": "userId", "op": "in", "value": ["<自分の user id>"] }],
      "variant": "on"
    }
  ]
}
```

コードを本番に出したまま、自分だけが新機能を触れる。条件の演算子は `eq` / `in` / `startsWith`
（例: `{ "attribute": "email", "op": "startsWith", "value": "dev+" }`）。

版ごと隠したいとき（コードそのものを出す前に本番で試す）は、flag ではなく段階リリースの
**0% デプロイ + `Cloudflare-Workers-Version-Overrides` ヘッダ**を使う（ADR-0003）。

### 機能単位のカナリア

`rollout.percentage` を PR で `1 → 10 → 50 → 100` と上げる。上げても既に on の人は on のまま
（下げない限り誰も戻らない）。問題が出たら `enabled: false`（下記 kill switch）。

100% で安定したら、次のリリースでコードから flag の分岐を消し、`flags` から削除して `remove` に key を入れる。

### A/B テスト

```json
{
  "key": "cta-copy",
  "description": "保存ボタンの文言",
  "type": "string",
  "enabled": true,
  "variants": { "control": "保存", "treatment": "残しておく" },
  "defaultVariant": "control",
  "distribution": { "control": 50, "treatment": 50 },
  "experiment": "cta-2026-10"
}
```

- `distribution` の重みは合計 100。`rollout` と併用すると、rollout に入った人だけが実験に参加する
  （例: `rollout: { "percentage": 20 }` + 50/50 → 全体の 10% ずつ）。
- `experiment` がある flag は、評価のたびに露出ログを出す（下記）。

### kill switch（緊急停止）

GitHub → Actions → **Flags** → Run workflow:

| 入力        | 値                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------- |
| action      | `kill`                                                                                         |
| environment | `production`（main ブランチを選んで実行する。production environment は main 以外から使えない） |
| tool / flag | 例: `noter` / `new-editor`                                                                     |

D1 の該当 flag の `enabled` を即座に false にする（正本の検証が落ちていても動く）。
最大 60 秒で全エッジに効く。**その後、必ず `flags/<tool>.json` の `enabled` を false にする PR を出す**
（出さないと次の同期で元に戻る）。

## Worker への組み込み

依存: `"@rimltools/flags": "workspace:*"`。D1 の binding は各プロダクトの既存のもの（`DB`）を使う。

### そのまま使う（依存が最小）

```ts
import { createD1FlagStore, createFlagClient } from '@rimltools/flags'

// composition root（リクエストごとでよい。キャッシュは Cache API 側にある）
const flags = createFlagClient({
  tool: 'noter',
  store: createD1FlagStore({
    db: env.DB,
    cache: caches.default,
    tool: 'noter',
    ttlSeconds: 60,
    log: (entry) => console.log(JSON.stringify(entry)),
  }),
  log: (entry) => console.log(JSON.stringify(entry)),
})

const { value: newEditor } = await flags.boolean('new-editor', false, {
  targetingKey: session?.userId ?? anonymousId,
  userId: session?.userId,
})
```

失敗（D1 障害・flag が無い・型が違う）しても例外は投げず、第 2 引数の既定値を返す。

### OpenFeature から使う

```ts
import { OpenFeature } from '@openfeature/server-sdk'
import { createD1FlagProvider } from '@rimltools/flags/openfeature'

await OpenFeature.setProviderAndWait(
  createD1FlagProvider({ db: env.DB, cache: caches.default, tool: 'noter' }),
)
const client = OpenFeature.getClient()
await client.getBooleanValue('new-editor', false, { targetingKey: userId })
```

`@openfeature/server-sdk` は `node:async_hooks` / `events` を使うので、Worker に
`nodejs_compat` が要る（qrcc / noter は有効）。SDK を使わなくても Provider は同じ評価器を使う。

### クライアント（ブラウザ）へ渡す

評価はサーバー（SSR / server function）で行い、結果の値だけを loader でページに渡す。
flag の定義（ルールや対象者）はブラウザに出さない。

## 露出ログと集計

`experiment` のある flag を評価すると、Workers Logs に 1 行出る:

```json
{
  "event": "flag_exposure",
  "tool": "noter",
  "flag": "cta-copy",
  "variant": "treatment",
  "experiment": "cta-2026-10"
}
```

- Workers Logs は Free で 20 万件/日・3 日保持。**全評価を出すのは調査時だけ**（`exposure: 'all'`）。
  既定は `experiments`（A/B の flag だけ）、`none` で止められる。
- 集計: ダッシュボードの Workers → Observability → Query で
  `event = "flag_exposure" AND experiment = "cta-2026-10"` を `variant` ごとに count。
  成果（例: 保存の成功）も同じく構造化ログで出し、variant ごとの比率を比べる。
- 3 日で消えるので、実験の結果は終了時に Issue へ転記する。

## 無料枠への影響

| 項目             | 消費                                       |
| ---------------- | ------------------------------------------ |
| D1 rows read     | TTL（60 秒）ごと・エッジごとに flag 数ぶん |
| D1 rows written  | 同期で変わった flag の数だけ               |
| Workers Logs     | A/B の露出 1 評価につき 1 件               |
| Workers requests | 増えない（Worker 内で評価する）            |
