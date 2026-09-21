# RimlTools

小さな Web ツール群の monorepo。Cloudflare Workers（Free プラン）で動かす。

| ツール                                               | URL                      | ソース                             |
| ---------------------------------------------------- | ------------------------ | ---------------------------------- |
| qrcc — QR・バーコードの生成 / 読み取り / 管理 / 印刷 | https://qrcc.riml4i.com  | [`products/qrcc`](products/qrcc)   |
| noter — リアルタイム共同編集エディタ                 | https://noter.riml4i.com | [`products/noter`](products/noter) |

```bash
mise install && bun install
bun run check && bun run test
```

履歴: `RimlTempest/qrcc2` と `RimlTempest/noter2` を、全コミット履歴を保ったまま
`products/` 以下に統合した（git filter-repo --to-subdirectory-filter）。
