# 测试、评测与运维计划

## 1. 目标

Co-Thinker 是一个 RAG 问答系统，质量问题不只来自代码 bug，还可能来自文档解析、分块策略、检索召回、prompt 约束、模型 API、配置和 UI 状态。因此测试计划需要覆盖三类问题：

1. **工程正确性**：模块函数是否按预期工作。
2. **RAG 质量**：检索是否命中、答案是否基于来源。
3. **运行可维护性**：失败时能否定位、恢复和重试。

## 2. 测试分层

| 层级 | 目标 | 工具/方式 | 优先级 |
| --- | --- | --- | --- |
| 单元测试 | 验证纯逻辑和模块接口 | `pytest` | P0 |
| 集成测试 | 验证导入、检索、生成链路 | 临时目录 + mock API | P0 |
| UI 手动验收 | 验证 Streamlit 用户流程 | 本地启动应用 | P0 |
| RAG 评测 | 验证检索和答案质量 | 固定问题集 | P1 |
| 运维检查 | 验证配置、日志、恢复 | checklist | P1 |

## 3. 单元测试计划

### 3.1 `config.py`

| 测试项 | 验证点 |
| --- | --- |
| 默认配置 | 无 `.env` 时能加载默认路径和参数 |
| 环境变量覆盖 | env 中的数值能正确转换为 int/float |
| 参数校验 | 非法 top_k、chunk_size、temperature 能被拦截 |
| 目录创建 | `data/`、`storage/`、`vectorstore/` 可创建 |
| 密钥脱敏 | API Key 不被完整输出 |
| 客户端初始化 | 使用 mock 验证传参，不真实调用外部 API |

### 3.2 `app/ingest.py`

| 测试项 | 验证点 |
| --- | --- |
| 文件扫描 | 支持格式被扫描，隐藏目录和 vectorstore 被排除 |
| hash 去重 | 未变化文件重复导入会 skipped |
| 文件更新 | hash 变化后旧 chunks 被替换 |
| metadata | 每个 chunk 包含 document_id、chunk_id、source_path |
| 删除索引 | 按 document_id 删除，不误删同名文件 |
| 局部失败 | 坏文件不影响同批次其他文件 |
| manifest | 保存后重新加载状态一致 |

### 3.3 `app/retriever.py`

| 测试项 | 验证点 |
| --- | --- |
| RRF 融合 | 多路命中的 chunk 排名提升 |
| 去重 key | 同一 chunk_id 只出现一次 |
| 空结果 | 空知识库返回空结果而不是崩溃 |
| 过滤器 | 按 file_ext、tag、source_path 过滤 |
| 上下文格式 | context 中包含 source、chunk_id、content |
| 多轮 query | 短追问可结合最近历史生成 effective query |

### 3.4 `app/generator.py`

| 测试项 | 验证点 |
| --- | --- |
| 无结果分支 | 不调用 LLM，直接返回无知识库信息提示 |
| Prompt 组装 | context、history、question 完整且不重复 |
| 引用提取 | SourceReference 字段完整 |
| 上下文截断 | 超预算时截断内容但保留来源 |
| API 错误 | 返回友好错误，不泄露密钥 |
| 流式生成 | chunk 能逐步产出，最终答案可拼接 |

### 3.5 `app/chat_engine.py`

| 测试项 | 验证点 |
| --- | --- |
| 会话生命周期 | 创建、切换、删除、重命名正确 |
| 最后会话删除 | 自动创建新会话 |
| 消息添加 | role 校验、顺序和 updated_at 正确 |
| 历史裁剪 | 只返回最近 N 轮，不删除完整历史 |
| 原子保存 | 保存后文件可恢复 |
| 损坏 JSON | 不崩溃，备份损坏文件并创建新历史 |

## 4. Fixtures 设计

建议在 `tests/fixtures/` 放置：

```text
tests/fixtures/
├── docs/
│   ├── rag_intro.md          # 明确描述 RAG 定义、优缺点
│   ├── config_guide.txt      # 包含 API Key、配置项说明（使用假 key）
│   ├── code_sample.py        # 包含函数名、类名，用于 BM25 测试
│   ├── duplicate_name/
│   │   └── rag_intro.md      # 同名不同路径，测试 document_id 删除
│   ├── empty.txt             # 空文件
│   └── invalid_encoding.txt  # 编码异常或二进制伪装文本
└── qa/
    └── rag_eval.jsonl
```

`rag_eval.jsonl` 示例：

```jsonl
{"question":"RAG 是什么？","expected_source":"rag_intro.md","must_include":["检索","生成"]}
{"question":"配置文件里 TOP_K 的作用是什么？","expected_source":"config_guide.txt","must_include":["检索","数量"]}
{"question":"code_sample.py 里 create_engine 做什么？","expected_source":"code_sample.py","must_include":["create_engine"]}
```

## 5. 集成测试计划

### 5.1 本地临时知识库闭环

目标：不调用真实外部 API，用 fake embedding 和 fake LLM 跑通链路。

步骤：

1. 创建临时 `data/`、`storage/`、`vectorstore/`。
2. 放入 `rag_intro.md`。
3. 使用 fake embedding 构建索引。
4. 执行检索。
5. 使用 fake LLM 生成固定答案。
6. 验证结果包含来源。

### 5.2 真实 API smoke test（可选）

由于真实 API 会产生费用和依赖网络，默认不纳入 CI，只作为本地手动 smoke test：

