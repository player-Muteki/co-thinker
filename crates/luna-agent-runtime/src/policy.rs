use crate::protocol::{ToolCall, ToolCategory, ToolResponse, ToolStatus};
use crate::tools::ToolRegistry;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyAction {
    Allow,
    ApprovalRequired,
    Deny,
}

#[derive(Debug, Clone, Default)]
pub struct ToolPolicy;

impl ToolPolicy {
    pub fn evaluate(category: &ToolCategory) -> PolicyAction {
        match category {
            ToolCategory::ReadOnly => PolicyAction::Allow,
            ToolCategory::Mutating => PolicyAction::ApprovalRequired,
            ToolCategory::Dangerous => PolicyAction::Deny,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ToolDispatcher {
    registry: ToolRegistry,
}

impl ToolDispatcher {
    pub fn new(registry: ToolRegistry) -> Self {
        Self { registry }
    }

    pub fn dispatch(&self, call: ToolCall) -> ToolResponse {
        let Some(tool) = self.registry.get(&call.name) else {
            return ToolResponse::blocked(
                &call.name,
                ToolCategory::Dangerous,
                ToolStatus::Denied,
                format!("Unknown tool {}.", call.name),
            );
        };

        match ToolPolicy::evaluate(&tool.category) {
            PolicyAction::Allow => ToolResponse::allowed(tool.name, tool.category.clone()),
            PolicyAction::ApprovalRequired => ToolResponse::blocked(
                tool.name,
                tool.category.clone(),
                ToolStatus::ApprovalRequired,
                format!("Tool {} changes the knowledge base.", tool.name),
            ),
            PolicyAction::Deny => ToolResponse::blocked(
                tool.name,
                tool.category.clone(),
                ToolStatus::Denied,
                format!("Tool {} is disabled by default.", tool.name),
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::ToolDispatcher;
    use crate::protocol::{ToolCall, ToolStatus};
    use crate::tools::ToolRegistry;
    use serde_json::json;

    #[test]
    fn read_only_tools_are_allowed() {
        let dispatcher = ToolDispatcher::new(ToolRegistry::new());
        let response = dispatcher.dispatch(ToolCall {
            name: "kb_get_stats".to_string(),
            arguments: json!({}),
        });

        assert!(response.ok);
        assert_eq!(response.status, ToolStatus::Allowed);
    }

    #[test]
    fn mutating_tools_require_approval() {
        let dispatcher = ToolDispatcher::new(ToolRegistry::new());
        let response = dispatcher.dispatch(ToolCall {
            name: "kb_delete_document".to_string(),
            arguments: json!({"document_id": "doc_123"}),
        });

        assert!(!response.ok);
        assert_eq!(response.status, ToolStatus::ApprovalRequired);
    }

    #[test]
    fn dangerous_tools_are_denied() {
        let dispatcher = ToolDispatcher::new(ToolRegistry::new());
        let response = dispatcher.dispatch(ToolCall {
            name: "kb_clear_index".to_string(),
            arguments: json!({}),
        });

        assert!(!response.ok);
        assert_eq!(response.status, ToolStatus::Denied);
    }

    #[test]
    fn unknown_tools_are_denied() {
        let dispatcher = ToolDispatcher::new(ToolRegistry::new());
        let response = dispatcher.dispatch(ToolCall {
            name: "nope".to_string(),
            arguments: json!({}),
        });

        assert!(!response.ok);
        assert_eq!(response.status, ToolStatus::Denied);
        assert_eq!(response.reason.as_deref(), Some("Unknown tool nope."));
    }
}
