/**
 * @qrcc/wasm — ブラウザで動く生成エンジン（ADR-0003）。
 *
 * 同じ Rust コードが Worker とブラウザの両方で動く。生成をブラウザ側で行えば
 * Workers のリクエスト無料枠を消費しないので、設定を触るたびの再生成ができる
 * （docs/free-tier-budget.md）。
 *
 * 入出力は docs/api-contract.md と同じ封筒なので、
 * 呼び出し側はサーバ経路と同じデコーダを使い回せる。
 */
import type { Result, RpcDecodeError } from '@qrcc/contract'
import { decodeRpcEnvelope, err } from '@qrcc/contract'

/** wasm 側の公開面。テストでは偽物を渡す。 */
export type WasmModule = {
  readonly render: (requestJson: string) => string
}

export type WasmUnavailable = {
  readonly kind: 'wasm_unavailable'
  readonly detail: string
}

type Decoder<T> = (value: unknown) => Result<T, { readonly detail: string }>

export type WasmRenderer = {
  readonly render: <T, E>(
    request: unknown,
    decodeValue: Decoder<T>,
    decodeError: Decoder<E>,
  ) => Promise<Result<Result<T, E>, RpcDecodeError | WasmUnavailable>>
}

/**
 * wasm の読み込みは 1 度だけ行い、以降は使い回す。
 * 失敗した場合も結果を憶えず、次の呼び出しで再試行する
 * （一時的なネットワーク不調で永久に諦めないため）。
 */
export const makeWasmRenderer = (loadModule: () => Promise<WasmModule>): WasmRenderer => {
  let loaded: Promise<WasmModule> | undefined

  const moduleOnce = () => {
    if (loaded === undefined) {
      loaded = loadModule().catch((cause: unknown) => {
        loaded = undefined
        throw cause
      })
    }
    return loaded
  }

  const render = async <T, E>(
    request: unknown,
    decodeValue: Decoder<T>,
    decodeError: Decoder<E>,
  ): Promise<Result<Result<T, E>, RpcDecodeError | WasmUnavailable>> => {
    let wasm: WasmModule
    try {
      wasm = await moduleOnce()
    } catch (cause) {
      return err({ kind: 'wasm_unavailable', detail: String(cause) })
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(wasm.render(JSON.stringify(request)))
    } catch (cause) {
      // wasm 側は例外を投げない設計なので、ここに来るのは JSON の破損だけ
      return err({ kind: 'malformed_envelope', detail: String(cause) })
    }

    return decodeRpcEnvelope<T, E>(parsed, decodeValue, decodeError)
  }

  return { render }
}

/**
 * ブラウザで実際に wasm を読み込む。
 *
 * 動的 import なので、生成画面に入るまで 200KB 超の wasm を取りに行かない。
 * サーバ側（SSR）では `document` が無いので呼ばない。
 */
export const loadBrowserWasm = async (): Promise<WasmModule> => {
  const [module, wasmUrl] = await Promise.all([
    import('../pkg/qrcc_wasm.js'),
    import('../pkg/qrcc_wasm_bg.wasm?url'),
  ])
  await module.default({ module_or_path: wasmUrl.default })
  return { render: module.render }
}

/** 実行環境で wasm を使えるか。SSR とハイドレーション前は使えない。 */
export const canUseBrowserWasm = (): boolean =>
  typeof WebAssembly === 'object' && typeof document !== 'undefined'
