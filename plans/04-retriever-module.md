# Retriever 模块 — `app/retriever.py` 详细设计

## 1. 模块定位

`HybridRetriever` 是 Co-Thinker 的检索核心，负责把用户问题转化为一组高质量、可解释、可注入 prompt 的上下文片段。它不解析文档、不调用最终生成模型回答问题，只负责召回、融合、过滤、排序和格式化检索结果。

检索模块需要同时满足：

- 语义相关：能找到“表达不同但含义相近”的片段。
- 关键词精确：能找到代码符号、专有名词、文件名、配置项。
- 多轮追问：能根据历史对省略式问题做查询补全。
- 可解释：返回每个片段来自哪种检索路径、原始分数和融合分数。

## 2. 检索策略总览

MVP 默认使用混合检索：

```text
用户问题 + 对话历史
    │
    ▼
查询预处理 / 可选查询改写
    │
    ├── 向量召回：embedding(query) -> ChromaDB similarity search
    │
    ├── BM25 召回：关键词/代码符号匹配
    │
    ▼
候选归一化与去重
    │
    ▼
RRF 融合排序
    │
    ▼
阈值过滤 + top-k 截断 + 上下文格式化
```

## 3. 数据结构设计

### 3.1 单条结果

```python
from dataclasses import dataclass, field
from typing import Any

@dataclass
class RetrievalResult:
    chunk_id: str
    document_id: str
    text: str
    source_path: str
    file_name: str
    metadata: dict[str, Any] = field(default_factory=dict)

    # Scores
    vector_score: float | None = None
    bm25_score: float | None = None
    rrf_score: float | None = None
    final_score: float = 0.0

    # Explainability
    matched_by: list[str] = field(default_factory=list)  # ["vector", "bm25"]
    rank_details: dict[str, int] = field(default_factory=dict)
```

### 3.2 结果集合

```python
@dataclass
class RetrievalResults:
    original_query: str
    effective_query: str
    results: list[RetrievalResult]
    mode: str
    total_candidates: int
    elapsed_ms: float
    filters: dict[str, Any] = field(default_factory=dict)

    def top_k(self, k: int) -> list[RetrievalResult]: ...
    def to_context_text(self, token_budget: int | None = None) -> str: ...
    def to_sources(self) -> list[dict]: ...
```

## 4. 类与接口设计

```python
class HybridRetriever:
    def __init__(
        self,
        settings,
        vector_store,
        embedding_model,
        bm25_retriever=None,
        query_rewriter=None,
    ):
        ...

    def retrieve(
        self,
        query: str,
        chat_history: list[dict] | None = None,
        mode: str = "hybrid",
        top_k: int | None = None,
        filters: dict | None = None,
    ) -> RetrievalResults:
        """统一检索入口。"""

    def vector_retrieve(self, query: str, candidate_k: int, filters: dict | None = None) -> list[RetrievalResult]:
        """向量召回。"""

    def bm25_retrieve(self, query: str, candidate_k: int, filters: dict | None = None) -> list[RetrievalResult]:
        """关键词召回。"""

    def fuse_results(
        self,
        vector_results: list[RetrievalResult],
        bm25_results: list[RetrievalResult],
    ) -> list[RetrievalResult]:
        """RRF 融合与去重。"""
```

## 5. 查询预处理

### 5.1 MVP 预处理

不额外调用 LLM，先做轻量规则：

- 去除首尾空白。
- 合并连续空白字符。
- 保留代码符号，如 `_`、`.`、`::`、`/`。
- 如果用户问题过短但历史存在，拼接最近一轮用户问题作为上下文提示，例如：
  - 历史：“介绍一下向量检索流程”
  - 当前：“它有哪些参数？”
  - effective query：“向量检索流程 它有哪些参数？”

### 5.2 P1 查询改写

引入 LLM 查询改写器：

```python
class QueryRewriter:
    def rewrite(self, query: str, chat_history: list[dict]) -> str:
        """把省略、多轮追问改写为独立完整问题。"""
```

改写要求：

- 不回答问题，只改写。
- 不引入历史中没有的新实体。
- 对代码符号保持原样。
- 改写失败时回退原始 query。

## 6. 向量检索实现要点

1. 使用 embedding 模型把 `effective_query` 转成向量。
2. 调用 ChromaDB / LlamaIndex vector store 查询。
3. 候选数使用 `settings.retrieval_candidate_k`，不要只取最终 top-k，否则融合空间不足。
4. 应保留：`chunk_id`、`document_id`、`metadata`、相似度分数。
5. 对相似度低于 `similarity_cutoff` 的结果进行过滤，但不要过早过滤到 0；若结果为空，可降低阈值或进入无结果提示。

## 7. BM25 检索实现要点

BM25 用来补足：

