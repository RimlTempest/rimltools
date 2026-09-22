//! W3C Trace Context の最小対応（docs/ops/telemetry.md）。
//!
//! qrcc-web は service binding の呼び出しに `traceparent` を付ける。ここでは span を
//! 送らず（今後の課題）、trace_id をログに載せて Grafana でログ ↔ trace を繋ぐだけにする。

/// `traceparent` から trace_id（32 桁の小文字 hex、全ゼロ以外）を取り出す。
pub fn trace_id(traceparent: &str) -> Option<&str> {
    let mut parts = traceparent.trim().split('-');
    let version = parts.next()?;
    let trace_id = parts.next()?;
    let span_id = parts.next()?;
    let flags = parts.next()?;
    let hex = |s: &str, len: usize| {
        s.len() == len
            && s.bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    };
    let valid = hex(version, 2)
        && version != "ff"
        && hex(trace_id, 32)
        && hex(span_id, 16)
        && hex(flags, 2)
        && trace_id.bytes().any(|b| b != b'0');
    valid.then_some(trace_id)
}

/// Workers Logs に出す 1 行の構造化ログ（キー名は @rimltools/telemetry の log() と揃える）。
pub fn rpc_log_line(trace_id: &str, request_id: Option<&str>, method: &str, path: &str) -> String {
    serde_json::json!({
        "level": "info",
        "message": "rpc",
        "service.name": "qrcc-api",
        "trace_id": trace_id,
        "request_id": request_id,
        "http.request.method": method,
        "url.path": path,
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    const TRACE: &str = "4bf92f3577b34da6a3ce929d0e0e4736";

    #[test]
    fn reads_the_trace_id() {
        let header = format!("00-{TRACE}-00f067aa0ba902b7-01");
        assert_eq!(trace_id(&header), Some(TRACE));
    }

    #[test]
    fn rejects_malformed_headers() {
        for header in [
            "",
            "garbage",
            "00-4bf92f35-00f067aa0ba902b7-01",
            "00-00000000000000000000000000000000-00f067aa0ba902b7-01",
            "ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
            "00-4BF92F3577B34DA6A3CE929D0E0E4736-00f067aa0ba902b7-01",
        ] {
            assert_eq!(trace_id(header), None, "{header}");
        }
    }

    #[test]
    fn log_line_carries_the_correlation_fields() {
        let line = rpc_log_line(TRACE, Some("req-1"), "POST", "/rpc/render");
        let value: serde_json::Value = serde_json::from_str(&line).expect("json");
        assert_eq!(value["trace_id"], TRACE);
        assert_eq!(value["request_id"], "req-1");
        assert_eq!(value["url.path"], "/rpc/render");
    }
}
