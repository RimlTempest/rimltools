# テレメトリ計装（OpenTelemetry / Grafana Faro）

メトリクス・ログ・トレースを Grafana Cloud（LGTM）で相関させるための、送る側の仕様。
Grafana 側（データソース・ダッシュボード・アラート・オンコール）の設定は `infra/grafana/` を参照。

## なぜ自前で送るのか

Workers には OTLP の自動エクスポート（`observability.traces.destinations`）があるが、
**Workers Paid 限定**で Free では使えない。RimlTools は Free に留まるので（`docs/platform.md`）、
Worker 自身が OTLP/HTTP **JSON** を組み立てて Grafana Cloud の OTLP gateway に送る。

OpenTelemetry JS SDK（`@opentelemetry/sdk-trace-*`）は使わない。CPU（Free は 1 リクエスト 10 ms）と
バンドルが重く、Workers では非同期コンテキストの扱いも合わない。`@rimltools/telemetry` は
OTLP の JSON 表現を直接書く数百行の実装で、依存は無い（ブラウザ側の Faro を除く）。

Paid に移ったら、Worker 側は標準のエクスポートに切り替え、`instrument()` の送信部分を外す。

## 構成

| 場所                                       | 何を送るか                                                | 送り先                                                 |
| ------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------ |
| `qrcc-web` / `noter-web`（`instrument()`） | リクエストごとの root span（SERVER）、子 span、構造化ログ | OTLP gateway `/v1/traces`・`/v1/logs` → Tempo・Loki    |
| `qrcc-web` → `qrcc-api`（`traced()`）      | CLIENT span と `traceparent` の付与                       | 同上                                                   |
| `noter-web` → `noter-sync`（`traced()`）   | WebSocket を DO に渡す CLIENT span と `traceparent`       | 同上                                                   |
| `qrcc-api`（Rust）                         | 受け取った `trace_id` 付きの 1 行ログ                     | Workers Logs                                           |
| ブラウザ（Faro）                           | Web Vitals、JS エラー、fetch、document load               | Faro collector → Loki / Tempo / Frontend Observability |

```
browser ──traceparent──▶ *-web (root span) ──traceparent──▶ qrcc-api / noter-sync
   │                          │ ctx.waitUntil
   └─ Faro collector          └─ OTLP gateway (/v1/traces, /v1/logs)
```

- HTML 応答では、Worker が `<head>` に 2 つの meta を足す（HTMLRewriter、ストリーミングのまま）。
  - `rimltools-telemetry`: Faro の設定（公開値だけ）
  - `traceparent`: document load の span を server span の子にする（OTel の慣例）
- ブラウザは、同一オリジンの fetch に `traceparent` を付ける（Faro tracing）。
  server function の呼び出しがブラウザの span から Worker の span まで 1 本の trace になる。

## 設定（リリースレーンとの契約）

| 名前                          | 種類       | 既定                      | 内容                                                                                   |
| ----------------------------- | ---------- | ------------------------- | -------------------------------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | var        | 空（無効）                | 例: `https://otlp-gateway-prod-ap-northeast-0.grafana.net/otlp`。https 以外は拒否      |
| `OTEL_EXPORTER_OTLP_HEADERS`  | **secret** | —                         | `Authorization=Basic%20<base64(instanceId:token)>`（`k=v,k=v`、値は percent-encoding） |
| `OTEL_SERVICE_NAME`           | var        | wrangler.jsonc に固定     | Worker 名（`qrcc-web` など）                                                           |
| `OTEL_TRACES_SAMPLER_ARG`     | var        | `0.1`                     | head sampling の確率                                                                   |
| `OTEL_SLOW_MS`                | var        | `1000`                    | これ以上かかったリクエストは必ず送る                                                   |
| `DEPLOYMENT_ENV`              | var        | `production`              | `production` / `staging` / `preview`                                                   |
| `GIT_SHA`                     | var        | —                         | `service.version`                                                                      |
| `FARO_URL`                    | var        | 空（無効）                | Faro collector の URL（公開値）                                                        |
| `FARO_SAMPLE_RATE`            | var        | `0.2`                     | ブラウザのセッションのサンプリング率                                                   |
| `CF_VERSION_METADATA`         | binding    | wrangler.jsonc で宣言済み | `cloudflare.worker.version_id`（段階リリースの版と突き合わせる）                       |

- wrangler.jsonc には **空の値だけ**を置いている。本番・staging の値はリリースで入れる
  （段階リリースでは `wrangler versions upload --var`、secret は `wrangler versions secret put`。
  `wrangler secret put` は新しい版を即 100% にするので使わない）。
- 値が無い・空なら **完全に何もしない**（ローカル・テスト・未設定の環境）。
  設定が壊れていれば 1 回だけ `telemetry disabled: ...` をログに出して無効になる。

## 相関のための約束（Grafana 側と共有）

| 種類                      | キー                                                                                                    | 値                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| resource                  | `service.name`                                                                                          | Worker 名（`qrcc-web` / `noter-web`）                      |
| resource                  | `service.namespace`                                                                                     | `rimltools`                                                |
| resource                  | `service.version`                                                                                       | git SHA                                                    |
| resource                  | `deployment.environment.name`                                                                           | `production` / `staging` / `preview`                       |
| resource                  | `cloudflare.worker.version_id`                                                                          | Workers の version id                                      |
| resource                  | `cloud.provider` / `cloud.platform`                                                                     | `cloudflare` / `cloudflare_workers`                        |
| span                      | `http.request.method` `http.route` `http.response.status_code` `url.path` `url.scheme` `server.address` | HTTP semantic conventions。`http.route` は明示したときだけ |
| span                      | `cloudflare.colo`                                                                                       | 処理したデータセンター                                     |
| span                      | `sampling.reason`                                                                                       | `parent` / `head` / `error` / `slow`（下記）               |
| span                      | `sampling.ratio`                                                                                        | head で選ばれたときの確率                                  |
| span event                | `exception`（`exception.type` `exception.message` `exception.stacktrace`）                              | 例外                                                       |
| OTLP log                  | `traceId` / `spanId`                                                                                    | Loki では構造化メタデータになる                            |
| Workers Logs（JSON 1 行） | `trace_id` / `span_id` / `level` / `message`                                                            | `log()` と qrcc-api の Rust 側で共通                       |
| Faro                      | `app.name` / `app.namespace` / `app.environment` / `app.version`                                        | ツール名 / `rimltools` / 環境 / git SHA                    |

