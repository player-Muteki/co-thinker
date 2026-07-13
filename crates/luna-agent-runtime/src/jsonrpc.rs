use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PARSE_ERROR_CODE: i64 = -32700;
pub const INVALID_REQUEST_CODE: i64 = -32600;
pub const METHOD_NOT_FOUND_CODE: i64 = -32601;
pub const INVALID_PARAMS_CODE: i64 = -32602;

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: Value,
    pub method: String,
    #[serde(default)]
    pub params: Value,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct JsonRpcSuccess {
    pub jsonrpc: &'static str,
    pub id: Value,
    pub result: Value,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct JsonRpcErrorObject {
    pub code: i64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct JsonRpcError {
    pub jsonrpc: &'static str,
    pub id: Value,
    pub error: JsonRpcErrorObject,
}

pub fn parse_request_line(line: &str) -> Result<JsonRpcRequest, JsonRpcError> {
    let request: JsonRpcRequest = serde_json::from_str(line).map_err(|_| {
        error_response(Value::Null, PARSE_ERROR_CODE, "Parse error")
    })?;

    if request.jsonrpc != "2.0" || request.method.trim().is_empty() {
        return Err(error_response(
            request.id.clone(),
            INVALID_REQUEST_CODE,
            "Invalid Request",
        ));
    }

    Ok(request)
}

pub fn success_response(id: Value, result: Value) -> JsonRpcSuccess {
    JsonRpcSuccess {
        jsonrpc: "2.0",
        id,
        result,
    }
}

pub fn error_response(id: Value, code: i64, message: &str) -> JsonRpcError {
    JsonRpcError {
        jsonrpc: "2.0",
        id,
        error: JsonRpcErrorObject {
            code,
            message: message.to_string(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::{
        error_response, parse_request_line, success_response, INVALID_REQUEST_CODE,
        METHOD_NOT_FOUND_CODE, PARSE_ERROR_CODE,
    };
    use serde_json::json;

    #[test]
    fn invalid_json_returns_parse_error() {
        let err = parse_request_line("{").expect_err("expected parse error");
        assert_eq!(err.error.code, PARSE_ERROR_CODE);
    }

    #[test]
    fn invalid_request_returns_invalid_request_error() {
        let err = parse_request_line(r#"{"jsonrpc":"1.0","id":1,"method":"healthz"}"#)
            .expect_err("expected invalid request");
        assert_eq!(err.error.code, INVALID_REQUEST_CODE);
    }

    #[test]
    fn success_response_keeps_result() {
        let response = success_response(json!(1), json!({"ok": true}));
        assert_eq!(response.result, json!({"ok": true}));
    }

    #[test]
    fn error_response_keeps_method_not_found_code() {
        let response = error_response(json!(1), METHOD_NOT_FOUND_CODE, "Method not found");
        assert_eq!(response.error.code, METHOD_NOT_FOUND_CODE);
    }
}
