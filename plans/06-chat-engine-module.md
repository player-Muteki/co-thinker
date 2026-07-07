# Chat Engine 模块 — `app/chat_engine.py` 详细设计

## 1. 模块定位

`ChatEngine` 负责 Co-Thinker 的多轮对话状态管理。它记录用户与助手消息，支持多个独立会话，并向 RAG 生成模块提供经过裁剪的上下文历史。

它不负责检索、不负责调用 LLM、不负责渲染 UI。它的职责是：

- 会话生命周期：创建、切换、重命名、删除。
- 消息生命周期：添加、读取、清空、持久化。
- 上下文控制：只提供最近 N 轮或摘要后的历史。
- 元数据存储：保存答案来源、耗时、检索模式等信息。

## 2. 存储方案

MVP 使用本地 JSON 文件：`storage/chat_history.json`。

选择 JSON 的原因：

- 简单、可读、便于调试。
- 无需数据库服务。
- 数据规模较小：个人/本地知识库问答足够。

P1/P2 如需要多用户、并发写入或查询统计，可迁移到 SQLite。

## 3. 数据结构设计

### 3.1 Message

```python
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
import uuid

@dataclass
class Message:
    role: str  # "user" | "assistant" | "system"
    content: str
    message_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_llm_message(self) -> dict:
        return {"role": self.role, "content": self.content}
```

`metadata` 可保存：

- `sources`: 引用来源列表。
- `retrieval_mode`: `hybrid` / `vector` / `bm25`。
- `retrieval_elapsed_ms`。
- `generation_elapsed_ms`。
- `confidence`。
- `error`。

### 3.2 Conversation

```python
@dataclass
class Conversation:
    conversation_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    title: str = "新对话"
    messages: list[Message] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    metadata: dict[str, Any] = field(default_factory=dict)

    def add_message(self, role: str, content: str, **metadata) -> Message: ...
    def get_recent_messages(self, max_turns: int) -> list[Message]: ...
    def to_llm_history(self, max_turns: int) -> list[dict]: ...
```

### 3.3 存储文件格式

```json
{
  "version": 1,
  "current_id": "conv_abc",
  "conversations": {
    "conv_abc": {
      "conversation_id": "conv_abc",
      "title": "什么是 RAG？",
      "created_at": "2026-07-06T10:00:00+00:00",
      "updated_at": "2026-07-06T10:03:00+00:00",
      "metadata": {},
      "messages": [
        {
          "message_id": "msg_1",
          "role": "user",
          "content": "什么是 RAG？",
          "created_at": "2026-07-06T10:00:00+00:00",
          "metadata": {}
        },
        {
          "message_id": "msg_2",
          "role": "assistant",
          "content": "RAG 是……",
          "created_at": "2026-07-06T10:00:03+00:00",
          "metadata": {
            "sources": [
              {"source_path": "data/rag.md", "chunk_id": "doc_x:0001"}
            ],
            "confidence": "high"
          }
        }
      ]
    }
  }
}
```

## 4. 类与接口设计

```python
class ChatEngine:
    def __init__(self, storage_path: str, max_history_turns: int = 10):
        ...

    # Conversation lifecycle
    def create_conversation(self, title: str = "新对话", **metadata) -> Conversation: ...
    def switch_conversation(self, conversation_id: str) -> bool: ...
    def delete_conversation(self, conversation_id: str) -> bool: ...
    def rename_conversation(self, conversation_id: str, title: str) -> bool: ...
    def list_conversations(self) -> list[dict]: ...

    # Message lifecycle
    def add_user_message(self, content: str, **metadata) -> Message: ...
    def add_assistant_message(self, content: str, **metadata) -> Message: ...
    def get_history(self, conversation_id: str | None = None, max_turns: int | None = None) -> list[dict]: ...
    def clear_history(self, conversation_id: str | None = None) -> None: ...

    # Persistence
    def load(self) -> None: ...
    def save(self) -> None: ...
```

## 5. 对话历史裁剪策略

### 5.1 MVP：最近 N 轮

`max_history_turns=10` 表示最多保留最近 10 个用户-助手回合注入 LLM。

