# Config 模块 — `config.py` 详细设计

## 1. 模块定位

`config.py` 是 Co-Thinker 的配置与客户端初始化入口，目标是让其他模块只依赖一个稳定的配置对象，而不是在各处直接读取环境变量。

它需要解决四类问题：

1. **配置集中化**：API Key、模型名、路径、分块、检索、生成、对话和日志参数统一管理。
2. **配置可校验**：启动时尽早发现缺失的 API Key、非法数值、不可写目录等问题。
3. **客户端可复用**：统一创建 DeepSeek LLM 客户端和 embedding 客户端，避免重复初始化。
4. **安全默认值**：敏感信息不打印、不提交、不写入对话历史。

## 2. 配置来源与优先级

配置优先级从低到高：

1. 代码内默认值。
2. `.env` 文件。
3. 操作系统环境变量。
4. Streamlit 当前会话临时覆盖值（仅运行时有效，重启失效）。

MVP 建议只把 `.env` 和环境变量作为持久配置来源；UI 设置页只更新 `st.session_state` 和必要的运行时对象，不自动覆盖 `.env`，避免把密钥写入磁盘。

## 3. 配置分组

| 分组 | 配置项 | 示例值 | 说明 |
| --- | --- | --- | --- |
| API | `DEEPSEEK_API_KEY` | `sk-...` | DeepSeek Chat API Key |
| API | `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | OpenAI 兼容接口地址 |
| API | `OPENAI_API_KEY` | `sk-...` | OpenAI embedding API Key |
| Model | `DEEPSEEK_MODEL` | `deepseek-chat` | 答案生成模型 |
| Model | `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | 向量模型 |
| Path | `DATA_DIR` | `data` | 源文档目录 |
| Path | `VECTORSTORE_DIR` | `vectorstore` | ChromaDB 持久化目录 |
| Path | `STORAGE_DIR` | `storage` | manifest、BM25、对话历史等本地状态 |
| Ingest | `CHUNK_SIZE` | `800` | 文档分块大小，建议按 token/字符近似控制 |
| Ingest | `CHUNK_OVERLAP` | `120` | 相邻块重叠，提升跨段落召回 |
| Ingest | `EMBED_BATCH_SIZE` | `32` | embedding 批处理大小 |
| Retrieval | `TOP_K` | `5` | 最终进入 prompt 的结果数 |
| Retrieval | `RETRIEVAL_CANDIDATE_K` | `20` | 融合前每路召回候选数 |
| Retrieval | `SIMILARITY_CUTOFF` | `0.25` | 向量结果最低相似度 |
| Retrieval | `RRF_K` | `60` | RRF 融合常数 |
| Generation | `MAX_TOKENS` | `2048` | 最大输出 token |
| Generation | `TEMPERATURE` | `0.2` | RAG 建议较低温度，降低幻觉 |
| Generation | `CONTEXT_TOKEN_BUDGET` | `6000` | 检索上下文 token 预算 |
| Chat | `MAX_HISTORY_TURNS` | `10` | 注入 LLM 的最大历史轮数 |
| Logging | `LOG_LEVEL` | `INFO` | 日志级别 |

## 4. 建议的数据结构

MVP 可以使用 `dataclasses` + `python-dotenv`，减少依赖；如果后续配置项显著增加，可迁移到 `pydantic-settings`。

```python
from dataclasses import dataclass
from pathlib import Path
import os
from dotenv import load_dotenv

load_dotenv()


def _get_int(name: str, default: int) -> int:
    value = os.getenv(name)
    return default if value is None or value == "" else int(value)


def _get_float(name: str, default: float) -> float:
    value = os.getenv(name)
    return default if value is None or value == "" else float(value)


@dataclass(frozen=True)
class Settings:
    # API
    deepseek_api_key: str = os.getenv("DEEPSEEK_API_KEY", "")
    deepseek_base_url: str = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    deepseek_model: str = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_embedding_model: str = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")

    # Paths
    data_dir: Path = Path(os.getenv("DATA_DIR", "data"))
    vectorstore_dir: Path = Path(os.getenv("VECTORSTORE_DIR", "vectorstore"))
    storage_dir: Path = Path(os.getenv("STORAGE_DIR", "storage"))

    # Ingestion
    chunk_size: int = _get_int("CHUNK_SIZE", 800)
    chunk_overlap: int = _get_int("CHUNK_OVERLAP", 120)
    embed_batch_size: int = _get_int("EMBED_BATCH_SIZE", 32)

    # Retrieval
    top_k: int = _get_int("TOP_K", 5)
    retrieval_candidate_k: int = _get_int("RETRIEVAL_CANDIDATE_K", 20)
    similarity_cutoff: float = _get_float("SIMILARITY_CUTOFF", 0.25)
    rrf_k: int = _get_int("RRF_K", 60)
    vector_weight: float = _get_float("VECTOR_WEIGHT", 0.55)
    bm25_weight: float = _get_float("BM25_WEIGHT", 0.45)

    # Generation
    max_tokens: int = _get_int("MAX_TOKENS", 2048)
    temperature: float = _get_float("TEMPERATURE", 0.2)
    context_token_budget: int = _get_int("CONTEXT_TOKEN_BUDGET", 6000)

    # Chat
    max_history_turns: int = _get_int("MAX_HISTORY_TURNS", 10)

    # Logging
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
```

> 说明：现有 plans 中使用静态类常量也可行，但 `dataclass(frozen=True)` 更适合测试和运行时覆盖；可以把 `Settings()` 实例显式传入各模块，减少隐式全局状态。

## 5. 核心接口

