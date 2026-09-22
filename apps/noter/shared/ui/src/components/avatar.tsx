type AvatarProps = {
  /** 隣に必ず可視の名前を置くこと。色とイニシャルだけで人を識別させない。 */
  readonly name: string
  /** `--noter-presence-0` 〜 `--noter-presence-7` の番号。 */
  readonly colorIndex: number
}

/** 先頭の 1 文字。サロゲートペアを割らないようコードポイントで取る。 */
const initialOf = (name: string): string => {
  const code = name.trim().codePointAt(0)
  return code === undefined ? '?' : String.fromCodePoint(code)
}

/**
 * 参加者を表す小さな丸（`DESIGN.md` §4.1）。
 *
 * **装飾として扱う。** 読み上げは隣に置く名前が担当するので `aria-hidden`。
 * 色は情報を持たない（同じ人を追いやすくするためだけの手掛かり）。
 */
export const Avatar = ({ name, colorIndex }: AvatarProps) => (
  <span className="noter-avatar" data-presence={colorIndex} aria-hidden="true">
    {initialOf(name)}
  </span>
)
