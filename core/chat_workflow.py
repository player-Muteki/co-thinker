"""
ChatWorkflow — 纯 RAG 对话流程实现。

职责：
  1. 接收用户查询和会话 ID
  2. 读取历史 → 检索 → 流式生成 → 持久化消息
  3. 向外发射类型化事件（retrieval_done / chunk / reasoning / done / error）

与 FastAPI / WebSocket 零耦合，可在纯函数测试中验证。
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Generator

logger = logging.getLogger(__name__)


@dataclass
class WorkflowEvent:
    """工作流事件——route adapter 将其转换为 HTTP/WS 格式。"""
    type: str  # "retrieval_done" | "chunk" | "reasoning" | "done" | "error"
    data: dict[str, Any] = field(default_factory=dict)


class ChatWorkflow:
    """RAG 对话流程——纯业务逻辑，不依赖 FastAPI / WebSocket。"""

    def __init__(self, runtime: Any):
        self._runtime = runtime

    @property
    def _ctx(self) -> Any:
        return self._runtime.ctx

    def execute(
        self,
        query: str,
        session_id: str | None = None,
        model: str | None = None,
    ) -> Generator[WorkflowEvent, None, None]:
        """执行一轮 RAG 问答，返回事件序列。

        事件顺序（正常路径）：
          retrieval_done → (reasoning*) → (chunk*) → done

        事件顺序（空结果）：
          done (zero references)

        事件顺序（异常）：
          error
        """
        ctx = self._ctx

        history = self._load_history(session_id)
        retrieval_results = yield from self._execute_retrieval(query, history)
        if retrieval_results is None:
            return

        retrieval_details = self._build_retrieval_details(retrieval_results)
        if retrieval_details is not None:
            yield retrieval_details

        if not retrieval_results.results:
            yield from self._handle_no_results(query)
            return

        yield from self._stream_and_persist(query, retrieval_results, history, retrieval_details, model)

    def _load_history(self, session_id: str | None) -> list[dict[str, str]] | None:
        """加载会话历史。"""
        if not session_id or not self._ctx.chat_engine:
            return None
        conversation = self._ctx.chat_engine.conversations.get(session_id)
        if not conversation:
            return None
        self._ctx.chat_engine.current_id = session_id
        return conversation.to_llm_history(self._ctx.config.max_history_turns)

    def _execute_retrieval(
        self, query: str, history: list[dict[str, str]] | None
    ) -> Generator[WorkflowEvent, None, Any | None]:
        """执行检索。失败时 yield error 事件并返回 None。"""
        try:
            return self._ctx.retriever.retrieve(query=query, chat_history=history)
        except Exception as exc:
            logger.exception("Retrieval failed")
            yield WorkflowEvent("error", {"message": f"检索失败：{exc}"})
            return None

    def _build_retrieval_details(self, retrieval_results: Any) -> WorkflowEvent | None:
        """构造检索详情事件。无结果时返回 None。"""
        if not retrieval_results.results:
            return None
        details: dict[str, Any] = {
            "mode": retrieval_results.mode,
            "elapsed_ms": round(retrieval_results.elapsed_ms, 1),
            "total_candidates": retrieval_results.total_candidates,
            "effective_query": retrieval_results.effective_query,
            "results": [
                {
                    "chunk_id": r.chunk_id,
                    "source_path": r.source_path,
                    "file_name": r.file_name,
                    "score": round(r.final_score, 4),
                    "matched_by": r.matched_by,
                    "vector_score": round(r.vector_score, 4) if r.vector_score is not None else None,
                    "bm25_score": round(r.bm25_score, 4) if r.bm25_score is not None else None,
                }
                for r in retrieval_results.results[:5]
            ],
        }
        return WorkflowEvent("retrieval_done", details)

    def _handle_no_results(self, query: str) -> Generator[WorkflowEvent, None, None]:
        """无检索结果时发出 done 事件。"""
        ctx = self._ctx
        if ctx.chat_engine:
            ctx.chat_engine.add_user_message(query)
            ctx.chat_engine.add_assistant_message("知识库中未找到相关信息")
        yield WorkflowEvent("done", {
            "session_id": ctx.chat_engine.current_id if ctx.chat_engine else None,
            "references": [],
            "confidence": "none",
        })

    def _stream_and_persist(
        self, query: str, retrieval_results: Any, history: list[dict[str, str]] | None,
        retrieval_details: WorkflowEvent | None, model: str | None,
    ) -> Generator[WorkflowEvent, None, None]:
        """流式生成回答、持久化消息并发出完毕事件。"""
        ctx = self._ctx

        if ctx.chat_engine:
            ctx.chat_engine.add_user_message(query, mode="rag", save=True)

        full_answer = ""
        reasoning_text = ""
        for event_type, content in ctx.generator.stream_generate(
            query, retrieval_results, history, model
        ):
            if event_type == "reasoning":
                reasoning_text += content
                yield WorkflowEvent("reasoning", {"content": content})
            else:
                full_answer += content
                yield WorkflowEvent("chunk", {"content": content})

        metadata: dict[str, Any] = {}
        if retrieval_details:
            metadata["retrieval_details"] = retrieval_details.data
        if reasoning_text:
            metadata["reasoning_text"] = reasoning_text
        if ctx.chat_engine:
            ctx.chat_engine.add_assistant_message(full_answer, save=True, **metadata)

        references = retrieval_results.to_sources()[:10]
        yield WorkflowEvent("done", {
            "session_id": ctx.chat_engine.current_id if ctx.chat_engine else None,
            "references": references,
            "confidence": retrieval_results.confidence,
        })