# noter の worktree 固有事項

共通の規約は `rimltools-worktree`。

## 共有ファイル（noter）

| ファイル | 規約 |
| --- | --- |
| `.markuplintrc.json` / `tsconfig.json`（apps/noter 直下） | `chore/devops` のみ（lint / fmt の設定はルートの `.oxlintrc.json` / `.oxfmtrc.json` に一本化済み） |
| `services/web/wrangler.jsonc`（binding の追加） | `feat/web-shell` のみ。他レーンは plan に「要 binding」と書いて依頼 |
| `services/web/migrations/` | 番号は `feat/auth`=0001、`feat/documents`=0002〜。他レーンは追加しない |

## レーンのマージ順（noter）

```
feat/contracts
  → feat/design-system, feat/web-shell, feat/sync, feat/formats
    → feat/auth
      → feat/documents, feat/editor
        → feat/webmcp, feat/e2e
chore/devops は随時
```

- **rebase を使う。merge commit を作らない。**
- 依存レーンが main に入ったら、その日のうちに `bun run wt sync` する。
  溜めるほど競合の解決コストが上がる。

エージェントに渡す資料には `docs/realtime-protocol.md`（同期に触る場合）を加える。
