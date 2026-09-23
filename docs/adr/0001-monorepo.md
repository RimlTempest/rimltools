# ADR-0001: RimlTools を 1 つの monorepo にする

- 状態: 採用（2026-09-22）

## 背景

qrcc2 と noter2 は同じスタック・同じ規約（bun workspaces / TanStack Start / Workers Free / oxlint / lefthook）
で別々に育ち、設定と CI の二重管理が増えていた。ツールは今後も増える。

## 決定

- `RimlTempest/rimltools`（public）に統合し、各ツールを `products/<tool>/` に置く。
  履歴は `git filter-repo --to-subdirectory-filter` で全コミットを保った。
- bun の workspace ルートはリポジトリ直下に 1 つ（lockfile も 1 つ）。`products/*` 自体も workspace member にし、
  プロダクト直下で `bun install` / `bun run` してもルートの lockfile を使うようにする。
- lint / fmt / markuplint / tsconfig / bunfig の `[test]` は当面プロダクトごと。hooks は lefthook の `root:` でプロダクト単位に走らせる。
- プロダクト同士は互いの内部を import しない。共有物はルートの `packages/<name>`。
- ツールの台帳は `tools.json`。CI・Terraform・監視・ポータルはこれを読む。

## 結果

- 旧リポジトリは archive（読み取り専用）。Issue・PR は移していない。
- 各プロダクト内の ADR 番号（`products/<tool>/docs/adr/`）はそのまま残る。ルートの ADR はプロダクト横断の決定だけを書く。

## 追記（2026-09-22）: ディレクトリ名の変更

上の「決定」は統合時点の名前のまま残す。わかりにくいという理由で、次のとおり改名した。

| 旧                                   | 新                               |
| ------------------------------------ | -------------------------------- |
| `products/<tool>/`                   | `apps/<tool>/`                   |
| `products/<tool>/apps/<worker>/`     | `apps/<tool>/services/<worker>/` |
| `observability/`（ダッシュボード等） | `ops/`                           |
| `scripts/observability/`             | `scripts/ops/`                   |
| `tools.json` の `workers`            | `tools.json` の `services`       |

Worker 名・パッケージ名（`@qrcc/web` など）・Cloudflare 上のリソース名は変えていない。