注意：存储文件中保存完整历史，裁剪只影响传给 LLM 的上下文。

```python
def get_history(max_turns):
    messages = current_conversation.messages
    return [m.to_llm_message() for m in messages[-max_turns * 2:]]
```

### 5.2 P1：摘要压缩

当对话超过 N 轮时，可以维护 `conversation.metadata["summary"]`：

- 用 LLM 对早期对话生成摘要。
- prompt 中注入摘要 + 最近 N 轮。
- 摘要需要明确“用户偏好、已确认事实、未解决问题”。

MVP 不强制实现摘要，但数据结构应允许扩展。

## 6. 自动标题策略

MVP 使用第一条用户消息生成标题：

- 去除换行。
- 截取前 20-30 个字符。
- 如果为空则保留“新对话”。

P1 可用 LLM 总结标题，但不是必要能力。

## 7. 持久化一致性

### 7.1 原子写入

直接覆盖 JSON 文件可能在程序崩溃时写坏。建议：

1. 写入临时文件 `chat_history.json.tmp`。
2. `flush` 后关闭。
3. 使用 `replace` 原子替换正式文件。

```python
def save(self):
    tmp = self.storage_path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(self.storage_path)
```

### 7.2 加载失败处理

- JSON 不存在：创建默认会话。
- JSON 损坏：备份为 `.broken`，创建新文件，并在 UI 提示。
- 版本不兼容：执行迁移或提示用户。

## 8. 并发与 Streamlit 注意事项

Streamlit 单用户本地使用时并发压力较小，但仍需注意：

- `ChatEngine` 实例放在 `st.session_state` 中。
- 每次添加助手消息后保存，避免中途刷新丢失。
- 用户消息添加后也建议保存；如果 LLM 生成失败，历史中仍可看到失败前的问题。
- 删除当前会话后要自动切换到其他会话或创建新会话。

## 9. 隐私与安全

对话历史可能包含用户私密信息：

- 默认只写本地 `storage/chat_history.json`。
- 不应把对话历史写入日志。
- UI 提供“清空当前对话”和“删除所有历史”的明确操作。
- 如果未来支持导出，导出前应提示包含敏感内容。

## 10. UI 需要的接口返回

`list_conversations()` 返回：

```python
[
    {
        "id": "conv_abc",
        "title": "什么是 RAG？",
        "message_count": 8,
        "created_at": "...",
        "updated_at": "...",
        "is_current": True,
        "last_message_preview": "RAG 是检索增强生成..."
    }
]
```

当前消息展示可以直接读取：

```python
chat_engine.current_conversation.messages
```

但 UI 不应修改该列表，只通过方法添加或删除。

## 11. 错误处理

| 场景 | 行为 |
| --- | --- |
| 切换不存在会话 | 返回 `False`，UI 提示会话不存在 |
| 删除最后一个会话 | 自动创建新会话 |
| 保存失败 | 返回/抛出可捕获异常，UI 提示“历史保存失败” |
| 加载 JSON 损坏 | 备份损坏文件并创建新历史 |
| 非法 role | 拒绝写入，抛出 `ValueError` |

## 12. 测试计划

| 测试 | 验证点 |
| --- | --- |
| 创建会话 | 默认 current_id 指向新会话 |
| 切换/删除 | 删除当前会话后 current_id 合法 |
| 添加消息 | updated_at 更新，消息顺序正确 |
| 历史裁剪 | 只返回最近 N 轮，不删除旧消息 |
| 持久化 | 保存后重新实例化可恢复历史 |
| 损坏文件 | 不崩溃，能备份并创建新历史 |
| 自动标题 | 第一条用户消息生成合理标题 |
| metadata | sources、metrics 能正确序列化/反序列化 |

## 13. 实施顺序

1. 定义 `Message` 和 `Conversation`。
2. 实现 `ChatEngine` 会话生命周期。
3. 实现消息添加、历史裁剪和自动标题。
4. 实现 JSON 原子保存与加载。
5. 增加损坏文件处理。
6. 与 Streamlit UI 集成。
7. 添加单元测试。
