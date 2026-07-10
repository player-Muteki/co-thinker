"use client";

import { useState, useRef, useEffect } from "react";
import { useMemo } from "react";
import { File, FileText, Folder, FolderOpen, CheckSquare, Square, ChevronRight, ChevronDown, X, Plus } from "lucide-react";

interface FileItem {
  path: string;
  name: string;
  ext: string;
  size: number;
  mtime: number;
  is_dir: boolean;
  is_indexed: boolean;
  document_id: string;
  tags: string[];
}

interface FileTreeProps {
  files: FileItem[];
  selected: Set<string>;
  onToggle: (path: string) => void;
  onTagUpdate?: (documentId: string, tags: string[]) => void;
}

const FileIcon = <File size={16} className="text-[var(--text-secondary)]" />;
const FileTextIcon = <FileText size={16} className="text-[var(--accent)]" />;

function getFileIcon(ext: string): JSX.Element {
  if ([".md", ".txt", ".py", ".js", ".ts", ".rs", ".go", ".java"].includes(ext)) {
    return FileTextIcon;
  }
  return FileIcon;
}

function formatFileSize(size: number): string {
  if (!size) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileTree({ files, selected, onToggle, onTagUpdate }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["", "root"]));
  const [tagInput, setTagInput] = useState<{ docId: string; value: string } | null>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tagInput) tagInputRef.current?.focus();
  }, [tagInput]);

  const handleTagAdd = (docId: string, currentTags: string[], newTag: string) => {
    const trimmed = newTag.trim();
    if (!trimmed || currentTags.includes(trimmed)) return;
    onTagUpdate?.(docId, [...currentTags, trimmed]);
    setTagInput(null);
  };

  const handleTagRemove = (docId: string, currentTags: string[], tag: string) => {
    onTagUpdate?.(docId, currentTags.filter((t) => t !== tag));
  };

  // Build tree structure — memoized to avoid O(n) rebuild per render
  interface TreeNode {
    name: string;
    path: string;
    is_dir: boolean;
    children: TreeNode[];
    file?: FileItem;
  }

  const root = useMemo(() => {
    const treeRoot: TreeNode = { name: "", path: "", is_dir: true, children: [] };

    for (const f of files) {
      const parts = f.path.split("/");
      let current = treeRoot;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        const childPath = parts.slice(0, i + 1).join("/");

        let child = current.children.find((c) => c.name === part);
        if (!child) {
          child = {
            name: part,
            path: childPath,
            is_dir: !isLast || f.is_dir,
            children: [],
            file: isLast ? f : undefined,
          };
          current.children.push(child);
        } else if (isLast) {
          child.file = f;
        }
        current = child;
      }
    }

    return treeRoot;
  }, [files]);

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const isExpanded = expanded.has(node.path);
    const isSelected = node.file && selected.has(node.path);
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.path}>
        <div
          className={`group flex min-h-9 items-center gap-2 border-b border-transparent px-2 text-sm transition-colors ${
            isSelected
              ? "bg-[var(--accent-soft)] text-[var(--text-primary)]"
              : "hover:bg-[var(--surface-alt)]"
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {node.is_dir && hasChildren ? (
            <button
              type="button"
              onClick={() => toggleExpand(node.path)}
              className="grid h-6 w-6 shrink-0 place-items-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-bg)] hover:text-[var(--text-primary)]"
              title={isExpanded ? "收起目录" : "展开目录"}
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : node.is_dir ? (
            <span className="h-6 w-6 shrink-0" />
          ) : (
            <button
              type="button"
              onClick={() => node.file && onToggle(node.path)}
              className="grid h-6 w-6 shrink-0 place-items-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-alt)] hover:text-[var(--accent)]"
              title={isSelected ? "取消选择" : "选择文件"}
            >
              {isSelected ? (
                <CheckSquare size={14} className="text-[var(--accent)]" />
              ) : (
                <Square size={14} className="text-[var(--text-secondary)]" />
              )}
            </button>
          )}

          <span className="shrink-0">
            {node.is_dir ? (
              isExpanded ? (
                <FolderOpen size={16} className="text-amber-500" />
              ) : (
                <Folder size={16} className="text-amber-500" />
              )
            ) : node.file ? (
              getFileIcon(node.file.ext)
            ) : null}
          </span>

          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left"
            onClick={() => {
              if (node.is_dir && hasChildren) {
                toggleExpand(node.path);
              } else if (node.file) {
                onToggle(node.path);
              }
            }}
          >
            {node.name}
          </button>

          {node.file && (
            <span className="hidden shrink-0 text-xs tabular-nums text-[var(--text-muted)] sm:inline">
              {formatFileSize(node.file.size)}
            </span>
          )}

          {node.file?.is_indexed && (
            <span className="shrink-0 rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-xs font-medium text-[var(--success)]">
              已索引
            </span>
          )}

          {node.file?.is_indexed && node.file.tags.length > 0 && (
            <div className="hidden items-center gap-1 sm:flex">
              {node.file.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-0.5 rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]"
                >
                  {tag}
                  {onTagUpdate && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleTagRemove(node.file!.document_id, node.file!.tags, tag); }}
                      className="hover:text-[var(--accent-hover)]"
                    >
                      <X size={10} />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}

          {node.file?.is_indexed && onTagUpdate && tagInput?.docId === node.file.document_id ? (
            <input
              ref={tagInputRef}
              value={tagInput.value}
              onChange={(e) => setTagInput({ ...tagInput, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleTagAdd(node.file!.document_id, node.file!.tags, tagInput.value);
                }
                if (e.key === "Escape") setTagInput(null);
              }}
              onBlur={() => {
                if (tagInput.value.trim()) {
                  handleTagAdd(node.file!.document_id, node.file!.tags, tagInput.value);
                } else {
                  setTagInput(null);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="h-5 w-20 rounded border border-[var(--accent)] bg-[var(--surface-bg)] px-1 text-[10px] text-[var(--text-primary)] outline-none"
              placeholder="输入标签"
            />
          ) : node.file?.is_indexed && onTagUpdate ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setTagInput({ docId: node.file!.document_id, value: "" });
              }}
              className="hidden shrink-0 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--accent)] sm:block"
              title="添加标签"
            >
              <Plus size={12} />
            </button>
          ) : null}
        </div>

        {node.is_dir && isExpanded && hasChildren && (
          <div>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return <div className="py-2">{root.children.map((child) => renderNode(child, 0))}</div>;
}
