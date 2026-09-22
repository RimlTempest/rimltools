/**
 * JavaScript のソースをリポジトリに置かない（規約: TS だけで書く。rimltools-typescript）。
 * 追跡中のファイルに .js / .mjs / .cjs / .jsx があれば列挙する。
 * 生成物（Service Worker の public/sw.js など）はコミットしないので対象にならない。
 */

export type NoJsException = { readonly prefix: string; readonly reason: string }

/** 例外。足すときは理由を書く */
export const NO_JS_EXCEPTIONS: readonly NoJsException[] = [
  {
    prefix: '.agents/skills/',
    reason:
      '外部から取り込んだ skill（skills-lock.json で版を固定した vendored 物）。上流の同梱スクリプトは書き換えない',
  },
]

const JS_SOURCE = /\.(?:js|mjs|cjs|jsx)$/

export const findForbiddenJs = (
  files: readonly string[],
  exceptions: readonly NoJsException[] = NO_JS_EXCEPTIONS,
): string[] =>
  files
    .filter((file) => JS_SOURCE.test(file))
    .filter((file) => !exceptions.some((exception) => file.startsWith(exception.prefix)))
    .toSorted()
