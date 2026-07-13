from __future__ import annotations

import json
import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest

from core.agent_runtime import RustAgentRuntime


class _FakeToolset:
    def call(self, name: str, arguments: dict[str, object]) -> dict[str, object]:
        return {"name": name, "arguments": arguments}


def _completed_process(payload: dict[str, object]) -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess(
        args=["cargo"],
        returncode=0,
        stdout=json.dumps(payload),
        stderr="",
    )


class TestRustAgentRuntime:
    def test_check_tool_sends_json_rpc_request(self, tmp_path: Path) -> None:
        runtime = RustAgentRuntime(toolset=_FakeToolset(), repo_root=tmp_path)
        response_payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "ok": True,
                "status": "allowed",
                "tool_name": "kb_get_stats",
                "events": [],
            },
        }

        with patch("core.agent_runtime.subprocess.run", return_value=_completed_process(response_payload)) as mock_run:
            result = runtime.check_tool("kb_get_stats", {})

        assert result["status"] == "allowed"
        sent = json.loads(mock_run.call_args.kwargs["input"])
        assert sent["jsonrpc"] == "2.0"
        assert sent["method"] == "tools/check"
        assert sent["params"] == {"name": "kb_get_stats", "arguments": {}}

    def test_call_tool_wraps_completed_response(self, tmp_path: Path) -> None:
        runtime = RustAgentRuntime(toolset=_FakeToolset(), repo_root=tmp_path)
        response_payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "ok": True,
                "status": "allowed",
                "tool_name": "kb_get_stats",
                "events": [],
            },
        }

        with patch("core.agent_runtime.subprocess.run", return_value=_completed_process(response_payload)):
            result = runtime.call_tool("kb_get_stats", {})

        assert result["ok"] is True
        assert result["status"] == "completed"
        assert result["body"] == {"name": "kb_get_stats", "arguments": {}}
        assert result["events"][0]["type"] == "tool_call_start"
        assert result["events"][1]["type"] == "tool_call_result"

    def test_call_tool_returns_blocked_policy_without_executing_toolset(self, tmp_path: Path) -> None:
        runtime = RustAgentRuntime(toolset=_FakeToolset(), repo_root=tmp_path)
        response_payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "ok": False,
                "status": "approval_required",
                "tool_name": "kb_rebuild_index",
                "reason": "Tool kb_rebuild_index changes the knowledge base.",
                "events": [],
            },
        }

        with patch("core.agent_runtime.subprocess.run", return_value=_completed_process(response_payload)):
            result = runtime.call_tool("kb_rebuild_index", {})

        assert result["status"] == "approval_required"
        assert "body" not in result or result["body"] is None

    def test_runtime_timeout_raises(self, tmp_path: Path) -> None:
        runtime = RustAgentRuntime(toolset=_FakeToolset(), repo_root=tmp_path, timeout_seconds=0.01)

        with patch("core.agent_runtime.subprocess.run", side_effect=subprocess.TimeoutExpired(cmd=["cargo"], timeout=0.01)):
            with pytest.raises(RuntimeError, match="timed out"):
                runtime.check_tool("kb_get_stats", {})

    def test_runtime_unavailable_raises(self, tmp_path: Path) -> None:
        runtime = RustAgentRuntime(toolset=_FakeToolset(), repo_root=tmp_path)

        with patch("core.agent_runtime.subprocess.run", side_effect=FileNotFoundError):
            with pytest.raises(RuntimeError, match="unavailable"):
                runtime.check_tool("kb_get_stats", {})

    def test_invalid_json_response_raises(self, tmp_path: Path) -> None:
        runtime = RustAgentRuntime(toolset=_FakeToolset(), repo_root=tmp_path)
        process = subprocess.CompletedProcess(args=["cargo"], returncode=0, stdout="not-json", stderr="")

        with patch("core.agent_runtime.subprocess.run", return_value=process):
            with pytest.raises(RuntimeError, match="invalid JSON"):
                runtime.check_tool("kb_get_stats", {})

    def test_nonzero_runtime_result_raises(self, tmp_path: Path) -> None:
        runtime = RustAgentRuntime(toolset=_FakeToolset(), repo_root=tmp_path)
        process = subprocess.CompletedProcess(args=["cargo"], returncode=1, stdout="", stderr="boom")

        with patch("core.agent_runtime.subprocess.run", return_value=process):
            with pytest.raises(RuntimeError, match="Rust agent runtime failed: boom"):
                runtime.check_tool("kb_get_stats", {})

    def test_json_rpc_error_response_raises(self, tmp_path: Path) -> None:
        runtime = RustAgentRuntime(toolset=_FakeToolset(), repo_root=tmp_path)
        response_payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "error": {"code": -32601, "message": "Method not found"},
        }

        with patch("core.agent_runtime.subprocess.run", return_value=_completed_process(response_payload)):
            with pytest.raises(RuntimeError, match="Method not found"):
                runtime.check_tool("kb_get_stats", {})