- 环境变量存在时才运行。
- 只导入一个极短文档。
- 只问一个问题。
- 输出 token 限制较低。

可以用 pytest marker：

```python
@pytest.mark.external_api
```

默认执行 `pytest` 时跳过。

## 6. RAG 质量评测

### 6.1 检索评测指标

| 指标 | 说明 |
| --- | --- |
| Hit@K | 期望来源是否出现在 top-k 中 |
| MRR | 期望来源排名越靠前越好 |
| Source Accuracy | 答案引用来源是否包含期望文件 |
| No-answer Accuracy | 知识库无答案时是否拒答 |

### 6.2 答案评测维度

MVP 可先用人工检查：

- 是否回答了问题。
- 是否包含必要关键词。
- 是否引用正确来源。
- 是否编造知识库没有的信息。
- 是否对低置信度问题明确提示不确定。

P1 可以写一个简单评测脚本：

```text
python -m tests.eval_rag --dataset tests/fixtures/qa/rag_eval.jsonl
```

输出：

```text
Hit@5: 0.90
Source Accuracy: 0.85
No-answer Accuracy: 1.00
Failed cases:
- question: ... expected_source: ... actual_sources: ...
```

## 7. 手动验收清单

### 7.1 首次启动

- [ ] 无 `.env` 时应用能启动。
- [ ] 设置页提示缺少 API Key。
- [ ] 聊天页提示知识库为空。

### 7.2 文档管理

- [ ] 上传 `.md` 文件成功。
- [ ] 上传 `.txt` 文件成功。
- [ ] 上传代码文件成功。
- [ ] 重复上传同一文件不会重复增加 chunks。
- [ ] 删除文档后文档列表更新。
- [ ] 清空索引后 chunk 数为 0。

### 7.3 问答

- [ ] 对已导入文档提问能回答。
- [ ] 答案显示引用来源。
- [ ] 问无关问题时拒答或说明知识库不足。
- [ ] 追问时能利用最近历史。
- [ ] 流式输出显示正常。

### 7.4 会话

- [ ] 新建会话后消息为空。
- [ ] 切换会话能看到对应历史。
- [ ] 删除当前会话后自动切换或新建。
- [ ] 重启应用后历史仍存在。

### 7.5 设置

- [ ] 修改检索模式后下一次问答生效。
- [ ] 修改 top-k 后引用来源数量变化。
- [ ] 修改 API Key 不会写入日志或页面明文展示。

## 8. 日志与可观测性

### 8.1 日志内容

MVP 记录到本地日志即可，例如 `storage/logs/app.log`。

建议字段：

- 时间。
- 模块：config/ingest/retriever/generator/chat/ui。
- 操作：add_files/retrieve/generate/delete_file。
- 耗时。
- 结果数量：files、chunks、top_k。
- 错误类型和脱敏错误信息。

不要记录：

- 完整 API Key。
- 完整用户隐私对话。
- 完整上传文档内容。

### 8.2 关键指标

| 指标 | 用途 |
| --- | --- |
| `ingest_file_count` | 导入规模 |
| `ingest_failed_count` | 文档解析健康度 |
| `chunk_count` | 知识库规模 |
| `retrieval_elapsed_ms` | 检索性能 |
| `generation_elapsed_ms` | LLM 响应性能 |
| `no_result_count` | 知识库覆盖率问题 |
| `api_error_count` | 外部服务稳定性 |

## 9. 备份与恢复

MVP 本地状态包括：

- `data/`：源文档。
- `vectorstore/`：向量库。
- `storage/document_manifest.json`：文档清单。
- `storage/chat_history.json`：对话历史。
- `storage/bm25/`：可选 BM25 快照。

恢复策略：

1. 如果 `vectorstore/` 损坏但 `data/` 仍存在：清空向量库并重建索引。
2. 如果 manifest 丢失：扫描 `data/` 并全量重建。
3. 如果 chat history 损坏：备份损坏文件为 `.broken`，创建新历史。
4. 如果源文档丢失但向量库仍存在：UI 应提示来源文件缺失，不建议继续依赖旧向量。

## 10. 常见故障排查

| 问题 | 可能原因 | 处理方式 |
| --- | --- | --- |
| 页面启动失败 | 依赖未安装或 Python 版本不兼容 | 检查 `requirements.txt`，建议 Python 3.12+ |
| 导入失败 | 文件编码、格式不支持、embedding key 缺失 | 查看导入结果和日志 |
| 问答无结果 | 未导入文档、索引为空、阈值过高 | 降低阈值、重建索引 |
| 答案不引用来源 | Prompt 或引用映射问题 | 检查 `RetrievalResults.to_context_text()` |
| 重复答案 | 重复导入导致重复 chunks | 检查 manifest 和 chunk_id |
| API 超时 | 网络或模型服务问题 | 重试、降低文档上下文、检查 key |

## 11. CI 建议

如果项目接入 CI，优先运行：

```bash
pytest -m "not external_api"
```

CI 不应要求真实 API Key，不应访问外部模型服务。真实 API smoke test 放在本地或手动流程。

## 12. 发布前检查

- [ ] `.env` 未提交。
- [ ] `data/`、`storage/`、`vectorstore/` 未提交真实用户数据。
- [ ] README 启动步骤准确。
- [ ] `.env.example` 完整。
- [ ] 单元测试通过。
- [ ] 手动验收清单通过。
- [ ] plans 与实际实现保持一致。
