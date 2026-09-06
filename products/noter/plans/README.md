# 実装計画

`/improve plan` で書いた計画の索引。各計画は**単体で読めば実行できる**ように書いてある
（executor は会話の文脈を持たない前提）。テンプレートは qrcc の `.claude/skills/improve/references/plan-template.md`。

**Planned at**: `b110c53`（2026-09-06）。設計文書（`docs/**`, `DESIGN.md`）が仕様の正で、計画はそれを手順に落としたもの。
矛盾を見つけたら計画側を直すのではなく STOP して advisor に返す。

## 実行順序と依存

```
001 scaffold ──┬── 002 sync DO + /ws ──┐
               ├── 003 auth ───────────┼── 004 documents ── 005 editor ──┐
               └── 006 formats(core) ──┘                    006 formats(ui) ┼── 007 webmcp/pwa/deploy ── 008 a11y/e2e
```

- 001 は単独で先に終わらせる（全計画の前提）
- 002 / 003 / 006(core) は並行できる
- 004 は 002 と 003 の両方をマージしてから
- 005 は 004 の後。006 の UI 差し込みは 005 の後
- 007 は 005 と 006 の後。008 は最後

レーンとの対応は `docs/parallel-lanes.md` / `scripts/lanes.tsv`。

## 状態

| #   | 計画                                                                                   | 優先 | 規模 | 依存     | 状態                                    |
| --- | -------------------------------------------------------------------------------------- | ---- | ---- | -------- | --------------------------------------- |
| 001 | [足場・ツールチェーン・contract・ui・shell](001-scaffold-tooling-contract-ui-shell.md) | P1   | L    | —        | DONE（`e3b67ac`）                       |
| 002 | [DocumentRoom DO と /ws 配線](002-sync-durable-object-and-ws-entry.md)                 | P1   | L    | 001      | DONE（`b7f1cb6`）                       |
| 003 | [Better Auth（ゲスト + Google）](003-auth-guest-and-google.md)                         | P1   | M    | 001      | DONE（`7596f5b`）                       |
| 004 | [文書・共有リンク・本認可](004-documents-sharing-and-authorization.md)                 | P1   | L    | 002, 003 | DONE（`aa66ae6`）                       |
| 005 | [エディタ画面](005-editor-codemirror-presence-status.md)                               | P1   | L    | 004      | DONE（`b40863a`）                       |
| 006 | [フォーマット層](006-formats-parse-diagnose-preview.md)                                | P1   | L    | 001, 005 | DONE（006a `4532ff1` / 006b `f6a8c1a`） |
| 007 | [WebMCP・PWA・Deploy・smoke](007-webmcp-pwa-deploy-smoke.md)                           | P2   | M    | 005, 006 | DONE（`b026d17`）                       |
| 008 | [AAA 監査・e2e・ハードニング](008-a11y-pass-e2e-and-hardening.md)                      | P2   | M    | 007      | DONE（`eec322b`）                       |

状態: `TODO` / `IN PROGRESS` / `DONE` / `BLOCKED(理由)` / `STALE`。
executor は完了時にこの表の自分の行だけを書き換える（reviewer が索引を管理すると言った場合は触らない）。

## 検討して見送ったもの

