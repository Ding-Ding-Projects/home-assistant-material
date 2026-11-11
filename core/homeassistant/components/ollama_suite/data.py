"""Pure helpers that shape what an Ollama server reports.

Nothing here talks to the network. The functions take the objects the
``ollama`` library returns and produce small, bounded, JSON-friendly answers.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from typing import Any
from urllib.parse import urlsplit

from .const import (
    MAX_INFO_ITEMS,
    MAX_INFO_VALUE_LENGTH,
    MAX_MODELS,
    MAX_RUNNING,
    MAX_TEXT_LENGTH,
)


def mask_address(url: str | None) -> str:
    """Return the address without credentials, query or fragment.

    Only http and https addresses are shown. Anything else gives an empty
    string so a malformed value is never echoed back.
    """
    if not url or not isinstance(url, str):
        return ""
    try:
        parts = urlsplit(url.strip())
        host = parts.hostname
        port = parts.port
    except ValueError:
        return ""
    if parts.scheme not in ("http", "https") or not host:
        return ""
    if ":" in host:
        host = f"[{host}]"
    netloc = f"{host}:{port}" if port else host
    path = parts.path.rstrip("/")
    return f"{parts.scheme}://{netloc}{path}"


def map_error(err: BaseException) -> str:
    """Map an error from the Ollama client to a plain code."""
    status = getattr(err, "status_code", None)
    if isinstance(status, int):
        if status in (401, 403):
            return "unauthorized"
        if status == 404:
            return "not_found"
        if status == 429 or status >= 500:
            return "server_error"
        return "bad_request"
    if isinstance(err, TimeoutError):
        return "timeout"
    if isinstance(err, ConnectionError | OSError):
        return "cannot_connect"
    return "unknown"


def _iso(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str):
        return value[:64]
    return None


def _short(value: Any, limit: int) -> str | None:
    if value is None:
        return None
    text = value if isinstance(value, str) else str(value)
    return text[:limit]


def _details(details: Any) -> dict[str, Any]:
    families = getattr(details, "families", None) or []
    return {
        "family": _short(getattr(details, "family", None), 64),
        "families": [_short(item, 64) for item in list(families)[:10]],
        "format": _short(getattr(details, "format", None), 32),
        "parameter_size": _short(getattr(details, "parameter_size", None), 32),
        "quantization_level": _short(
            getattr(details, "quantization_level", None), 32
        ),
    }


def shape_models(response: Any) -> dict[str, Any]:
    """Shape the answer of the model list call."""
    items = list(getattr(response, "models", None) or [])
    models = [
        {
            "name": _short(getattr(item, "model", None), 256),
            "digest": _short(getattr(item, "digest", None), 80),
            "size": getattr(item, "size", None),
            "modified_at": _iso(getattr(item, "modified_at", None)),
            **_details(getattr(item, "details", None)),
        }
        for item in items[:MAX_MODELS]
    ]
    return {
        "models": models,
        "total": len(items),
        "truncated": len(items) > MAX_MODELS,
    }


def shape_running(response: Any) -> dict[str, Any]:
    """Shape the answer of the running models call."""
    items = list(getattr(response, "models", None) or [])
    running = [
        {
            "name": _short(getattr(item, "model", None), 256),
            "digest": _short(getattr(item, "digest", None), 80),
            "size": getattr(item, "size", None),
            "size_vram": getattr(item, "size_vram", None),
            "context_length": getattr(item, "context_length", None),
            "expires_at": _iso(getattr(item, "expires_at", None)),
            **_details(getattr(item, "details", None)),
        }
        for item in items[:MAX_RUNNING]
    ]
    return {
        "running": running,
        "memory_used": sum(item["size"] or 0 for item in running),
        "memory_gpu": sum(item["size_vram"] or 0 for item in running),
    }


def _scalar_info(info: Any) -> dict[str, Any]:
    """Keep the small scalar entries of the model information.

    Large arrays, such as the tokenizer vocabulary, are left out.
    """
    if not isinstance(info, Mapping):
        return {}
    kept: dict[str, Any] = {}
    for key, value in info.items():
        if len(kept) >= MAX_INFO_ITEMS:
            break
        if isinstance(value, bool | int | float):
            kept[str(key)[:128]] = value
        elif isinstance(value, str):
            kept[str(key)[:128]] = value[:MAX_INFO_VALUE_LENGTH]
    return kept


def shape_show(response: Any, name: str) -> dict[str, Any]:
    """Shape the answer of the model details call."""
    capabilities = getattr(response, "capabilities", None) or []
    return {
        "name": name,
        "modified_at": _iso(getattr(response, "modified_at", None)),
        "capabilities": [_short(item, 64) for item in list(capabilities)[:20]],
        "parameters": _short(getattr(response, "parameters", None), MAX_TEXT_LENGTH),
        "template": _short(getattr(response, "template", None), MAX_TEXT_LENGTH),
        "license": _short(getattr(response, "license", None), MAX_TEXT_LENGTH),
        "info": _scalar_info(getattr(response, "modelinfo", None)),
        **_details(getattr(response, "details", None)),
    }
