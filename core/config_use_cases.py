from __future__ import annotations

import logging
import time
import urllib.parse
from dataclasses import dataclass
from typing import Any

FALLBACK_MODELS = [
    {"id": "deepseek-v4-flash", "name": "deepseek-v4-flash"},
    {"id": "deepseek-v4-pro", "name": "deepseek-v4-pro"},
]

logger = logging.getLogger(__name__)


@dataclass
class ConnectionTestResult:
    status: str
    model: str
    elapsed_ms: int
    error: str | None = None


@dataclass
class ModelInfo:
    id: str
    name: str


def _make_client(api_key: str, base_url: str) -> Any:
    from openai import OpenAI
    return OpenAI(api_key=api_key, base_url=base_url)


def _sanitize_error(err_msg: str, api_key: str | None, base_url: str | None) -> str:
    sanitized = err_msg
    if api_key:
        sanitized = sanitized.replace(api_key, "***")
        encoded_key = urllib.parse.quote(api_key, safe="")
        if encoded_key != api_key:
            sanitized = sanitized.replace(encoded_key, "***")
    if base_url and base_url in sanitized:
        sanitized = sanitized.replace(base_url, "***")
    return sanitized


def test_connection(
    api_key: str | None,
    base_url: str | None,
    model: str | None,
    fallback_api_key: str = "",
    fallback_base_url: str = "",
    fallback_model: str = "",
) -> ConnectionTestResult:
    effective_key = api_key or fallback_api_key
    if not effective_key:
        return ConnectionTestResult(status="error", model=model or fallback_model, elapsed_ms=0, error="未配置 API Key")
    effective_url = base_url or fallback_base_url
    effective_model = model or fallback_model

    start = time.perf_counter()
    try:
        client = _make_client(effective_key, effective_url)
        client.models.list()
        elapsed = round((time.perf_counter() - start) * 1000)
        return ConnectionTestResult(status="ok", model=effective_model, elapsed_ms=elapsed)
    except Exception as e:
        elapsed = round((time.perf_counter() - start) * 1000)
        sanitized = _sanitize_error(str(e), api_key, base_url)
        logger.warning("Connection test failed: %s", sanitized)
        return ConnectionTestResult(status="error", model=effective_model, elapsed_ms=elapsed, error=sanitized)


def list_models(api_key: str, base_url: str) -> list[dict[str, str]]:
    if not api_key:
        return []
    try:
        client = _make_client(api_key, base_url)
        models = client.models.list()
        fetched = [{"id": m.id, "name": m.id} for m in sorted(models, key=lambda x: x.id)]
        return fetched if fetched else FALLBACK_MODELS
    except Exception as e:
        logger.warning("Failed to fetch models from %s: %s", base_url, e)
        return FALLBACK_MODELS
