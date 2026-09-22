# riml-ds への改善提案

rimltools で riml-ds 0.3.0 に追従したときに見つかった点。riml-ds のリポジトリに持ち込むためのメモで、
このリポジトリからは riml-ds に変更を加えていない。方針は [ADR-0013](adr/0013-riml-ds-adoption.md)。

## 1. 公開パッケージに `workspace:*` が残っている（最優先）

npm に公開された次のパッケージの `peerDependencies` に、monorepo の中でしか意味を持たない `workspace:*` が残っている。

| パッケージ         | 版            | peerDependencies                                           | 結果                              |
| ------------------ | ------------- | ---------------------------------------------------------- | --------------------------------- |
| `riml-ds-react`    | 0.2.0 / 0.3.0 | `"@rimltempest/riml-ds-elements": "workspace:*"`           | **入らない**                      |
| `riml-ds-elements` | 0.2.0 / 0.3.0 | `"@rimltempest/riml-ds-tokens": "workspace:*"`             | **入らない**                      |
| `riml-ds-css`      | 0.2.0 / 0.3.0 | `"@rimltempest/riml-ds-tokens": "workspace:*"`（optional） | 入る（optional なので無視される） |

bun 1.4 での再現（`riml-ds-react` と `riml-ds-elements` の 0.3.0 を入れる）:

```
error: Workspace dependency "@rimltempest/riml-ds-elements" not found
```

npm でも `workspace:` プロトコルは解決できないので、どのパッケージマネージャからも入らない。
このため rimltools は部品（`RdButton` など）を使えず、トークンと CSS だけを使っている。

提案:

- 公開のときに `workspace:` を実際の版に書き換える道具で publish する（`bun publish` / `pnpm publish` は書き換える。
  `npm publish` は書き換えない）。peer は `workspace:^` にしておくと、書き換え後が `^0.3.0` になって扱いやすい。
- CI に「`npm pack` した tarball の package.json に `workspace:` が含まれていたら失敗」の検査を足す。
- 直した版を出したら、rimltools は ADR-0013 の段階 4（部品の置き換え）に進める。

## 2. 来歴（provenance）付きで公開する

0.2.0 / 0.3.0 は npm の provenance 無しで公開されている（riml-ds の docs に「初回の手動公開は `--provenance=false`」とある）。
GitHub Actions からの trusted publishing（OIDC）で `--provenance` 付きにすると、利用側は
「このパッケージは riml-ds リポジトリのこのコミットからビルドされた」ことを検証できる。

rimltools は `bunfig.toml` の `minimumReleaseAge`（公開 7 日待ち）から riml-ds を例外にしている（自分のパッケージなので待つ理由が無い）。
その代わりの安全策として、provenance があると、npm アカウントが乗っ取られた場合の偽の版を見分けられる。

## 3. 無効なボタンのコントラスト（AAA 1.4.1）

qrcc の ADR-0012「riml-ds から意図的に外したところ」:
riml-ds の無効なボタンは `color: GrayText; background: transparent`（色の変化だけ）。qrcc は WCAG AAA 1.4.1（色だけに頼らない）のため、
形（輪郭・取り消し線など）でも無効を示している。`rd-button` に同等の表現が入ると、qrcc の `Button` をそのまま置き換えられる。

## 4. 参考: 0.3.0 の tokens / css は 0.2.0 と同じ中身

npm の `riml-ds-tokens` / `riml-ds-css` の 0.3.0 は、0.2.0 と中身が同じ（CSS 先頭の版コメントだけ違う）。
0.3.0 の CHANGELOG に書かれたトークンと CSS の変更は、0.2.0 の tarball に既に入っていた。
CHANGELOG と公開物がずれて見えるので、次の版の CHANGELOG で補足があると利用側が迷わない。

## 5. `.rd-skip-link`: 対象サイズと、地と区別する枠（AAA 2.5.5 / 1.4.11）

padding（`space-2` / `space-3`）と 1 行の高さだけだと、高さが約 42px で 44px に届かない。現れたときの枠も無く、
地（`surface-default`）と同じ面なので、どこからがリンクかが見分けにくい。rimltools の `SkipLink` は
`min-block-size` / `min-inline-size: var(--rd-sizing-target-min)` と `border`（`border-strong`）を持っているので、置き換えていない。

提案: `min-block-size` / `min-inline-size` に `--rd-sizing-target-min`、`border` に `--rd-color-border-strong` を足す。

## 6. `.rd-visually-hidden`: 中にフォーカスが入っても隠れたまま（2.4.7）

`:not(:focus, :active)` なので、要素自身がフォーカスを受けたときにしか現れない。隠した要素の中にリンクやボタンがあると、
フォーカスが見えない位置に入る。rimltools の `VisuallyHidden` は `:not(:focus):not(:focus-within)` なので、置き換えていない。

提案: `:not(:focus, :focus-within)` にする（`:active` は押している間だけなので、キーボードでは効かない）。

## 7. ナビの対象サイズ（AAA 2.5.5）と `.rd-nav-menu` の置き場所

- `.rd-breadcrumb a` は `padding-block: space-1` だけで、高さが 44px に届かない。ナビの中のリンクは
  2.5.5 の例外（文中のリンク）に当たらない。
- `.rd-nav-menu a` は `min-block-size` だけで幅の下限が無い。1 文字の項目では 44x44 を割る。
- `.rd-nav-menu` は自前の地と下罫を持つ「ページの帯」で、ヘッダの中でブランド名と並べると罫が二重になる。
  また brand.md §4 は「ナビの項目はピル」としていて、上の角だけ丸めたタブの `.rd-nav-menu` と食い違って見える。

rimltools の `Breadcrumbs` / `GlobalNav` は 44x44 を満たしているので、置き換えていない。

提案: `.rd-breadcrumb a` と `.rd-nav-menu a` に `min-block-size` / `min-inline-size: var(--rd-sizing-target-min)`。
`.rd-nav-menu` は帯の地と罫を modifier（例: `.rd-nav-menu[data-band]`）に分け、ピルとタブのどちらを正にするかを brand.md と揃える。

## 8. reset: class を付けたリストの行頭記号

`reset.css` には `ul` / `ol` の扱いが無い。ナビや一覧のような class 付きのリストは、部品の側で毎回 `list-style: none` と
字下げの打ち消しを書くことになる。rimltools は reset の後に次の 1 規則を足している（本文中の箇条書きは既定のまま残る）:

```css
:where(ul, ol):where([class]) {
  padding-inline-start: 0;
  list-style: none;
}
```

また `* { margin: 0 }` はフォーム部品（ラジオ・チェックボックス）の既定の外側の余白も消すので、ラベルとの間が詰まる。
意図どおりなら、その旨を reset のコメントに書いておくと利用側が迷わない。