- 专有名词：如 `DeepSeek`、`ChromaDB`。
- 代码符号：如 `create_retriever`、`Settings.TOP_K`。
- 文件路径：如 `app/ingest.py`。

中文文档中，BM25 效果受分词影响。MVP 可先使用 LlamaIndex BM25 默认实现；P1 可考虑：

- 使用 `jieba` 对中文分词。
- 对代码 token 使用正则分词：驼峰、下划线、路径分隔符。
- 构建字段加权 BM25：标题、路径、正文不同权重。

## 8. RRF 融合算法

RRF（Reciprocal Rank Fusion）适合融合不同分数体系的排序结果，因为它主要依赖排名而不是原始分数。

公式：

```text
score(d) = Σ weight(source) * 1 / (rrf_k + rank_source(d))
```

其中：

- `rrf_k` 默认 60。
- `rank_source(d)` 从 1 开始。
- `weight(vector)` 默认 0.55。
- `weight(bm25)` 默认 0.45。

去重 key 必须使用 `chunk_id`，不能使用 Python `id(result)`，也不建议只用文本内容；同文本可能来自不同文件，Python 对象 id 又无法识别同一 chunk。

融合伪代码：

```python
def fuse_results(vector_results, bm25_results):
    merged = {}

    for rank, result in enumerate(vector_results, start=1):
        item = merged.setdefault(result.chunk_id, result)
        item.vector_score = result.vector_score
        item.matched_by.append("vector")
        item.rank_details["vector"] = rank
        item.rrf_score = (item.rrf_score or 0) + vector_weight / (rrf_k + rank)

    for rank, result in enumerate(bm25_results, start=1):
        item = merged.setdefault(result.chunk_id, result)
        item.bm25_score = result.bm25_score
        item.matched_by.append("bm25")
        item.rank_details["bm25"] = rank
        item.rrf_score = (item.rrf_score or 0) + bm25_weight / (rrf_k + rank)

    results = list(merged.values())
    for item in results:
        item.final_score = item.rrf_score or item.vector_score or item.bm25_score or 0
    return sorted(results, key=lambda x: x.final_score, reverse=True)
```

## 9. 过滤与上下文预算

检索结果进入生成前需要控制数量和长度：

1. 先按 `final_score` 排序。
2. 去除过短、空文本、重复 chunk。
3. 应用用户过滤条件：标签、文件类型、目录、知识库。
4. 取 `top_k`。
5. 在 `to_context_text()` 中按 token/字符预算截断。

上下文格式建议：

```text
[chunk: 1]
source: data/guide.md
chunk_id: doc_abc123:0004
score: 0.0312
content:
...
```

这样 generator 可以更稳定地引用来源。

## 10. 检索模式

| 模式 | 行为 | 适用场景 |
| --- | --- | --- |
| `vector` | 只执行向量检索 | 概念性、同义表达问题 |
| `bm25` | 只执行关键词检索 | 代码符号、文件名、专有名词 |
| `hybrid` | 向量 + BM25 + RRF | 默认推荐 |

UI 中可以暴露模式选择；如果用户不理解，默认使用 `hybrid`。

## 11. 无结果与低置信度处理

`retrieve()` 不直接生成“我不知道”，但应通过结果状态给 generator 明确信号：

- `results=[]`：完全无结果。
- `results` 非空但 `final_score` 很低：低置信度。
- 命中结果集中于单一弱相关文件：提示可能不完整。

可在 `RetrievalResults` 中增加：

```python
@property
def confidence(self) -> str:
    return "none" | "low" | "medium" | "high"
```

## 12. 可观测性与调试

检索结果应可在 UI 的“调试/引用来源”区域展示：

- effective query。
- 检索模式。
- 总候选数和耗时。
- 每个结果的文件名、chunk_id、vector_score、bm25_score、rrf_score、matched_by。

这对调参和排查“为什么回答不对”非常关键。

## 13. 测试计划

| 测试 | 验证点 |
| --- | --- |
| RRF 去重 | 同一 `chunk_id` 同时被 vector 和 bm25 命中时只保留一条 |
| RRF 排序 | 排名靠前且多路命中的结果 final_score 更高 |
| BM25 回退 | 无 embedding 或 vector 失败时 bm25 模式仍可用 |
| 空知识库 | 返回空结果，不抛未处理异常 |
| filters | 按文件类型、标签过滤正确 |
| 上下文格式化 | 输出包含 source、chunk_id、content |
| 多轮 query | 短追问能结合历史形成 effective query |

## 14. 实施顺序

1. 定义 `RetrievalResult` 和 `RetrievalResults`。
2. 实现轻量查询预处理。
3. 实现 vector retrieval。
4. 实现 BM25 retrieval。
5. 实现基于 `chunk_id` 的 RRF 融合。
6. 实现过滤、上下文格式化和 confidence。
7. 在 Streamlit UI 中展示引用来源和调试信息。
8. 添加检索模块单元测试。
