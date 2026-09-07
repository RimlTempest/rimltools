# ADR-0011: デザイントークンを riml-ds から取る

- 状態: Accepted
- 日付: 2026-09-07
- 関連: [ADR-0007](0007-feature-colocation.md)

## 文脈

qrcc と noter で同じ判断（AAA のコントラスト、44px の対象、3px のフォーカスリング、oklch のトークン）を
2 か所で保守していた。共通部分を別リポジトリ **riml-ds**（`@rimltempest/riml-ds-*`、DTCG トークン +
Web Components + 各フレームワークのラッパー）に集め、アプリはそれを使う側になる。

## 決定

1. トークンの正は riml-ds の `@rimltempest/riml-ds-tokens`。qrcc のブランド色は riml-ds の `themes/qrcc`
   （palette の差し替え）として riml-ds 側に置く。
2. 段階的に移す（riml-ds `docs/migration.md`）。段階 1（この ADR）はトークンだけ: `--qrcc-*` を `--rd-*` の
   別名にし、アプリの CSS は触らない。以後の新しい CSS は `--rd-*` を直接使う。
3. riml-ds が npm に公開されるまで、`vendor/riml-ds/*.tgz` を `file:` 依存で取り込む
   （`scripts/vendor-riml-ds.sh`）。公開後は `shared/ui/package.json` をバージョン指定に変え、`vendor/` と
   スクリプトを消す。
4. 段階 1 で riml-ds に寄せなかったもの（`shared/ui/src/styles/tokens.test.ts` の `KEPT_LOCAL`）:
   `--qrcc-radius-lg`（1.5rem。入れ子の角丸）、`--qrcc-measure`（70ch）、`--qrcc-text-base/lg/xl/2xl`
   （riml-ds の見出しは 2 段・本文は流動。部品を置き換える段階 3 で寄せる）。

## 受け入れた視覚差分

すべて AAA を満たす側への変化。

| トークン                        | 旧（light / dark）    | 新（light / dark）          | 理由                                                    |
| ------------------------------- | --------------------- | --------------------------- | ------------------------------------------------------- |
| `--qrcc-border`                 | 0.72 / 0.48           | 0.6 / 0.6                   | 旧ライト値は白地に 2.48:1 で 1.4.11 の 3:1 を割っていた |
| `--qrcc-border-strong`          | 0.55 / 0.66           | 0.415 / 0.79                | riml-ds は text-muted と同じ素材を使う                  |
| `--qrcc-text`                   | 0.2 / 0.955           | 0.24 / 1.0                  | palette の共有（16:1 以上のまま）                       |
| `--qrcc-surface-sunken`（dark） | 0.14                  | 0.18                        | 面と同じ素材                                            |
| `--qrcc-surface-hover`（light） | 0.93                  | 0.945                       | sunken と同じ素材                                       |
| `--qrcc-focus-ring`             | 彩度 0.2 / 0.16       | accent と同じ               |                                                         |
| `--qrcc-font-sans`              | 'Yu Gothic UI' を含む | 'Segoe UI', 'Roboto' を含む | システムフォント。macOS / iOS では同じ                  |

## 影響

- `bun install` は `vendor/riml-ds/*.tgz` を読む。tgz を更新したら frozen 無しの `bun install` で `bun.lock` も更新する
- `shared/ui/src/styles/tokens.test.ts` が「tokens.css に色のリテラルが無い」「参照する `--rd-*` が実在する」
  「生の値は `KEPT_LOCAL` だけ」を固定する。`--qrcc-*` を足すことはもうしない
- 段階 2（riml-ds の reset / base に切り替え）、段階 3（`rd-button` などの部品）は別 plan
