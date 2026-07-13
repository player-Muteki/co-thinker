from __future__ import annotations

import json
from unittest.mock import patch

from typer.testing import CliRunner

from cli import app

runner = CliRunner()


class _FakeAgentRuntime:
    def __init__(self, response: dict[str, object]):
        self._response = response

    def call_tool(self, name: str, arguments: dict[str, object]) -> dict[str, object]:
        return {
            **self._response,
            "tool_name": self._response.get("tool_name", name),
            "body": self._response.get("body"),
        }


class _FakeWorkspaceRuntime:
    def __init__(self, response: dict[str, object]):
        self._response = response

    def get_agent_runtime(self) -> _FakeAgentRuntime:
        return _FakeAgentRuntime(self._response)


class TestCliTool:
    def test_tool_command_prints_completed_response(self) -> None:
        fake_runtime = _FakeWorkspaceRuntime(
            {
                "ok": True,
                "status": "completed",
                "events": [],
                "body": {"document_count": 2},
            }
        )

        with patch("cli._setup_project_context", return_value=fake_runtime):
            result = runner.invoke(app, ["tool", "kb_get_stats", "{}"])

        assert result.exit_code == 0
        payload = json.loads(result.stdout)
        assert payload["status"] == "completed"
        assert payload["body"]["document_count"] == 2

    def test_tool_command_prints_blocked_policy_response(self) -> None:
        fake_runtime = _FakeWorkspaceRuntime(
            {
                "ok": False,
                "status": "approval_required",
                "reason": "Tool kb_rebuild_index changes the knowledge base.",
                "events": [],
            }
        )

        with patch("cli._setup_project_context", return_value=fake_runtime):
            result = runner.invoke(app, ["tool", "kb_rebuild_index", "{}"])

        assert result.exit_code == 0
        payload = json.loads(result.stdout)
        assert payload["status"] == "approval_required"
        assert "changes the knowledge base" in payload["reason"]

    def test_tool_command_rejects_non_object_json_arguments(self) -> None:
        result = runner.invoke(app, ["tool", "kb_get_stats", "[]"])

        assert result.exit_code == 1
        assert "JSON object" in result.stdout
