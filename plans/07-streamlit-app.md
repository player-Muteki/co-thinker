# Streamlit 应用 — `app/streamlit_app.py` 详细设计

## 1. 模块定位

`streamlit_app.py` 是 Co-Thinker 的可视化交互入口，负责页面布局、用户操作、状态缓存和业务模块编排。它不应承载核心算法：文档导入、检索、生成和对话管理都应调用对应模块完成。

UI 的核心目标：

- 让用户可以快速导入文档并构建知识库。
- 让用户可以围绕知识库进行多轮问答。
- 让用户看见答案依据和检索来源。
- 让用户能理解系统状态：是否已配置 API Key、知识库是否为空、索引是否过期。

## 2. 页面结构

MVP 建议使用左侧边栏导航 + 主内容区。

```text
┌──────────────────────────────────────────────────────────────┐
│ Co-Thinker · 智能知识问答                                      │
├───────────────────────┬──────────────────────────────────────┤
│ Sidebar               │ Main                                 │
│                       │                                      │
│ 🧠 项目标题            │ 💬 对话问答页                         │
│ 💬 对话问答            │ 📄 文档管理页                         │
│ 📄 文档管理            │ ⚙️ 设置页                             │
│ ⚙️ 设置                │                                      │
│                       │                                      │
│ 当前知识库统计          │                                      │
│ 对话历史列表            │                                      │
└───────────────────────┴──────────────────────────────────────┘
```

## 3. 页面职责

| 页面 | 职责 |
| --- | --- |
| 对话问答 | 展示聊天历史、输入问题、执行检索和生成、显示引用来源 |
| 文档管理 | 上传文件、批量导入、重建索引、删除文档、展示导入状态 |
| 设置 | 配置 API Key、检索模式、top-k、生成参数，展示配置健康状态 |

## 4. Session State 设计

Streamlit 会频繁重渲染，所有长生命周期对象应放入 `st.session_state`。

| Key | 类型 | 说明 |
| --- | --- | --- |
| `settings` | `Settings` | 当前运行配置 |
| `ingest_engine` | `IngestionEngine` | 文档导入引擎 |
| `chat_engine` | `ChatEngine` | 会话管理引擎 |
| `retriever` | `HybridRetriever / None` | 检索器，文档变更后置空重建 |
| `generator` | `RAGGenerator / None` | 生成器，LLM 参数变更后置空重建 |
| `current_page` | `str` | `chat` / `docs` / `settings` |
| `retrieval_mode` | `str` | `hybrid` / `vector` / `bm25` |
| `runtime_overrides` | `dict` | UI 临时覆盖参数 |
| `last_ingest_summary` | `IngestSummary / None` | 最近导入结果，用于 UI 展示 |

## 5. 初始化流程

```python
def init_session_state():
    if st.session_state.get("initialized"):
        return

    settings = load_settings()
    ensure_directories(settings)

    st.session_state.settings = settings
    st.session_state.ingest_engine = create_ingestion_engine(settings)
    st.session_state.chat_engine = create_chat_engine(
        settings,
        storage_path=settings.storage_dir / "chat_history.json",
    )
    st.session_state.retriever = None
    st.session_state.generator = None
    st.session_state.current_page = "chat"
    st.session_state.retrieval_mode = "hybrid"
    st.session_state.runtime_overrides = {}
    st.session_state.initialized = True
```

注意：初始化阶段不应强制创建 LLM 或 embedding 客户端，否则用户没有配置 API Key 时页面无法打开。应在执行导入或问答前再校验对应 Key。

## 6. 对话问答页设计

### 6.1 页面元素

- 知识库状态卡片：文档数、chunk 数、失败数、最近更新时间。
- 检索模式选择：默认 hybrid。
- 聊天消息列表。
- `st.chat_input()` 问题输入。
- 引用来源 expander。
- 可选调试 expander：effective query、scores、matched_by、耗时。

### 6.2 问答流程

```text
用户输入问题
    │
    ├─ 检查知识库是否为空
    ├─ 检查 DeepSeek API Key 是否存在
    ├─ 添加用户消息并保存
    ├─ 获取 chat history
    ├─ 获取/创建 retriever
    ├─ retrieve(query, history, mode)
    ├─ 获取/创建 generator
    ├─ stream_generate(query, results, history)
    ├─ UI 实时渲染答案
    └─ 保存助手消息及 sources/metrics
```

### 6.3 空状态

如果知识库为空：

- 显示 warning：“知识库为空，请先导入文档”。
- 提供跳转/切换到文档管理页按钮。
- 可提供快速上传入口，但最终仍调用文档管理流程。

如果 API Key 缺失：

- 显示 error：“缺少 OPENAI_API_KEY / DEEPSEEK_API_KEY”。
- 提供设置页入口。
- 不展示堆栈或底层异常。

## 7. 文档管理页设计

### 7.1 页面元素

