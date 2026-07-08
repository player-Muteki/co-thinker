"use client";

import { useState, useEffect, useCallback } from "react";
import FileTree from "@/components/files/FileTree";
import { RefreshCw, CheckSquare, Square } from "lucide-react";

export default function FilesPage() {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [indexing, setIndexing] = useState(false);
  const [search, setSearch] = useState("");

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await fetch(`/api/files${params}`);
      const data = await res.json();
      setFiles(data.files || []);
    } catch (e) {
      console.error("Failed to load files", e);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const toggleFile = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleAll = () => {
    const filePaths = files.filter((f) => !f.is_dir).map((f) => f.path);
    if (selected.size === filePaths.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filePaths));
    }
  };

  const handleIndex = async () => {
    if (selected.size === 0) return;
    setIndexing(true);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: Array.from(selected) }),
      });
      const result = await res.json();
      await loadFiles();
      setSelected(new Set());
      window.dispatchEvent(new CustomEvent("index-updated"));
    } catch (e) {
      console.error("Index failed", e);
    } finally {
      setIndexing(false);
    }
  };

  const indexedCount = files.filter((f) => f.is_indexed).length;
  const totalFileCount = files.filter((f) => !f.is_dir).length;
  const allSelected = selected.size === totalFileCount && totalFileCount > 0;

  return (
    <div className="h-full flex flex-col p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">文件管理</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            已索引 {indexedCount}/{totalFileCount} 个文件
          </p>
        </div>
        <button
          onClick={handleIndex}
          disabled={selected.size === 0 || indexing}
          className="px-4 py-1.5 text-sm rounded bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50"
        >
          {indexing ? "索引中..." : "索引"}
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="搜索文件..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded border border-[var(--surface-border)] bg-[var(--surface-bg)] focus:outline-none focus:border-[var(--accent)]"
        />
      </div>

      {selected.size > 0 && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-[var(--surface-alt)] border border-[var(--surface-border)] text-sm">
          <div className="text-[var(--text-secondary)] mb-1">已选 {selected.size} 个文件</div>
          <div className="space-y-0.5 max-h-24 overflow-y-auto">
            {Array.from(selected).slice(0, 10).map(p => (
              <div key={p} className="truncate text-xs text-[var(--text-primary)]">{p}</div>
            ))}
            {selected.size > 10 && (
              <div className="text-xs text-[var(--text-secondary)]">...还有 {selected.size - 10} 个</div>
            )}
          </div>
        </div>
      )}

      <div
        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-alt)] rounded mb-1"
        onClick={toggleAll}
      >
        {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
        全选
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="text-center text-[var(--text-secondary)] py-8">加载中...</div>
        ) : (
          <FileTree files={files} selected={selected} onToggle={toggleFile} />
        )}
      </div>
    </div>
  );
}
