# 实施路线图 — MVP 到增强版

## 1. 路线图目标

本文把架构与模块设计转换为可执行的开发计划。目标是避免“只写方案、不知道下一步做什么”，让 Co-Thinker 可以按阶段逐步交付：先跑通最小 RAG 闭环，再增强文档管理、检索质量、测试和运维能力。

README 定义的能力包括：

- 多格式文档批量导入和知识库管理。
- 语义检索与关键信息提取。
- RAG 答案生成。
- 多轮对话上下文管理。
- 可视化交互界面。

路线图围绕这些能力拆分为 5 个里程碑。

## 2. 里程碑总览

| 里程碑 | 目标 | 核心产物 | 建议优先级 |
| --- | --- | --- | --- |
| M0：项目骨架 | 建立可运行 Python/Streamlit 项目 | 依赖、目录、配置、启动入口 | P0 |
| M1：知识库导入 | 支持 md/txt/代码文件导入并写入向量库 | `config.py`、`app/ingest.py` | P0 |
| M2：检索与生成闭环 | 用户提问后可检索并生成带来源答案 | `app/retriever.py`、`app/generator.py` | P0 |
| M3：多轮对话与 UI | 支持会话历史、文档管理、设置页 | `app/chat_engine.py`、`app/streamlit_app.py` | P0 |
| M4：质量与可运维 | 测试、错误处理、评测、文档完善 | `tests/`、日志、验收用例 | P1 |

## 3. M0：项目骨架

### 3.1 目标

让项目可以被新开发者克隆后快速启动，并具备清晰目录结构。

### 3.2 任务清单

- [ ] 创建 `requirements.txt`。
- [ ] 创建 `.env.example`。
- [ ] 确认 `.gitignore` 排除：`.env`、`data/`、`vectorstore/`、`storage/`、`__pycache__/`。
- [ ] 创建 `app/` 包和 `tests/` 目录。
- [ ] 创建 Streamlit 空页面入口。
- [ ] 在 README 中补充本地启动命令。

### 3.3 推荐依赖

```text
streamlit
python-dotenv
llama-index
llama-index-llms-openai
llama-index-embeddings-openai
llama-index-vector-stores-chroma
llama-index-retrievers-bm25
chromadb
pytest
```

P1 再增加：

```text
pypdf
python-docx
python-pptx
pyyaml
jieba
```

### 3.4 验收标准

- 执行 `streamlit run app/streamlit_app.py` 能打开页面。
- 无 `.env` 时页面可启动，并提示缺失配置而不是崩溃。
- 项目目录中没有把本地数据或密钥加入 Git。

## 4. M1：知识库导入

### 4.1 目标

实现从本地文件到 ChromaDB 的可重复导入流程。

### 4.2 任务清单

- [ ] 实现 `Settings`、`load_settings()`、`ensure_directories()`。
- [ ] 实现 embedding 客户端初始化。
- [ ] 实现 `DocumentManifest`。
- [ ] 实现文件扫描和格式过滤。
- [ ] 实现 md/txt/代码文件读取。
- [ ] 实现 hash 去重。
- [ ] 实现 chunk 分块和 metadata 生成。
- [ ] 实现 ChromaDB upsert。
- [ ] 实现按 `document_id` 删除 chunks。
- [ ] 实现 `get_index_stats()` 和 `list_documents()`。

### 4.3 关键实现要求

- `document_id` 以路径或 hash 稳定生成，但文件内容变化时仍能找到旧记录并替换。
- 每个 chunk 的 metadata 必须包含：`chunk_id`、`document_id`、`source_path`、`file_name`、`file_ext`、`chunk_index`。
- 重复导入同一未变化文件时，chunk 数不能重复增长。
- 单文件失败不能导致整个批次失败。

### 4.4 验收标准

- 导入 1 个 `.md` 文件后，ChromaDB chunk 数增加。
- 再次导入同一文件时返回 skipped。
- 修改文件后重新导入，旧 chunks 被替换。
- 删除文件索引后，检索结果不再包含该文件。

## 5. M2：检索与生成闭环

### 5.1 目标

用户输入问题后，系统能从知识库检索相关片段，并生成带来源的答案。

### 5.2 任务清单

- [ ] 定义 `RetrievalResult` 和 `RetrievalResults`。
- [ ] 实现向量检索。
- [ ] 实现 BM25 检索。
- [ ] 实现基于 `chunk_id` 的 RRF 融合。
- [ ] 实现检索结果上下文格式化。
- [ ] 定义 `SourceReference` 和 `GenerationResult`。
- [ ] 实现 prompt 模板和 `build_messages()`。
- [ ] 实现无检索结果直接返回提示。
- [ ] 接入 DeepSeek Chat 生成。
- [ ] 实现流式生成。