- **Rust / wasm バックエンド**: DO は V8 上で動き Yjs は JS。1 文書 1 DO のシングルスレッドで並行性の問題が無い（ADR-0001）
- **R2 / KV**: 従量課金の経路になる（ADR-0009）。画像アップロードは v1 でやらない
- **RSC**: TanStack Start の RSC は実験段階。エディタは全面クライアント描画なので利点が薄い（ADR-0008）
- **サーバ側 `Awareness` クラス**: `setInterval` が hibernation を妨げる（ADR-0003）
- **`SYNC_INTERNAL_TOKEN` + DO → web の内部ルートで touch**: 同じ D1 を `noter-sync` にも binding すれば不要（ADR-0005）
- **保存失敗のクライアント通知**: v1 では検出しない。損失窓 5 秒はクライアント再送で埋まる（ADR-0005）
- **Origin Trial トークン（WebMCP）**: 期限つきで静かに失効する。登録しない（ADR-0012）
- **`/new` をページとして持つ**: server function の redirect で足りる（plan 004）
- **`Breadcrumbs` の置き場**: `@noter/auth` が `@noter/shell` に依存し shell の `root.route` が auth に依存する双方向。公開サブパス経由なので ADR-0007 の範囲内だが、plan 008 で `shared/ui` へ移す候補（plan 003 レビュー）
- **happy-dom の `Node.prototype.nodeName` shim**: happy-dom が `nodeName` を空で返し DOMPurify が全消しするため `features/formats/ui/happy-dom-node-name.test-setup.ts` に置いた。plan 008（devops）で `shared/ui/test-setup.ts` に移す候補（plan 006a レビュー）
- **`core/` の配置の統一**: `features/sync` は `core/src/`、`features/auth` と `features/formats` は `core/*.ts` フラット。`noter-architecture` スキルは `core/src/` 前提で書かれている。plan 008 でどちらかに寄せてスキルの記述を合わせる（plan 006a レビュー）
- **server function の `.validator((input: X) => input)`**: 型注釈だけの素通しで実行時の形は検証していない。`parse*` を通す形に直す（plan 008 ハードニング、plan 004 レビュー）
- **失効・除外・削除の Undo トースト（ux.md §4.4）**: v1 は確認 2 段階で AAA 3.3.6 を満たす。リンク復活・再招待 API が無いため Undo は別 plan（plan 004 executor NOTE 4）
- **`/s/:token` の share_link 読み取り 2 回**: route の `resolveShareLink` と `join` 内の再検証。書き込みではないので許容（plan 004 レビュー）
- **`role="toolbar"`（DESIGN.md §4.2）**: 矢印キーの roving tabindex を実装しない限り名乗らない。v1 は `<fieldset>` + 視覚的に隠した `<legend>` でグループ化（plan 005 executor NOTE 5）
- **名前プロンプトの表示条件**: 自分で作った文書では出さず、共有リンクで参加したゲストだけ（ux.md §6.1「開いた瞬間に書ける」優先、plan 005）
- **CodeMirror が server bundle に入る**: `ssr: 'data-only'` でもルートモジュール経由で `editor.route-*.js` が server 側に入る（plan 007 時点で 2.07 MB、gzip はもっと小さい）。`React.lazy` で `CodeEditor` を切り出しても Rolldown が「そこでしか使われない」と判断して route チャンクに巻き戻すため**効果ゼロ**だった（plan 007 で計測・revert）。free tier の 3 MiB gzip には余裕がある。次に試すなら `ssr: false` の別ルートに分けるか `build.rollupOptions.output.manualChunks`（plan 008 以降、急がない）
- **⋯ メニューの「複製」「ショートカット一覧」**: 複製は server function が無い、一覧は仕様が無い。v1 では置かない（plan 005）
- **「変換して新規作成」の本文の受け渡し**: `create` に初期本文の引数が無いので `sessionStorage`（`noter-initial-body:<id>`）に預け、接続後に `ytext` が空なら 1 回だけ挿入する。サーバ側に初期本文を持たせるなら plan 008 以降で（plan 006b）
- **整形の本文置換は `EditorHandle.replaceAll`（CodeMirror トランザクション）経由**: `ytext` を直接書くと y-codemirror.next の `ySyncAnnotation` を通らず undo とリモートカーソルが崩れる（plan 006b）
- **Service Worker のキャッシュ対象**: plan 007 の原案は「`/` をプリキャッシュ、`/ws/ /api/ /d/ /s/` 以外を stale-while-revalidate」だったが、(1) TanStack の server function は `GET /_serverFn/…` を使うものがあり、キャッシュすると「共有リンクを失効させたのに一覧から消えない」（e2e `share.spec.ts` が 8 本落ちて発覚）、(2) `/` の HTML はサインイン中の人の文書名を含むので、共有端末で次の人に見える。**`/_serverFn/` も除外し、HTML（`mode: navigate`）はキャッシュしない**。プリキャッシュは `/icon.svg` のみ（plan 007 executor NOTE 1・2）
- **本番 smoke で Google ボタンを見ない**: 資格情報は本番にしか無く手元で再現できない。`docs/deployment.md` の手動確認に載せた（plan 007）
- **ハイドレーションの判定は `__reactFiber$*` の有無**: トップは素の `<form method="post">` で JS なしでも文書を作れるため、「ボタンが押せる」は証拠にならない（plan 007 `e2e/smoke/production.spec.ts`）
- **アカウント削除 UI**: 文書の扱い（所有権・メンバー）を決めてから。v1 では置かない（plan 003）
- **`MAX_MEMBERS` 超過や日次上限の e2e**: 再現手段が無い。ユニットで UI を固定する（plan 008）
- **server function 入力の実行時検証は 2 段構え**: `.validator()` には `parse*Input`（`features/documents/contract/wire.ts`）を通すが、返すのは**生の入力**（`validated(input, parsed)`）。Branded 型は TanStack のシリアライズを越えて残らないため、handler 側でもう一度 `parse*` して失敗は `err(NOT_FOUND)` にする。同じ理由で不正な role 文字列は `forbidden` ではなく `not_found` になる（UI からは到達しない、plan 008）
- **`dangerouslySetInnerHTML` は 2 箇所**: plan 006 の想定は `markdown-preview.tsx` の 1 箇所だったが、`root-document.tsx` の `themeInitScript`（静的な文字列定数、ユーザー入力を含まない）も使っている。両方許容し、grep の期待値を 2 に読み替える（plan 008 Step 4）
- **削除は `/kick` を呼ばない**: `service.remove` は soft delete のみ。`features/documents/server/service.ts` のコメントは「再接続で `4404`」と書くが、実際は web の `/ws` ゲートが HTTP 404 を返して WS が 1006 で閉じ、クライアントは**`reconnecting` のまま**（`rejected(not_found)` にならない）。e2e は「B の再読み込みが 404 画面」だけを固定した。直すなら、ゲートの 404 を `4404` の close に変えるか、削除時に `/kick` を呼ぶ（フォローアップ、`features/sync` レーン）
- **オフライン復帰後のピル**: `setOffline(false)` の後、入力は同期されるがピルが「再接続中…」に残ることがある。`features/sync/client/src/state-machine.ts` の遷移の問題で plan 008 のスコープ外。e2e は「A に B の入力が現れる」で固定し、ピルの文言は見ない（フォローアップ）
- **上限バナー（`limit-banner.tsx`）はユニットのみ**: `rejected(limit)` / `rejected(too_large)` を e2e で作る手段が無い。閉じたことは `sessionStorage`（`noter-limit-banner:<id>`）に覚え、ライブリージョンにはしない（`section aria-labelledby`）。書き出しボタンへは `#noter-export` で飛ぶ（plan 008）
- **WS を落とす e2e は `page.routeWebSocket`**: `page.route` は WebSocket のハンドシェイクを捕まえられない（plan 008）
- **スクリーンリーダーの手動確認（VoiceOver / NVDA）は未実施**: 自動化できないため `docs/accessibility.md` §3 に残した。ユーザーが手元で一巡する（plan 008）