- 文件上传器：支持多文件。
- 标签/分类输入：可选。
- 导入按钮。
- 索引统计：总文档、已索引、失败、chunks。
- 文档列表：文件名、路径、类型、大小、chunk 数、状态、更新时间、错误。
- 操作按钮：删除、重建索引、清空索引。

### 7.2 导入流程

```text
用户上传文件
    │
    ├─ 保存到 data/（必要时处理重名）
    ├─ 调用 ingest_engine.add_files(saved_paths, tags)
    ├─ 展示每个文件 indexed/skipped/failed 状态
    ├─ retriever 置空，下一次问答时重建
    └─ 刷新文档列表与统计
```

### 7.3 文件重名策略

MVP 推荐：

- 如果目标路径不存在，直接保存。
- 如果已存在同名文件，默认覆盖前先提示。
- 或自动加后缀：`name (1).md`，避免误覆盖。

考虑到 Streamlit 交互复杂度，MVP 可先采用“自动加后缀”，并在导入结果中显示最终路径。

### 7.4 删除策略

删除操作分两步：

1. 从索引和 manifest 删除对应 `document_id`。
2. 用户勾选“同时删除源文件”时再删除 `data/` 下文件。

删除前应有确认，避免误删源文件。MVP 可用 checkbox + button 组合实现。

## 8. 设置页设计

### 8.1 配置项

- DeepSeek API Key（password 输入，仅内存保存）。
- OpenAI API Key（password 输入，仅内存保存）。
- 检索模式、Top-K、相似度阈值。
- Temperature、Max tokens、历史轮数。
- 显示当前配置健康状态。

### 8.2 保存行为

MVP 推荐：

- 保存后只更新当前 session 的 settings/runtime overrides。
- 不写入 `.env`。
- 提示：“设置仅对当前运行会话生效；如需持久化，请写入 `.env`。”
- 若修改了 embedding/API Key/检索参数，则清空 retriever 缓存。
- 若修改了 LLM/API Key/生成参数，则清空 generator 缓存。

## 9. 缓存与重建策略

| 事件 | 需要清理 |
| --- | --- |
| 新文档导入 | `retriever = None` |
| 删除文档 | `retriever = None` |
| 重建索引 | `retriever = None` |
| 修改 embedding key/model | `ingest_engine`、`retriever` |
| 修改 DeepSeek key/model/temperature | `generator` |
| 修改 top-k/similarity/mode | `retriever` 或 runtime 参数 |

不要把 ChromaDB 查询结果永久缓存；知识库更新后很容易过期。

## 10. 错误提示规范

| 场景 | UI 提示 |
| --- | --- |
| 知识库为空 | warning + 导入入口 |
| API Key 缺失 | error + 设置入口 |
| 文件解析失败 | 在导入结果表中逐文件显示错误 |
| Embedding 失败 | status 中显示失败批次，保留可重试按钮 |
| LLM 超时 | assistant 消息中显示友好错误，并保存 metadata.error |
| 索引损坏 | 提示重建索引 |

所有错误都应尽量给出“下一步怎么做”。

## 11. 用户体验细节

- 对长操作使用 `st.status()` 或 `st.spinner()`。
- 导入结果用表格展示，而不是只显示总数。
- 答案生成使用流式输出，末尾去掉光标符号。
- 引用来源默认折叠，点击后展开。
- 调试信息默认折叠，适合开发阶段打开。
- 清空索引、删除文件、删除会话等破坏性操作需要二次确认。

## 12. 入口与运行命令

建议运行：

```bash
streamlit run app/streamlit_app.py
```

`requirements.txt` 至少包含：

```text
streamlit
python-dotenv
llama-index
llama-index-llms-openai
llama-index-embeddings-openai
llama-index-vector-stores-chroma
llama-index-retrievers-bm25
chromadb
```

P1 格式支持再增加：

```text
pypdf
python-docx
python-pptx
pyyaml
```

## 13. 测试与验收

Streamlit UI 不需要过度单测，但应保证核心编排可验证：

| 验收项 | 方法 |
| --- | --- |
| 页面可启动 | `streamlit run` 无启动错误 |
| 空知识库提示 | 无文档时聊天页显示导入提示 |
| 文档导入 | 上传 `.md` 后文档数和 chunk 数增加 |
| 问答流程 | 输入问题后能看到流式答案和来源 |
| 会话切换 | 新建/切换会话后消息隔离 |
| 设置覆盖 | 修改 top-k 后下一次检索使用新参数 |
| 删除文档 | 删除后引用来源不再出现该文档 |

## 14. 实施顺序

1. 搭建页面框架和 `init_session_state()`。
2. 实现 sidebar 导航和知识库状态卡片。
3. 实现文档管理页：上传、导入、列表、统计。
4. 实现对话页：消息展示、输入、检索、流式生成、保存历史。
5. 实现设置页：运行时参数覆盖和健康检查。
6. 加入错误处理、引用来源和调试信息。
7. 手动跑通 MVP 验收流程。