### 5.3 关键实现要求

- RRF 去重必须基于 `chunk_id`，不能基于 Python 对象 ID。
- Prompt 中必须保留 source 和 chunk 编号。
- 无检索结果时不调用 LLM，避免编造和浪费成本。
- 生成答案应包含来源编号或来源汇总。

### 5.4 验收标准

- 问一个文档中明确存在的问题，答案引用正确文件。
- 问一个知识库没有的问题，系统明确说明没有足够信息。
- 问代码符号或文件名时，BM25 能提供有效补充。
- 开启流式输出时 UI 能逐步显示答案。

## 6. M3：多轮对话与 UI

### 6.1 目标

完成用户可实际使用的 Streamlit 应用：文档管理、对话问答、设置和历史会话。

### 6.2 任务清单

- [ ] 实现 `Message`、`Conversation`、`ChatEngine`。
- [ ] 实现 JSON 原子持久化。
- [ ] 实现会话新建、切换、删除、重命名。
- [ ] 实现最近 N 轮历史注入。
- [ ] 实现 Streamlit sidebar 导航。
- [ ] 实现文档管理页。
- [ ] 实现对话问答页。
- [ ] 实现设置页。
- [ ] 实现引用来源展示和调试信息展示。
- [ ] 实现破坏性操作确认。

### 6.3 关键实现要求

- Streamlit 初始化不应强制要求 API Key，避免页面无法打开。
- 导入文档或删除文档后，应清空 retriever 缓存。
- 修改模型参数或 API Key 后，应清空 generator/retriever 缓存。
- 用户消息和助手消息都应保存，生成失败也要有可见记录或错误提示。

### 6.4 验收标准

- 可以在 UI 上传文档并看到导入结果。
- 可以提问并看到答案、来源和耗时。
- 可以新建多个会话并切换，消息互不混淆。
- 重启应用后，对话历史仍存在。

## 7. M4：质量、测试与可运维

### 7.1 目标

让 MVP 不只是能跑，而是能维护、能调试、能回归验证。

### 7.2 任务清单

- [ ] 为 config/ingest/retriever/generator/chat_engine 增加单元测试。
- [ ] 增加 fixtures：短 markdown、代码文件、空文件、坏编码文件。
- [ ] 增加手动验收脚本或清单。
- [ ] 增加日志：导入耗时、检索耗时、生成耗时、错误原因。
- [ ] 增加 `.env.example` 和 README 运行说明。
- [ ] 增加常见问题排查文档。
- [ ] 定义小型 RAG 评测集，验证来源和回答质量。

### 7.3 验收标准

- `pytest` 能通过核心模块测试。
- 任何单文件导入失败都能在 UI 和日志中定位原因。
- 可以通过固定问题集检查检索是否退化。
- README 足够让新用户按步骤启动应用。

## 8. 推荐开发顺序

建议按“纵向闭环优先”实现，而不是一次性做完某个复杂模块：

1. 最小配置 + 空 Streamlit 页面。
2. 导入一个 `.md` 文件到 ChromaDB。
3. 对这个文件执行向量检索。
4. 把检索结果交给 DeepSeek 生成答案。
5. 在 UI 中跑通上传、提问、展示答案。
6. 再补 BM25、manifest、删除、会话、多格式和测试。

这样可以尽早发现依赖、API 和版本兼容问题。

## 9. 风险优先级

| 风险 | 优先处理阶段 | 处理方式 |
| --- | --- | --- |
| LlamaIndex/Chroma 版本 API 不兼容 | M0/M1 | 锁定依赖版本并先做最小样例 |
| DeepSeek OpenAI 兼容参数差异 | M2 | 单独封装 `get_llm()`，写 smoke test |
| 文档重复导入导致重复答案 | M1 | manifest + hash 去重 |
| 检索命中不准 | M2/M4 | 混合检索 + 小型评测集 |
| UI 状态重渲染丢失 | M3 | `st.session_state` 统一管理 |
| 密钥误提交 | M0 | `.gitignore` + `.env.example` |

## 10. 最小可演示场景

MVP demo 应支持以下脚本：

1. 启动应用。
2. 在文档管理页上传 `sample.md`。
3. UI 显示导入成功，chunk 数 > 0。
4. 在聊天页询问 `sample.md` 中的一个事实。
5. 系统流式回答，并展示来源为 `sample.md`。
6. 继续追问“它有什么优点？”系统结合上文回答。
7. 新建会话后历史为空。
8. 重启应用后旧会话仍可打开。
