# Ingest 模块 — `app/ingest.py` 详细设计

## 1. 模块定位

`IngestionEngine` 是 Co-Thinker 的知识库入口，负责把用户提供的文件变成可检索的知识单元。它不直接处理 UI，也不生成答案，只负责“读取 → 清洗 → 分块 → 元数据 → 向量化 → 入库 → 状态记录”。

MVP 必须重点保证：

- 支持 README 提到的 md、txt、代码文件批量导入。
- 可重复执行，避免重复写入相同文档。
- 文件更新、删除后索引状态一致。
- 每个 chunk 有稳定元数据，方便引用来源和调试检索质量。

## 2. 输入与输出

### 2.1 输入

- 本地目录：默认 `data/`。
- UI 上传后保存的文件路径。
- 可选元数据：标签、分类、知识库名称、用户备注。

### 2.2 输出

- ChromaDB 中的向量记录。
- 文档清单 `storage/document_manifest.json`。
- 可用于 BM25 的节点/文本快照。
- 导入结果统计：成功文件、跳过文件、失败文件、chunk 数、耗时。

## 3. 支持格式规划

### 3.1 MVP 格式（P0）

| 类型 | 扩展名 | 解析策略 | 备注 |
| --- | --- | --- | --- |
| Markdown | `.md`, `.mdx` | 按文本读取，保留标题结构 | 适合知识库文档 |
| 纯文本 | `.txt` | UTF-8 优先，失败后尝试常见编码 | 需要处理空文件 |
| Python | `.py` | 文本读取，保留代码 | 代码问答核心格式 |
| JavaScript/TypeScript | `.js`, `.jsx`, `.ts`, `.tsx` | 文本读取 | 保留符号和路径 |
| 其他代码 | `.java`, `.go`, `.rs`, `.cpp`, `.c`, `.h`, `.cs`, `.php`, `.rb` | 文本读取 | MVP 不做 AST 解析 |

### 3.2 增强格式（P1）

| 类型 | 扩展名 | 依赖 | 风险 |
| --- | --- | --- | --- |
| PDF | `.pdf` | `pypdf` / LlamaIndex reader | 扫描版 PDF 无法直接解析 |
| Word | `.docx` | `python-docx` | 表格提取可能不完整 |
| PowerPoint | `.pptx` | `python-pptx` | 顺序和备注需处理 |
| CSV | `.csv` | 内置 csv / pandas | 表格转文本策略影响召回 |
| JSON/YAML | `.json`, `.yaml`, `.yml` | 内置 json / pyyaml | 需要格式化为可读文本 |

## 4. 数据结构设计

### 4.1 导入结果

```python
from dataclasses import dataclass, field
from typing import Any

@dataclass
class FileIngestResult:
    path: str
    status: str  # "indexed" | "skipped" | "failed" | "deleted"
    document_id: str
    chunk_count: int = 0
    error: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

@dataclass
class IngestSummary:
    total_files: int
    indexed_files: int
    skipped_files: int
    failed_files: int
    total_chunks: int
    elapsed_ms: float
    results: list[FileIngestResult] = field(default_factory=list)
```

### 4.2 文档清单

`storage/document_manifest.json` 建议记录：

```json
{
  "version": 1,
  "documents": {
    "doc_abc123": {
      "document_id": "doc_abc123",
      "source_path": "data/guide.md",
      "file_name": "guide.md",
      "file_ext": ".md",
      "content_hash": "sha256:...",
      "mtime": 1783312345.123,
      "size_bytes": 12345,
      "chunk_count": 12,
      "tags": ["guide"],
      "status": "indexed",
      "created_at": "2026-07-06T10:00:00",
      "updated_at": "2026-07-06T10:05:00",
      "last_error": null
    }
  }
}
```

### 4.3 Chunk 元数据

每个 chunk 至少携带：

| 字段 | 说明 |
| --- | --- |
| `chunk_id` | 稳定 chunk ID，建议 `document_id:index` |
| `document_id` | 文件级唯一 ID |
| `source_path` | 相对路径，供 UI 展示与删除过滤 |
| `file_name` | 文件名 |
| `file_ext` | 扩展名 |
| `chunk_index` | 文件内块序号 |
| `chunk_count` | 文件总块数 |
| `content_hash` | 文件内容 hash |
| `tags` | 用户标签/分类 |
| `title_path` | Markdown 标题层级，若可提取 |

这些字段是引用来源、删除索引、过滤检索和排错的基础。

## 5. 类与接口设计

```python
class IngestionEngine:
    def __init__(self, settings, embedding_model, vector_store=None):
        self.settings = settings
        self.embedding_model = embedding_model
        self.vector_store = vector_store or self._create_vector_store()
        self.manifest = DocumentManifest(settings.storage_dir / "document_manifest.json")

    def scan_files(self, root_dir: str | None = None) -> list[Path]:
        """递归扫描支持的文件，排除隐藏目录、vectorstore、storage、.git 等。"""

    def add_files(self, file_paths: list[str], tags: list[str] | None = None) -> IngestSummary:
        """增量导入指定文件。"""

    def rebuild_index(self, force: bool = False) -> IngestSummary:
        """扫描 data_dir 并重建/增量更新索引。force=True 时先清空再全量构建。"""

    def delete_file(self, document_id_or_path: str, delete_source: bool = False) -> FileIngestResult:
        """从 ChromaDB 和 manifest 删除文档对应 chunks，可选删除源文件。"""

    def clear_index(self, clear_manifest: bool = True) -> None:
        """清空向量库和索引状态；默认保留源文档。"""

    def get_index_stats(self) -> dict:
        """返回文档数、chunk 数、失败数、最近更新时间、向量库路径。"""
```

