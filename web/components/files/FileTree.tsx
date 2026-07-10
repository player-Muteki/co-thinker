"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { File, FileText, Folder, FolderOpen, CheckSquare, Square, ChevronRight, ChevronDown, X, Plus } from "lucide-react";
import type { FileItem } from "@/lib/api";

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

/** Tag chips with inline add/remove for indexed files. */
function TagEditor({ tags, documentId, onTagUpdate }: {
  tags: string[];
  documentId: string;
  onTagUpdate?: (documentId: string, tags: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    onTagUpdate?.(documentId, [...tags, trimmed]);
    setInputValue("");
    setEditing(false);
  };

  return (
    <>
      {tags.length > 0 && (
        <div className="hidden items-center gap-1 sm:flex">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]"
            >
              {tag}
              {onTagUpdate && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onTagUpdate(documentId, tags.filter((t) => t !== tag)); }}
                  className="hover:text-[var(--accent-hover)]"
                >
                  <X size={10} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {editing ? (
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); handleAdd(); }
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={() => {
            if (inputValue.trim()) handleAdd();
            else setEditing(false);
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-5 w-20 rounded border border-[var(--accent)] bg-[var(--surface-bg)] px-1 text-[10px] text-[var(--text-primary)] outline-none"
          placeholder="输入标签"
        />
      ) : onTagUpdate ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          className="hidden shrink-0 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--accent)] sm:block"
          title="添加标签"
        >
          <Plus size={12} />
        </button>
      ) : null}
    </>
  );
}

interface TreeNode {
  name: string;
  path: string;
  is_dir: boolean;
  children: TreeNode[];
  file?: FileItem;
}

function FileTreeNodeRow({
  node,
  depth,
  isExpanded,
  isSelected,
  hasChildren,
  onToggle,
  onToggleExpand,
  onTagUpdate,
}: {
  node: TreeNode;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  hasChildren: boolean;
  onToggle: (path: string) => void;
  onToggleExpand: (path: string) => void;
  onTagUpdate?: (documentId: string, tags: string[]) => void;
}) {
  const nameClick = () => {
    if (node.is_dir && hasChildren) onToggleExpand(node.path);
    else if (node.file) onToggle(node.path);
  };

  return (
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
          onClick={() => onToggleExpand(node.path)}
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
        onClick={nameClick}
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

      {node.file?.is_indexed && (
        <TagEditor
          tags={node.file.tags}
          documentId={node.file.document_id}
          onTagUpdate={onTagUpdate}
        />
      )}
    </div>
  );
}

export default function FileTree({ files, selected, onToggle, onTagUpdate }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["", "root"]));

  // Build tree structure — memoized to avoid O(n) rebuild per render
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
        <FileTreeNodeRow
          node={node}
          depth={depth}
          isExpanded={isExpanded}
          isSelected={!!isSelected}
          hasChildren={hasChildren}
          onToggle={onToggle}
          onToggleExpand={toggleExpand}
          onTagUpdate={onTagUpdate}
        />
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
