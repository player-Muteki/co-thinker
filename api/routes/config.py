"""配置管理路由 — GET/POST /api/config"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import get_project_context
from core.config_use_cases import test_connection, list_models

import logging

logger = logging.getLogger(__name__)

router = APIRouter(tags=["config"])

class ConfigUpdate(BaseModel):
    api_key: str | None = None
    base_url: str | None = None
    model: str | None = None
    top_k: int | None = None
    chunk_size: int | None = None


@router.get("/config")
async def get_config(
    ctx: Any = Depends(get_project_context),
):
    """返回当前配置（API key 仅返回是否存在）。"""
    return {
        "api_key_configured": bool(ctx.ctx.get_api_key()),
        "base_url": ctx.config.base_url,
        "model": ctx.config.model,
        "top_k": ctx.config.top_k,
        "chunk_size": ctx.config.chunk_size,
    }


@router.get("/models")
async def list_models_route(
    ctx: Any = Depends(get_project_context),
):
    """从当前配置的 API 提供商获取可用模型列表。"""
    api_key = ctx.ctx.get_api_key()
    if not api_key:
        return {"models": []}
    models = list_models(api_key=api_key, base_url=ctx.config.base_url)
    return {"models": models}


class TestConnectionRequest(BaseModel):
    api_key: str | None = None
    base_url: str | None = None
    model: str | None = None


@router.post("/config/test")
async def test_connection_route(
    req: TestConnectionRequest,
    ctx: Any = Depends(get_project_context),
):
    """测试 API 供应商连通性，返回延迟与状态。"""
    result = test_connection(
        api_key=req.api_key or ctx.ctx.get_api_key(),
        base_url=req.base_url or ctx.config.base_url,
        model=req.model or ctx.config.model,
    )
    return {
        "status": result.status,
        "model": result.model,
        "elapsed_ms": result.elapsed_ms,
        "error": result.error,
    }


@router.post("/config")
async def save_config(
    req: ConfigUpdate,
    ctx: Any = Depends(get_project_context),
):
    """保存配置更新到项目 config 和全局 config。"""
    if req.top_k is not None:
        ctx.config.top_k = req.top_k
    if req.chunk_size is not None:
        ctx.config.chunk_size = req.chunk_size
    if req.model is not None:
        ctx.config.model = req.model
    if req.base_url is not None:
        ctx.config.base_url = req.base_url

    ctx.save_config()

    if req.api_key is not None or req.base_url is not None:
        try:
            ctx.ctx.update_global_auth(api_key=req.api_key, base_url=req.base_url)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"保存 API 配置失败: {e}")

    return {"status": "ok"}
