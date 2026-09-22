# state を前の版に戻す（tfstate）

OpenTofu の state（`infra/terraform` / `infra/grafana`）が壊れた・誤って上書きされたときの手順。
state の置き場所は Worker `rimltools-tfstate` の D1 で、**直近 20 版**を残している（`infra/tfstate/README.md`）。
Worker には版の一覧や復元のエンドポイントを作っていない（入口を増やさないため）。wrangler で D1 を直接操作する。

> 復元の前に、進行中の plan / apply が無いことを Actions で確かめる。apply の途中なら終わるのを待つ。

## 1. 版を確かめる

```bash
cd infra/tfstate
# いまの版
bunx wrangler d1 execute rimltools-tfstate --remote --command \
  "SELECT path, version, datetime(updated_at / 1000, 'unixepoch') AS updated FROM states"
# 残っている版（serial は OpenTofu の書き込み回数。lineage が変わっていたら別の state で上書きされている）
bunx wrangler d1 execute rimltools-tfstate --remote --command \
  "SELECT path, version, serial, lineage, size, datetime(created_at / 1000, 'unixepoch') AS created
   FROM state_versions WHERE path = '/states/rimltools-production' ORDER BY version DESC"
```

## 2. ロックを外す（残っていれば）

```bash
bunx wrangler d1 execute rimltools-tfstate --remote --command \
  "SELECT path, lock_id, datetime(expires_at / 1000, 'unixepoch') AS expires FROM locks"
```

CI が落ちてロックが残っているだけなら、1 時間で期限が切れる。すぐ外すなら、書き込み用の資格情報で
`sops exec-env infra/secrets/apply.sops.yaml 'cd infra/terraform && tofu force-unlock -force <lock_id>'`。

## 3. 戻す

いまの版を指す行を、戻したい版に向け直す（本文は消さないので、やり直しもできる）。

```bash
bunx wrangler d1 execute rimltools-tfstate --remote --command \
  "UPDATE states SET version = <戻したい version>, updated_at = unixepoch() * 1000
   WHERE path = '/states/rimltools-production'
     AND EXISTS (SELECT 1 FROM state_versions WHERE path = '/states/rimltools-production' AND version = <戻したい version>)"
```

`changes: 1` になっていることを確かめる（0 ならその版は残っていない）。

## 4. 確かめる

1. PR か Actions → Terraform → Run workflow で plan を出す
2. 実際のリソースと state の差分が、戻した分だけであること。**destroy / replace が出たら apply しない**
3. 差分が妥当なら Release PR で apply する（OpenTofu が新しい版として書き直す）

## 補足

- 次に書き込まれた版は、戻した版の次の番号ではなく「いちばん大きい version + 1」になる（上書きされた版も履歴に残る）
- 20 版より前には戻せない。長く残したい節目（大きな移行の前など）は、手元に暗号化されたまま保存しておく:
  `curl -s -u '<READ_USER>:<READ_PASSWORD>' https://tfstate.tools.riml4i.com/states/rimltools-production > state-backup.json`
  （暗号化されたままなので、パスフレーズが無ければ読めない）

## 5. state を消す（人が行う。Worker は DELETE を受け付けない）

state を本当に消す必要があるとき（ルートごと廃止したときなど）だけ。消すと戻せないので、先に §補足の方法で
暗号化されたままのバックアップを取っておく。

```bash
cd infra/tfstate
bunx wrangler d1 execute rimltools-tfstate --remote --command \
  "DELETE FROM states WHERE path = '/states/<name>';
   DELETE FROM state_versions WHERE path = '/states/<name>';
   DELETE FROM state_chunks WHERE path = '/states/<name>';
   DELETE FROM locks WHERE path = '/states/<name>';"
```

Worker の許可リスト（`infra/tfstate/src/core/paths.ts`）からもそのパスを外す PR を出す。

## 6. 最後の手段: D1 Time Travel

§3 で戻せないとき（残っている 20 版がすべて悪い、表そのものが壊れた、誤って §5 を実行した）は、
D1 の Time Travel で**データベース全体**を過去の時点に戻す。Free プランでも過去 7 日の任意の時点に戻せる。

```bash
cd infra/tfstate
# 戻したい時点のブックマークを得る（UTC の時刻。壊れる前の時点を選ぶ）
bunx wrangler d1 time-travel info rimltools-tfstate --timestamp='2026-09-22T00:00:00Z'
# 戻す（確認を求められる）。以降の書き込みはすべて失われる
bunx wrangler d1 time-travel restore rimltools-tfstate --timestamp='2026-09-22T00:00:00Z'
```

- データベース全体（両方の state・ロック）が戻る。戻した時点より後の plan / apply の結果は state から消えるので、
  §4 の手順で plan を出し、実際のリソースとの差分を確かめてから apply する
- 戻すと、restore の直前の状態を指すブックマークが出力される。やり直したいときはそれで戻せる
- 7 日より前には戻せない。長く残したい節目は §補足の方法で手元に保存する
