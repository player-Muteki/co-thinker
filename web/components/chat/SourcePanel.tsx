"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface Source {
  chunk_id: string;
  document_id: string;
  source_path: string;
  file_name: string;
  score: number;
  matched_by: string[];
}

export default function SourcePanel({
  sources,
}: {
  sources: Source[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (sources.length === 0) return null;

  return (
    <div className="border-t border-[var(--surface-border)] bg-[var(--surface-panel)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-alt)] hover:text-[var(--text-primary)]"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        引用来源 ({sources.length})
      </button>

      {expanded && (
        <div className="space-y-1 px-4 pb-3">
          {sources.map((src, i) => (
            <div
              key={src.chunk_id}
              className="flex items-center justify-between rounded-md border border-[var(--surface-border)] bg-[var(--surface-bg)] px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-[var(--text-secondary)] shrink-0">
                  [{i + 1}]
                </span>
                <span className="truncate font-mono text-xs">
                  {src.source_path}
                </span>
                {src.matched_by.length > 0 && (
                  <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-medium text-[var(--accent)]">
                    {src.matched_by.join("+")}
                  </span>
                )}
              </div>
              <span className="text-xs text-[var(--text-secondary)] shrink-0 ml-2">
                {(src.score * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
