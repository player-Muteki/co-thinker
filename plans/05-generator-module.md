# Generator 模块 — `app/generator.py` 详细设计

## 1. 模块定位

`RAGGenerator` 负责把“用户问题 + 对话历史 + 检索结果”组装为可靠的 RAG prompt，并调用大模型生成答案。它的核心目标不是让模型自由发挥，而是约束模型基于知识库上下文回答，并清晰标注来源。

它不负责检索、不负责保存对话，也不直接处理 Streamlit UI；这些由 retriever、chat_engine 和 streamlit_app 负责。

## 2. 设计目标

1. **事实约束**：答案必须基于检索上下文，不能编造知识库中没有的信息。
2. **来源可追溯**：答案和引用来源能对应到文件与 chunk。
3. **多轮连贯**：合理注入最近对话历史，但不让历史挤占检索上下文。
4. **成本可控**：控制 prompt 长度、top-k 和输出 token。
5. **用户体验**：支持流式输出、低置信度提示和友好的错误信息。

## 3. 输入与输出

### 3.1 输入

- `query`: 当前用户问题。
- `retrieval_results`: 检索模块返回的结果集合。
- `chat_history`: 最近 N 轮对话历史。
- 可选运行参数：语言、回答风格、是否显示引用、是否流式。

### 3.2 输出

```python
from dataclasses import dataclass, field
from typing import Any

@dataclass
class SourceReference:
    source_path: str
    file_name: str
    chunk_id: str
    score: float
    snippet: str
    metadata: dict[str, Any] = field(default_factory=dict)

@dataclass
class GenerationResult:
    answer: str
    references: list[SourceReference]
    finish_reason: str
    elapsed_ms: float
    input_tokens: int = 0
    output_tokens: int = 0
    confidence: str = "unknown"  # none/low/medium/high
    error: str | None = None
```

## 4. 类与接口设计

```python
class RAGGenerator:
    def __init__(self, settings, llm, prompt_template: str | None = None):
        self.settings = settings
        self.llm = llm
        self.prompt_template = prompt_template or DEFAULT_RAG_SYSTEM_PROMPT

    def generate(
        self,
        query: str,
        retrieval_results,
        chat_history: list[dict] | None = None,
    ) -> GenerationResult:
        """同步生成完整答案。"""

    def stream_generate(
        self,
        query: str,
        retrieval_results,
        chat_history: list[dict] | None = None,
    ):
        """流式生成，yield 文本片段，最终由调用方保存完整答案。"""

    def build_messages(
        self,
        query: str,
        retrieval_results,
        chat_history: list[dict] | None = None,
    ) -> list[dict]:
        """组装 chat completion messages。"""

    def extract_references(self, retrieval_results) -> list[SourceReference]:
        """把检索结果转换为引用来源。"""
```

## 5. Prompt 设计

### 5.1 系统提示词

```text
你是 Co-Thinker，一个面向特定领域知识库的问答助手。

你必须遵守以下规则：
1. 只能基于 <context> 中提供的知识库片段回答。
2. 如果 <context> 没有足够信息，明确说“知识库中未找到足够信息”，不要编造。
3. 回答中涉及事实、结论、步骤或代码说明时，应引用来源编号，例如 [1]、[2]。
4. 如果多个片段互相矛盾，指出矛盾并分别列出来源。
5. 对代码、配置名、文件路径保持原样，不要翻译或改写。
6. 默认使用中文回答，除非用户明确要求其他语言。
7. 保持结构清晰：先直接回答，再列出依据或步骤。
```

### 5.2 用户消息结构

```text
<context>
[1]
source: data/guide.md
chunk_id: doc_abc123:0001
content:
...

[2]
source: data/config.md
chunk_id: doc_def456:0003
content:
...
</context>

<chat_history>
用户: ...
助手: ...
</chat_history>

<question>
当前问题
</question>
```

### 5.3 为什么引用编号而不是只引用文件名

- 同一文件可能有多个片段，引用编号能对应到具体 chunk。
- 文件名可在答案末尾汇总展示，编号可在正文中精确定位。
- UI 可以将编号映射回 `SourceReference`。

## 6. 消息组装策略

建议使用 chat messages，而不是把所有内容塞进 `complete(prompt=...)`：

```python
def build_messages(query, retrieval_results, chat_history=None):
    context = retrieval_results.to_context_text(
        token_budget=settings.context_token_budget
    )
    history = format_history(chat_history, settings.max_history_turns)

    system = DEFAULT_RAG_SYSTEM_PROMPT
    user = USER_PROMPT_TEMPLATE.format(
        context=context,
        chat_history=history,
        question=query,
    )

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
```

不要再把完整 `chat_history` 原样作为多条 messages 追加一遍，否则历史会重复出现；要么放在 `<chat_history>` 中，要么作为 messages 注入，二选一。MVP 建议统一格式化到 user prompt 中，便于控制长度。

