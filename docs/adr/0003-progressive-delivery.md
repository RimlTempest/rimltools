# ADR-0003: Workers の versions で段階リリースする

- 状態: 採用（2026-09-22）

## 決定

本番デプロイは `wrangler deploy` を使わず、次の段階を踏む（`scripts/release/` と reusable workflow）。

1. **build** — 1 度だけビルドし、成果物に来歴（attestation）を付ける
2. **migrate** — D1 に expand 系の migration だけを適用する（contract は注記付きで別リリース）
3. **upload** — `wrangler versions upload`（message にコミット SHA、tag に run id）。この時点では誰にも届かない
4. **blue/green 検証** — 新版を 0% で deployment に加え、`Cloudflare-Workers-Version-Overrides` を付けて本番ドメインで smoke
5. **canary** — 10% → 50% → 100%。各段で `bake` 分待ち、GraphQL Analytics で `scriptVersion` 別のエラー率を比較
6. **判定** — 新版のエラー率が「旧版 + 1pt」か「2%」を超えたら、旧版 100% に戻して失敗させる
7. **finalize** — 100% 後にもう一度 smoke。Release に版 ID を記録する

- 同じ利用者を同じ版に固定するため、Transform Rule で `Cloudflare-Workers-Version-Key` に匿名 ID の cookie を入れる（無い場合は `ip.src`）。
  静的アセットのハッシュ名がずれる version skew を防ぐ。
- service binding の組（qrcc-web → qrcc-api）は **下流から** 出す（api を 100% にしてから web）。上流の新版は下流の旧版とも動かなければならない。
- Durable Object（noter-sync）は、オブジェクトごとに同時 1 版しか動かない。DO クラスの migration を含む版は canary を飛ばして 100% で出す（`release.mode: big-bang`）。
- 自動ロールバック先は「直前に 100% だった版」。手動は `bun run release:rollback <tool>`（runbook 参照）。

## 無料枠との関係

- versions upload / deploy は Worker のリクエストを消費しない。canary 中の smoke と synthetic は数十リクエスト程度。
- GraphQL Analytics API は Free で使える。待ち時間は GitHub Actions の実行時間を使う（public リポジトリは無制限）。
- 少トラフィック時は判定に必要なサンプル（既定 200 リクエスト）に届かない。その場合は synthetic で補い、それでも足りなければ「判定不能 = 合格」とせず **bake 時間を延長して再判定**、上限に達したら人の判断を仰ぐ（workflow が止まり、`workflow_dispatch` で promote / rollback を選ぶ）。