辅助类：

```python
class DocumentManifest:
    def load(self) -> dict: ...
    def save(self) -> None: ...
    def upsert_document(self, record: dict) -> None: ...
    def mark_failed(self, path: str, error: str) -> None: ...
    def remove_document(self, document_id: str) -> None: ...
    def find_by_path(self, path: str) -> dict | None: ...
```

## 6. 导入算法

### 6.1 增量导入

1. 规范化路径，确认文件存在且格式受支持。
2. 计算 `content_hash = sha256(file_bytes)`。
3. 从 manifest 查询同路径记录：
   - hash 相同且状态为 `indexed`：跳过。
   - hash 不同：先删除旧 chunks，再重新导入。
   - 无记录：新导入。
4. 解析文件文本。
5. 清洗文本：去除不可见字符、统一换行、限制超大文件。
6. 分块并生成 `TextNode`。
7. 批量 embedding。
8. 写入 ChromaDB。
9. 更新 manifest。
10. 返回导入统计。

### 6.2 全量重建

`rebuild_index(force=True)`：

1. 清空 Chroma collection。
2. 清空 manifest 中的 indexed 状态。
3. 扫描 `data/`。
4. 对所有支持文件执行增量导入。
5. 重建 BM25 所需快照。

`force=False` 时只导入新增/变化文件，并检测 manifest 中已不存在的源文件，标记为 missing 或删除索引。

## 7. 分块策略

### 7.1 默认策略

- Markdown/自然语言文本：`SentenceSplitter(chunk_size=800, chunk_overlap=120)`。
- 代码文件：优先按空行、函数/类边界进行粗分；MVP 可先使用通用 splitter，但 metadata 中标注 `file_ext`，为后续代码分块保留接口。
- 表格/JSON：先转换为结构化文本，再按行/对象边界分块。

### 7.2 分块原则

- chunk 应尽量语义完整，不要把标题与正文分离。
- chunk 中保留必要标题路径，例如 `# 一级 > ## 二级`。
- overlap 不宜过大，否则成本和重复召回上升。
- 对超长代码文件要限制单文件最大 chunk 数，并在 UI 提示。

## 8. ChromaDB 写入策略

建议使用 `upsert` 语义：

- `ids`: 使用稳定 `chunk_id`。
- `documents`: chunk 文本。
- `embeddings`: embedding 结果。
- `metadatas`: 上文定义的 metadata。

删除文件时使用 `where={"document_id": document_id}` 删除所有 chunks。不要只按 `file_name` 删除，因为不同目录可能存在同名文件。

## 9. BM25 索引策略

MVP 有两种可选实现：

1. **运行时构建**：从 ChromaDB 读取所有 chunks，在应用启动或首次检索时构建 BM25。
   - 优点：简单，状态一致。
   - 缺点：文档多时启动慢。
2. **快照持久化**：导入后把节点文本和 metadata 序列化到 `storage/bm25/nodes.jsonl`，检索器按需加载。
   - 优点：可控、便于调试。
   - 缺点：需要维护额外文件。

MVP 建议先采用运行时构建；但 ingest 模块应提供 `export_nodes_for_bm25()`，为后续持久化留接口。

## 10. 异常处理

| 异常 | 处理方式 |
| --- | --- |
| 文件不存在 | 返回 failed，不中断整个批次 |
| 不支持格式 | 返回 skipped 或 failed，UI 提示 |
| 编码错误 | 尝试 fallback；仍失败则记录错误 |
| 解析器异常 | 记录到 manifest 的 `last_error` |
| Embedding 限流 | 指数退避重试，超过次数后批次失败 |
| ChromaDB 写入失败 | 不更新 manifest 为 indexed，保留错误 |
| 删除源文件失败 | 索引删除和源文件删除分别返回状态 |

导入应尽量“批次内局部失败”，即一个文件失败不影响其他文件。

## 11. UI 需要的状态接口

`get_index_stats()` 应返回：

```python
{
    "document_count": 10,
    "indexed_document_count": 8,
    "failed_document_count": 1,
    "missing_document_count": 1,
    "chunk_count": 235,
    "collection_name": "knowledge_base",
    "vectorstore_path": "vectorstore",
    "last_updated_at": "2026-07-06T10:05:00"
}
```

文档列表接口建议返回：

```python
def list_documents(self) -> list[dict]:
    """用于 UI 展示文件名、标签、状态、chunk 数、更新时间、错误。"""
```

## 12. 测试计划

| 测试 | 验证点 |
| --- | --- |
| 扫描文件 | 只返回支持格式，排除 `.git`、`vectorstore`、隐藏目录 |
| hash 去重 | 同一文件重复导入不会增加 chunk 数 |
| 文件更新 | 修改文件后旧 chunks 被删除，新 chunks 写入 |
| 删除文件 | 按 `document_id` 删除，不误删同名不同目录文件 |
| 元数据完整性 | 每个 chunk 有 `document_id`、`chunk_id`、`source_path` |
| 局部失败 | 一个坏文件不影响其他文件导入 |
| manifest 持久化 | 重启后仍能读取文档状态 |

## 13. 实施顺序

1. 实现 `DocumentManifest`。
2. 实现文件扫描、hash、格式判断和文本读取。
3. 实现 chunk 元数据生成。
4. 接入 embedding 和 ChromaDB upsert/delete。
5. 实现 `add_files()`、`rebuild_index()`、`delete_file()`。
6. 实现 `get_index_stats()` 和 `list_documents()`。
7. 增加单元测试和少量真实 fixture。
