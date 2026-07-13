use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ToolCategory {
    ReadOnly,
    Mutating,
    Dangerous,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ToolStatus {
    Allowed,
    ApprovalRequired,
    Denied,
    Completed,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ToolCall {
    pub name: String,
    #[serde(default)]
    pub arguments: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EventFrame {
    #[serde(rename = "type")]
    pub event_type: String,
    pub tool_name: String,
    pub status: ToolStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ToolResponse {
    pub ok: bool,
    pub status: ToolStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<ToolCategory>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<Value>,
    #[serde(default)]
    pub events: Vec<EventFrame>,
}

impl ToolResponse {
    pub fn allowed(tool_name: &str, category: ToolCategory) -> Self {
        Self {
            ok: true,
            status: ToolStatus::Allowed,
            tool_name: Some(tool_name.to_string()),
            category: Some(category),
            reason: None,
            body: None,
            events: Vec::new(),
        }
    }

    pub fn blocked(
        tool_name: &str,
        category: ToolCategory,
        status: ToolStatus,
        reason: impl Into<String>,
    ) -> Self {
        let reason = reason.into();
        let event_type = match status {
            ToolStatus::ApprovalRequired => "approval_required",
            ToolStatus::Denied => "denied",
            _ => "error",
        };

        Self {
            ok: false,
            status: status.clone(),
            tool_name: Some(tool_name.to_string()),
            category: Some(category),
            reason: Some(reason.clone()),
            body: None,
            events: vec![EventFrame {
                event_type: event_type.to_string(),
                tool_name: tool_name.to_string(),
                status,
                message: Some(reason),
                body: None,
            }],
        }
    }

}
