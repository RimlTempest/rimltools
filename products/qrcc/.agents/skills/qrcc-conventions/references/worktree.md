# qrcc の worktree 固有事項

共通の規約は `rimltools-worktree`。

## 共有ファイル（qrcc）

| ファイル | 規約 |
| --- | --- |
| `Cargo.lock` | 競合時は `cargo update -w && git add Cargo.lock` |
| products/qrcc の `Cargo.toml` | `feat/shared-kernel`（Rust 共有プリミティブのレーン）のみが編集する |
| `.oxlintrc.json` / `tsconfig.json`（products/qrcc 直下） | `chore/devops` のみ |

## レーンのマージ順（qrcc）

正本は `products/qrcc/scripts/lanes.tsv`。統合前の skill に書かれていた順序（`feat/contracts` → `feat/rust-core` …）は lanes.tsv と食い違っていたので、lanes.tsv に合わせた。

```
feat/shared-contract
  → feat/shared-kernel, feat/shared-ui
    → feat/shell, feat/api-worker, feat/riml-ds-tokens
      → feat/generate（kernel と ui の後）, feat/auth（shell の後）, feat/mado-ui
        → feat/scan, feat/print, feat/wasm-bridge, feat/manage（auth と generate の後）, feat/mado-screens
          → feat/share-view, feat/manage-polish, feat/mado-controls
chore/devops は随時
```