## 7. 上下文预算

RAG 生成最容易出问题的是上下文太长。建议按优先级控制：

1. 系统提示词：固定保留。
2. 当前问题：必须保留。
3. 检索上下文：最高优先级，按检索排序截断。
4. 对话历史：只保留最近 N 轮；如仍超长，进一步压缩。

MVP 可用字符数近似 token：中文 1 字约 1 token，英文 4 字符约 1 token。P1 再引入 tokenizer 精确计算。

`to_context_text(token_budget)` 行为：

- 按结果排序依次加入。
- 单个 chunk 过长时截断并标记 `[内容已截断]`。
- 保证每个 chunk 的 source 和 chunk_id 不被截断。

## 8. 无检索结果处理

当 `retrieval_results.results` 为空时，不建议调用 LLM。直接返回固定结果：

```text
知识库中未找到与该问题相关的足够信息。

你可以尝试：
1. 换用更具体的关键词。
2. 检查相关文档是否已导入。
3. 在文档管理页重新构建索引。
```

当结果低置信度时，可以调用 LLM，但 prompt 中增加约束：

```text
注意：以下检索结果相关性较低。请谨慎回答；如果依据不足，请明确说明。
```

## 9. 流式输出设计

`stream_generate()` 建议只 yield 文本片段，并由 UI 负责收集完整答案：

```python
full_answer = ""
for delta in generator.stream_generate(query, results, history):
    full_answer += delta
    placeholder.markdown(full_answer + "▌")
chat_engine.add_assistant_message(full_answer, sources=...)
```

流式函数应处理：

- LLM 客户端不支持流式时回退到同步生成。
- 中途异常时 yield 一个友好错误并返回。
- 不在 generator 内部保存对话，避免职责混乱。

## 10. 引用来源提取

`extract_references()` 应从检索结果生成去重引用列表：

去重策略：

- 正文引用按 chunk 保留。
- UI 来源列表可按文件去重，并展开显示 chunks。

引用字段：

```python
SourceReference(
    source_path=result.source_path,
    file_name=result.file_name,
    chunk_id=result.chunk_id,
    score=result.final_score,
    snippet=result.text[:200],
    metadata=result.metadata,
)
```

## 11. 错误处理

| 错误 | 返回策略 |
| --- | --- |
| DeepSeek API Key 缺失 | 返回配置错误提示，指导用户到设置页或 `.env` 配置 |
| API 超时 | 返回“模型服务超时，请稍后重试” |
| 限流 | 返回“请求过于频繁”，建议稍后重试 |
| prompt 过长 | 自动减少历史/上下文；仍失败则提示减少 top-k 或历史 |
| LLM 返回空内容 | 返回友好错误并保留检索来源 |
| 流式中断 | UI 显示已生成内容和中断说明 |

## 12. 参数建议

| 参数 | MVP 默认 | 理由 |
| --- | --- | --- |
| `temperature` | `0.2` | RAG 问答强调确定性，不宜太发散 |
| `max_tokens` | `2048` | 足够回答大多数问题，控制成本 |
| `context_token_budget` | `6000` | 给检索上下文足够空间 |
| `max_history_turns` | `10` | 多轮对话够用，避免挤占上下文 |

## 13. 输出格式建议

常规回答：

```markdown
简要答案……[1]

依据：
- 关键点 A，来自 [1]
- 关键点 B，来自 [2]

引用来源：
[1] data/guide.md
[2] data/config.md
```

无足够依据：

```markdown
知识库中未找到足够信息回答这个问题。

我检索到的片段只涉及……，没有包含……。
```

冲突信息：

```markdown
知识库中存在不一致信息：

- [1] 中说明……
- [2] 中说明……

建议以更新时间较新的文档或人工确认为准。
```

## 14. 测试计划

| 测试 | 验证点 |
| --- | --- |
| 无结果 | 不调用 LLM，直接返回固定无结果提示 |
| prompt 组装 | 包含 context、history、question，且不重复历史 |
| 引用提取 | 按 chunk 提取引用，source_path/chunk_id 完整 |
| 低置信度 | prompt 中包含谨慎提示 |
| 流式回退 | LLM 不支持 stream 时仍能返回答案 |
| API 异常 | 返回用户可读错误，不泄露 API Key |
| 上下文截断 | 超长 chunk 被截断但保留来源信息 |

## 15. 实施顺序

1. 定义 `SourceReference` 和 `GenerationResult`。
2. 编写默认 system prompt 与 user prompt 模板。
3. 实现 `build_messages()` 和历史格式化。
4. 实现无结果/低置信度分支。
5. 接入 LLM 同步生成。
6. 接入流式生成。
7. 实现引用提取和输出来源映射。
8. 添加 generator 单元测试。
