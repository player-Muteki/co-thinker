"""文件浏览路由 — GET /api/files, PATCH /api/documents/{id}"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Any

from api.deps import get_project_context

router = APIRouter(tags=["files"])


class DocumentUpdateRequest(BaseModel):
    tags: list[str]


@router.get("/files")
async def list_files(
    subdir: str = Query(None, description="子目录路径"),
    search: str = Query(None, description="搜索关键词（按文件名过滤）"),
    ctx: Any = Depends(get_project_context),
):
    """扫描工作目录，返回文件树（含索引状态）。"""
    files = ctx.scan_files(subdir=subdir)

    # 搜索过滤
    if search:
        search_lower = search.lower()
        files = [f for f in files if search_lower in f["name"].lower()]

    return {"files": files, "total": len(files)}


@router.get("/project")
async def get_project_info(
    ctx: Any = Depends(get_project_context),
):
    """返回项目信息与索引统计。"""
    return ctx.get_project_info()


@router.get("/stats")
async def get_stats(
    ctx: Any = Depends(get_project_context),
):
    """返回索引统计信息。"""
    if ctx.ingest_engine:
        return ctx.ingest_engine.get_index_stats()
    return {"document_count": 0, "indexed_document_count": 0, "chunk_count": 0}


@router.patch("/documents/{document_id}")
async def update_document(
    document_id: str,
    body: DocumentUpdateRequest,
    ctx: Any = Depends(get_project_context),
):
    """更新文档元数据（tags）。"""
    if not ctx.ingest_engine:
        raise HTTPException(status_code=500, detail="Ingest engine not initialized")
    doc = ctx.ingest_engine.update_document_tags(document_id, body.tags)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc
