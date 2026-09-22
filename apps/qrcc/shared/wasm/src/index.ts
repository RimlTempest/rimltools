/**
 * @qrcc/wasm — ブラウザで動く生成 / 読み取りエンジン（ADR-0003）。
 *
 * 同じ Rust コードが Worker とブラウザの両方で動く。生成と読み取りをブラウザ側で
 * 行えば Workers のリクエスト無料枠を消費せず、読み取りでは画像をサーバに
 * 送らずに済む（docs/free-tier-budget.md / docs/architecture.md）。
 *
 * 入出力は docs/api-contract.md と同じ封筒なので、
 * 呼び出し側はサーバ経路と同じデコーダを使い回せる。
 *
 * **生成用とデコード用の wasm は別チャンク。** デコードは rxing を含むため
 * gzip でも桁が違い、同じバイナリに入れると生成プレビューの体感が落ちる。
 */
import type { Result, RpcDecodeError } from '@qrcc/contract'
import { decodeRpcEnvelope, err } from '@qrcc/contract'

/** 生成用 wasm の公開面。テストでは偽物を渡す。 */
export type WasmModule = {
  readonly render: (requestJson: string) => string
}

/** デコード用 wasm の公開面。画像は base64 にせずバイト列のまま渡す。 */
export type WasmDecoderModule = {
  readonly decode: (image: Uint8Array, hintsJson: string) => string
}

export type WasmUnavailable = {
  readonly kind: 'wasm_unavailable'
  readonly detail: string
}

type Decoder<T> = (value: unknown) => Result<T, { readonly detail: string }>

type Envelope<T, E> = Result<Result<T, E>, RpcDecodeError | WasmUnavailable>

export type WasmRenderer = {
  readonly render: <T, E>(
    request: unknown,
    decodeValue: Decoder<T>,
    decodeError: Decoder<E>,
  ) => Promise<Envelope<T, E>>
}

export type WasmDecoder = {
  readonly decode: <T, E>(
    image: Uint8Array,
    hints: unknown,
    decodeValue: Decoder<T>,
    decodeError: Decoder<E>,
  ) => Promise<Envelope<T, E>>
}

/**
 * 読み込みは 1 度だけ行い、以降は使い回す。
 * 失敗した場合は結果を憶えず、次の呼び出しで再試行する
 * （一時的なネットワーク不調で永久に諦めないため）。
 */
const loadOnce = <T>(load: () => Promise<T>): (() => Promise<T>) => {
  let loaded: Promise<T> | undefined
  return () => {
    if (loaded === undefined) {
      loaded = load().catch((cause: unknown) => {
        loaded = undefined
        throw cause
      })
    }
    return loaded
  }
}

/** wasm が返した封筒の文字列を、呼び出し側の型に変換する。 */
const readEnvelope = <T, E>(
  raw: string,
  decodeValue: Decoder<T>,
  decodeError: Decoder<E>,
): Envelope<T, E> => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (cause) {
    // wasm 側は例外を投げない設計なので、ここに来るのは JSON の破損だけ
    return err({ kind: 'malformed_envelope', detail: String(cause) })
  }
  return decodeRpcEnvelope<T, E>(parsed, decodeValue, decodeError)
}

export const makeWasmRenderer = (loadModule: () => Promise<WasmModule>): WasmRenderer => {
  const moduleOnce = loadOnce(loadModule)

  const render = async <T, E>(
    request: unknown,
    decodeValue: Decoder<T>,
    decodeError: Decoder<E>,
  ): Promise<Envelope<T, E>> => {
    let wasm: WasmModule
    try {
      wasm = await moduleOnce()
    } catch (cause) {
      return err({ kind: 'wasm_unavailable', detail: String(cause) })
    }
    return readEnvelope(wasm.render(JSON.stringify(request)), decodeValue, decodeError)
  }

  return { render }
}

export const makeWasmDecoder = (loadModule: () => Promise<WasmDecoderModule>): WasmDecoder => {
  const moduleOnce = loadOnce(loadModule)

  const decode = async <T, E>(
    image: Uint8Array,
    hints: unknown,
    decodeValue: Decoder<T>,
    decodeError: Decoder<E>,
  ): Promise<Envelope<T, E>> => {
    let wasm: WasmDecoderModule
    try {
      wasm = await moduleOnce()
    } catch (cause) {
      return err({ kind: 'wasm_unavailable', detail: String(cause) })
    }
    return readEnvelope(wasm.decode(image, JSON.stringify(hints)), decodeValue, decodeError)
  }

  return { decode }
}

/**
 * SSR のビルドでは wasm を読まない。
 *
 * 呼び出し側は `canUseBrowserWasm()` を確かめてから読むのでサーバでは実行されないが、
 * 下の動的 import がそのままだと、SSR のビルドにも wasm（生成 98 KiB・デコード 779 KiB、
 * gzip）が同梱され、Worker のバンドル（Free は 3 MiB）の半分以上を占めていた
 * （docs/bundle.md）。`import.meta.env.SSR` はビルド時の定数なので、サーバ側では
 * 分岐ごと import が消える。万一サーバで呼ばれても、例外ではなく拒否された Promise を
 * 返すので、`makeWasmRenderer` / `makeWasmDecoder` が `wasm_unavailable` にする。
 */
const unavailableOnServer = (): Promise<never> =>
  Promise.reject(new Error('browser wasm is not bundled into the server build'))

/**
 * ブラウザで生成用 wasm を読み込む。
 *
 * 動的 import なので、生成画面に入るまで wasm を取りに行かない。
 */
export const loadBrowserWasm: () => Promise<WasmModule> = import.meta.env.SSR
  ? unavailableOnServer
  : async () => {
      const [module, wasmUrl] = await Promise.all([
        import('../pkg/qrcc_wasm.js'),
        import('../pkg/qrcc_wasm_bg.wasm?url'),
      ])
      await module.default({ module_or_path: wasmUrl.default })
      return { render: module.render }
    }

/**
 * ブラウザでデコード用 wasm を読み込む。
 *
 * 生成用の何倍もある（rxing を含む）ので、**読み取り画面に入って、かつ
 * ブラウザ組み込みの `BarcodeDetector` が使えないときだけ**取りに行く。
 */
export const loadBrowserDecoder: () => Promise<WasmDecoderModule> = import.meta.env.SSR
  ? unavailableOnServer
  : async () => {
      const [module, wasmUrl] = await Promise.all([
        import('../pkg/qrcc_scan_wasm.js'),
        import('../pkg/qrcc_scan_wasm_bg.wasm?url'),
      ])
      await module.default({ module_or_path: wasmUrl.default })
      return { decode: module.decode }
    }

/** 実行環境で wasm を使えるか。SSR とハイドレーション前は使えない。 */
export const canUseBrowserWasm = (): boolean =>
  typeof WebAssembly === 'object' && typeof document !== 'undefined'
