mod jsonrpc;
mod policy;
mod protocol;
mod tools;

use crate::jsonrpc::{
    error_response, parse_request_line, success_response, INVALID_PARAMS_CODE,
    METHOD_NOT_FOUND_CODE,
};
use crate::policy::ToolDispatcher;
use crate::protocol::ToolCall;
use crate::tools::ToolRegistry;
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};

fn main() {
    let registry = ToolRegistry::new();
    let dispatcher = ToolDispatcher::new(registry.clone());

    let stdin = io::stdin();
    let mut stdout = io::stdout();

    for line in stdin.lock().lines() {
        let Ok(line) = line else {
            break;
        };
        if line.trim().is_empty() {
            continue;
        }

        let (response, should_shutdown) = handle_line(&registry, &dispatcher, &line);
        if writeln!(stdout, "{response}").is_err() {
            break;
        }
        if stdout.flush().is_err() || should_shutdown {
            break;
        }
    }
}

fn handle_line(registry: &ToolRegistry, dispatcher: &ToolDispatcher, line: &str) -> (String, bool) {
    let request = match parse_request_line(line) {
        Ok(request) => request,
        Err(error) => return (serde_json::to_string(&error).unwrap(), false),
    };

    let result = match request.method.as_str() {
        "healthz" => Ok((json!({"ok": true, "status": "completed"}), false)),
        "tools/list" => Ok((json!({"ok": true, "tools": registry.list()}), false)),
        "tools/check" | "tools/call" => {
            let call: ToolCall = match parse_tool_call(&request.params) {
                Ok(call) => call,
                Err(error) => return (serde_json::to_string(&error).unwrap(), false),
            };
            let response = dispatcher.dispatch(call);
            Ok((serde_json::to_value(response).unwrap(), false))
        }
        "shutdown" => Ok((json!({"ok": true, "status": "completed"}), true)),
        _ => Err(error_response(
            request.id.clone(),
            METHOD_NOT_FOUND_CODE,
            "Method not found",
        )),
    };

    match result {
        Ok((result, should_shutdown)) => (
            serde_json::to_string(&success_response(request.id, result)).unwrap(),
            should_shutdown,
        ),
        Err(error) => (serde_json::to_string(&error).unwrap(), false),
    }
}

fn parse_tool_call(value: &Value) -> Result<ToolCall, jsonrpc::JsonRpcError> {
    serde_json::from_value::<ToolCall>(value.clone()).map_err(|_| {
        error_response(Value::Null, INVALID_PARAMS_CODE, "Invalid params")
    })
}