| 函数/对象 | 输入 | 输出 | 说明 |
| --- | --- | --- | --- |
| `load_settings()` | 可选 overrides | `Settings` | 读取并校验配置 |
| `validate_settings(settings)` | `Settings` | `None` / 抛异常 | 检查必填项和数值范围 |
| `ensure_directories(settings)` | `Settings` | `None` | 创建 `data/`、`storage/`、`vectorstore/` |
| `get_llm(settings)` | `Settings` | LlamaIndex LLM | 创建 DeepSeek Chat 客户端 |
| `get_embedding_model(settings)` | `Settings` | embedding model | 创建 embedding 客户端 |
| `mask_secret(value)` | `str` | `str` | 日志或 UI 中脱敏展示 |

## 6. 客户端初始化设计

### 6.1 DeepSeek LLM

DeepSeek 提供 OpenAI 兼容接口，可通过 LlamaIndex 的 OpenAI LLM 包装器创建：

```python
from llama_index.llms.openai import OpenAI


def get_llm(settings: Settings) -> OpenAI:
    validate_required_secret("DEEPSEEK_API_KEY", settings.deepseek_api_key)
    return OpenAI(
        api_key=settings.deepseek_api_key,
        api_base=settings.deepseek_base_url,
        model=settings.deepseek_model,
        temperature=settings.temperature,
        max_tokens=settings.max_tokens,
    )
```

注意事项：

- LlamaIndex 版本不同，参数名可能是 `api_base` 或 `base_url`，实现前需要以锁定版本的文档为准。
- 生成模块应使用 chat 接口而不是把完整 messages 拼成单个 prompt。
- 对超时、限流和网络错误要在调用层捕获并返回可读错误。

### 6.2 Embedding 模型

```python
from llama_index.embeddings.openai import OpenAIEmbedding


def get_embedding_model(settings: Settings) -> OpenAIEmbedding:
    validate_required_secret("OPENAI_API_KEY", settings.openai_api_key)
    return OpenAIEmbedding(
        api_key=settings.openai_api_key,
        model=settings.openai_embedding_model,
    )
```

后续如切换本地 embedding，可保持该函数签名不变，只替换内部实现。

## 7. `.env.example` 模板

```env
# DeepSeek Chat
DEEPSEEK_API_KEY=sk-your-deepseek-api-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# OpenAI Embedding
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Local paths
DATA_DIR=data
VECTORSTORE_DIR=vectorstore
STORAGE_DIR=storage

# Ingestion
CHUNK_SIZE=800
CHUNK_OVERLAP=120
EMBED_BATCH_SIZE=32

# Retrieval
TOP_K=5
RETRIEVAL_CANDIDATE_K=20
SIMILARITY_CUTOFF=0.25
RRF_K=60
VECTOR_WEIGHT=0.55
BM25_WEIGHT=0.45

# Generation
MAX_TOKENS=2048
TEMPERATURE=0.2
CONTEXT_TOKEN_BUDGET=6000

# Chat
MAX_HISTORY_TURNS=10

# Logging
LOG_LEVEL=INFO
```

## 8. 配置校验规则

启动时至少校验：

- `DEEPSEEK_API_KEY`：问答前必须存在；允许只做文档导入时暂缺。
- `OPENAI_API_KEY`：需要 embedding 时必须存在。
- `CHUNK_SIZE > CHUNK_OVERLAP >= 0`。
- `TOP_K >= 1`，`RETRIEVAL_CANDIDATE_K >= TOP_K`。
- `0 <= SIMILARITY_CUTOFF <= 1`。
- `0 <= TEMPERATURE <= 2`。
- `DATA_DIR`、`VECTORSTORE_DIR`、`STORAGE_DIR` 可创建且可写。

建议拆成两个层级：

1. `validate_startup()`：只检查路径和基本数值，保证应用可打开。
2. `validate_for_chat()` / `validate_for_ingest()`：在用户执行具体操作前检查 API Key。

## 9. Streamlit 设置页的配置覆盖

设置页可允许用户临时修改：

- 检索模式：`hybrid` / `vector` / `bm25`。
- `top_k`、`similarity_cutoff`、`temperature`、`max_tokens`。
- API Key（仅当前进程内存保存）。

实现建议：

1. UI 表单提交后创建新的 `Settings` 实例或 runtime override dict。
2. 清理依赖旧配置的对象缓存：embedding、LLM、retriever、generator。
3. 不自动写 `.env`；如果需要持久化，应明确提示用户风险。

## 10. 安全要求

- `.env`、`storage/` 中可能包含敏感数据，必须加入 `.gitignore`。
- API Key 在日志中只显示前后少量字符，例如 `sk-****abcd`。
- 异常信息返回 UI 时应避免原样展示请求头、完整环境变量。
- 对话历史可能包含用户隐私，默认只保存在本地，不上传到第三方存储。

## 11. 测试计划

| 测试 | 重点 |
| --- | --- |
| 默认配置加载 | 无 `.env` 时仍能创建 `Settings`，路径默认正确 |
| 环境变量覆盖 | 设置 env 后读取值正确，类型转换正确 |
| 非法数值 | `TOP_K=0`、`CHUNK_OVERLAP > CHUNK_SIZE` 能被拦截 |
| 密钥脱敏 | 不泄露完整 API Key |
| 目录创建 | 临时目录下可创建 data/storage/vectorstore |
| 客户端创建 | 使用 monkeypatch 验证传入参数，不真实调用 API |

## 12. 实施顺序

1. 新增 `Settings` 数据结构与 `load_settings()`。
2. 新增 `.env.example`，确认 `.env` 在 `.gitignore` 中。
3. 实现目录创建和配置校验。
4. 实现 `get_llm()`、`get_embedding_model()`。
5. 修改 ingest/retriever/generator/chat/UI 计划中的工厂函数，统一接收 `settings`。
6. 添加配置模块单元测试。
