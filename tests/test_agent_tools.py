from __future__ import annotations

from pathlib import Path

import pytest

from core.agent_tools import KnowledgeToolset
from tests.conftest import make_runtime


def _index_fixture_docs(tmp_path: Path) -> None:
    (tmp_path / "rag_config.md").write_text(
        "# RAG 配置\n这里记录了 RAG 配置、检索策略和生成参数。",
        encoding="utf-8",
    )
    (tmp_path / "notes.txt").write_text(
        "普通说明文档。",
        encoding="utf-8",
    )
    (tmp_path / "empty.md").write_text("", encoding="utf-8")


class TestKnowledgeToolset:
    def test_kb_get_stats(self, tmp_path: Path) -> None:
        runtime = make_runtime(tmp_path)
        _index_fixture_docs(tmp_path)
        runtime.ingest_engine.add_files(runtime.ingest_engine.scan_files())

        toolset = KnowledgeToolset(runtime)
        stats = toolset.call("kb_get_stats", {})

        assert stats["document_count"] >= 2
        assert stats["indexed_document_count"] >= 2
        assert stats["failed_document_count"] >= 1
        assert stats["chunk_count"] > 0

    def test_kb_list_files_supports_search(self, tmp_path: Path) -> None:
        runtime = make_runtime(tmp_path)
        _index_fixture_docs(tmp_path)

        toolset = KnowledgeToolset(runtime)
        result = toolset.call("kb_list_files", {"search": "config"})

        assert result["count"] >= 1
        assert any(item["path"] == "rag_config.md" for item in result["items"])

    def test_kb_list_documents_supports_status_filter(self, tmp_path: Path) -> None:
        runtime = make_runtime(tmp_path)
        _index_fixture_docs(tmp_path)
        runtime.ingest_engine.add_files(runtime.ingest_engine.scan_files())

        toolset = KnowledgeToolset(runtime)
        result = toolset.call("kb_list_documents", {"status": "failed"})

        assert result["status"] == "failed"
        assert result["count"] >= 1
        assert all(doc["status"] == "failed" for doc in result["documents"])

    def test_kb_search_returns_ranked_results(self, tmp_path: Path) -> None:
        runtime = make_runtime(tmp_path)
        _index_fixture_docs(tmp_path)
        runtime.ingest_engine.add_files(runtime.ingest_engine.scan_files())

        toolset = KnowledgeToolset(runtime)
        result = toolset.call("kb_search", {"query": "RAG 配置", "top_k": 3})

        assert result["query"] == "RAG 配置"
        assert result["count"] >= 1
        top = result["results"][0]
        assert top["source_path"] == "rag_config.md"
        assert "text" in top

    def test_unknown_tool_raises(self, tmp_path: Path) -> None:
        runtime = make_runtime(tmp_path)
        toolset = KnowledgeToolset(runtime)

        with pytest.raises(ValueError, match="Unknown knowledge tool"):
            toolset.call("kb_nope", {})

    def test_kb_index_files_rejects_paths_outside_workspace(self, tmp_path: Path) -> None:
        runtime = make_runtime(tmp_path)
        toolset = KnowledgeToolset(runtime)

        with pytest.raises(ValueError, match="Path escapes workspace"):
            toolset.call("kb_index_files", {"paths": ["../outside.md"]})