span 名は `<METHOD> <route>`。route を渡さなければ、ID らしいパス部分を `:id` に伏せる
（`/documents/doc_01J9…` → `/documents/:id`）。系列数（カーディナリティ）を Grafana Cloud Free の
上限内に保つため。

## サンプリング

1. **head**: 上流の `traceparent` が sampled ならそれに従う（`parent`）。無ければ確率
   `OTEL_TRACES_SAMPLER_ARG` で決める（`head`）。下流に渡す `traceparent` の sampled フラグはこの結果。
2. **tail**: 応答のあとに決め直す。**5xx・例外（`error`）と、`OTEL_SLOW_MS` 以上（`slow`）は必ず送る。**

> **p99 などの分布を span から計算するときは `sampling.reason` が `head` か `parent` の span だけを使う。**
> tail で拾った span は遅いものと壊れたものに偏るので、全部を混ぜると p99 が実際より悪く見える。
> 偏りの無いレイテンシ・エラー率は、Cloudflare の GraphQL Analytics（全リクエストの集計）か、
> head の span だけから作る。

ブラウザは、セッションのサンプリング（`FARO_SAMPLE_RATE`）を **SDK を読み込む前に**決める。
外れたセッションでは Faro をダウンロードしない。

## 個人情報

- `url.path` にクエリ文字列を載せない（共有リンクのトークンなどを送らない）。
- Faro は送信前に、URL らしき文字列すべてからクエリとハッシュを落とす（`redactUrls`）。
- Faro の console 収集は無効。入力値は送らない。
- User-Agent や IP は span に載せない。

## 計測値

`bun packages/telemetry/bench.ts`（Bun / JavaScriptCore。Workers の V8 とは一致しないが桁は分かる）。

| 経路                                | 1 リクエストあたりの追加 CPU |
| ----------------------------------- | ---------------------------- |
| endpoint 未設定（no-op）            | 約 0.1 µs                    |
| endpoint 設定・送らない             | 約 1.3 µs                    |
| 送る（子 span 1 つ、JSON 生成まで） | 約 6.4 µs                    |

目標（送らない場合 < 0.2 ms、送る場合 < 1 ms）より 2 桁小さい。Free の 10 ms に対して無視できる。

| バンドル                                                        | 増分（gzip）                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `@rimltools/telemetry/worker` 単体                              | 3.9 KB                                                                   |
| qrcc-web のサーバ JS                                            | +6.3 KB（669 KB → 676 KB）                                               |
| noter-web のサーバ JS                                           | +4.1 KB（2,456 KB → 2,461 KB。Free の上限 3 MB に対して余裕は約 0.5 MB） |
| 初期表示のクライアントチャンク（qrcc）                          | +157 B（遅延 import の呼び出しだけ）                                     |
| Faro 本体（遅延読み込み、サンプリングに当たったセッションだけ） | 約 66 KB                                                                 |

SSR のバンドルには Faro を入れない（`import.meta.env.SSR` で除外）。

## 無料枠への影響

- **Workers のリクエスト数（100k/日）には数えられない。** 送信は Worker の中の subrequest で、
  新しい Worker 呼び出しではない。
- **subrequest**: 送る 1 リクエストあたり最大 2（traces と、ログがあれば logs）。Free の上限は
  1 リクエスト 50 で、既存の処理（D1・service binding）と合わせても十分に余る。
- **Grafana Cloud Free**（traces 50 GB / logs 50 GB / 月）: 上限の 100k リクエスト/日で、head 10% と
  エラー・遅延を合わせて 1 日 1.2 万 trace 程度、1 trace あたり 2〜3 span・約 1 KB とすると、
  月に 1 GB 未満。
- **Workers Logs（200k 件/日）**: `log()` の行と、qrcc-api が trace_id 付きで出す 1 行
  （テレメトリ有効時、qrcc-api の呼び出しごと）が増える。qrcc-api の呼び出しは qrcc-web の
  リクエスト数以下なので、上限の半分を超えない。
- Faro のセッション数の上限は、Grafana Cloud Free の Frontend Observability の上限に従う
  （`infra/grafana` 側で上限と `FARO_SAMPLE_RATE` を合わせる）。

## 注意点

- Workers の `Date.now()` は **I/O の間だけ進む**（Spectre 対策）。span の長さは I/O 待ちの時間で、
  CPU だけの処理は 0 ms に見える。CPU 時間は GraphQL Analytics の `cpuTime` で見る。
- root span は **応答ヘッダを返した時点**で閉じる。ストリーミングする本文の送信時間は含まない。
- WebSocket（`/ws/:documentId`）の root span は 101 を返すまで。接続中のメッセージは対象外。

## 今後の課題

- qrcc-api（Rust）と noter-sync（Durable Object）でも span を作って送る。いまは trace_id 付きの
  ログ（qrcc-api）だけ。
- ログを Loki に送る条件を「trace を送るとき」から広げるかどうか（今は trace と同じ判定）。
- Workers Paid に移ったら、標準の OTLP エクスポートに切り替える。
