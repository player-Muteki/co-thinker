use crate::protocol::ToolCategory;
use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ToolSpec {
    pub name: &'static str,
    pub description: &'static str,
    pub category: ToolCategory,
}

#[derive(Debug, Clone, Default)]
pub struct ToolRegistry {
    tools: Vec<ToolSpec>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            tools: vec![
                ToolSpec {
                    name: "kb_get_stats",
                    description: "Return knowledge base indexing statistics.",
                    category: ToolCategory::ReadOnly,
                },
                ToolSpec {
                    name: "kb_list_files",
                    description: "Browse workspace files known to Luna.",
                    category: ToolCategory::ReadOnly,
                },
                ToolSpec {
                    name: "kb_list_documents",
                    description: "List indexed knowledge base documents.",
                    category: ToolCategory::ReadOnly,
                },
                ToolSpec {
                    name: "kb_search",
                    description: "Search indexed knowledge base chunks.",
                    category: ToolCategory::ReadOnly,
                },
                ToolSpec {
                    name: "kb_index_files",
                    description: "Index a list of workspace files.",
                    category: ToolCategory::Mutating,
                },
                ToolSpec {
                    name: "kb_rebuild_index",
                    description: "Rebuild the knowledge base index.",
                    category: ToolCategory::Mutating,
                },
                ToolSpec {
                    name: "kb_delete_document",
                    description: "Delete a document from the knowledge base.",
                    category: ToolCategory::Mutating,
                },
                ToolSpec {
                    name: "kb_update_tags",
                    description: "Update tags for a knowledge base document.",
                    category: ToolCategory::Mutating,
                },
                ToolSpec {
                    name: "kb_clear_index",
                    description: "Clear the knowledge base index.",
                    category: ToolCategory::Dangerous,
                },
                ToolSpec {
                    name: "shell_exec",
                    description: "Execute arbitrary shell commands.",
                    category: ToolCategory::Dangerous,
                },
            ],
        }
    }

    pub fn list(&self) -> &[ToolSpec] {
        &self.tools
    }

    pub fn get(&self, name: &str) -> Option<&ToolSpec> {
        self.tools.iter().find(|tool| tool.name == name)
    }
}
