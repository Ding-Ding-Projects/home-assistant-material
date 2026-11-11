"""Pure helpers that shape what an Ollama server reports.

Nothing here talks to the network. The functions take the objects the
``ollama`` library returns and produce small, bounded, JSON-friendly answers.
"""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from datetime import datetime
from itertools import islice
import re
from typing import Any
from urllib.parse import urlsplit

import httpx

from .const import (
    MAX_COUNT,
    MAX_INFO_ITEMS,
    MAX_INFO_VALUE_LENGTH,
    MAX_MODELS,
    MAX_NAME_LENGTH,
    MAX_RUNNING,
    MAX_TEXT_LENGTH,
    MAX_USERS,
)

# A model to download: `name`, `name:tag`, or `namespace/name[:tag]`. A name
# with a host part (a dot before the first slash) is not accepted, so a pull
# can only name something in the Ollama library, never another registry.
PULL_NAME_PATTERN = re.compile(
    r"[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9_-]*/[a-z0-9][a-z0-9._-]*"
)
PULL_TAG_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")


def mask_address(url: str | None) -> str:
    """Return the scheme, host and port of an address and nothing else.

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
    # The path is left out: a path can carry a secret.
    return f"{parts.scheme}://{netloc}"


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
    if isinstance(err, TimeoutError | httpx.TimeoutException):
        return "timeout"
    if isinstance(err, ConnectionError | OSError | httpx.TransportError):
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
    all_items = getattr(response, "models", None) or []
    total = len(all_items)
    items = list(islice(all_items, MAX_MODELS))
    models = [
        {
            "name": _short(getattr(item, "model", None), 256),
            "digest": _short(getattr(item, "digest", None), 80),
            "size": _count(getattr(item, "size", None)),
            "modified_at": _iso(getattr(item, "modified_at", None)),
            **_details(getattr(item, "details", None)),
        }
        for item in items
    ]
    return {
        "models": models,
        "total": total,
        "truncated": total > MAX_MODELS,
    }


def shape_running(response: Any) -> dict[str, Any]:
    """Shape the answer of the running models call."""
    items = list(islice(getattr(response, "models", None) or [], MAX_RUNNING))
    running = [
        {
            "name": _short(getattr(item, "model", None), 256),
            "digest": _short(getattr(item, "digest", None), 80),
            "size": _count(getattr(item, "size", None)),
            "size_vram": _count(getattr(item, "size_vram", None)),
            "context_length": _count(getattr(item, "context_length", None)),
            "expires_at": _iso(getattr(item, "expires_at", None)),
            **_details(getattr(item, "details", None)),
        }
        for item in items
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


def valid_pull_name(name: Any) -> bool:
    """Return True if the text is a model name that may be downloaded."""
    if not isinstance(name, str) or not 0 < len(name) <= MAX_NAME_LENGTH:
        return False
    base, sep, tag = name.partition(":")
    if sep and not PULL_TAG_PATTERN.fullmatch(tag):
        return False
    return PULL_NAME_PATTERN.fullmatch(base) is not None


def valid_listed_name(name: Any) -> bool:
    """Return True if the text is shaped like a model name from a server list.

    The caller still has to check that the model is in the server's own list.
    """
    return (
        isinstance(name, str)
        and 0 < len(name) <= MAX_NAME_LENGTH
        and name.isprintable()
        and name == name.strip()
    )


def _count(value: Any) -> int | None:
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or not 0 <= value <= MAX_COUNT
    ):
        return None
    return value


def shape_progress(item: Any) -> dict[str, Any]:
    """Shape one progress message of a download.

    A total of zero is unknown, and completed never exceeds the total.
    """
    total = _count(getattr(item, "total", None)) or None
    completed = _count(getattr(item, "completed", None))
    if total is not None and completed is not None:
        completed = min(completed, total)
    return {
        "status": _short(getattr(item, "status", None), 100) or "",
        "digest": _short(getattr(item, "digest", None), 80),
        "total": total,
        "completed": completed,
    }


def listed_size(response: Any, name: str) -> tuple[bool, int | None]:
    """Return whether a model is listed, and its size if the server gave one."""
    for item in getattr(response, "models", None) or []:
        if getattr(item, "model", None) == name:
            return True, _count(getattr(item, "size", None))
    return False, None


CHAT_UNSAFE_CHARACTERS = re.compile(
    "[\x00-\x08\x0b-\x1f\x7f-\x9f؜‎‏‪-‮⁦-⁩]"
)


def clean_chat_text(text: str) -> str:
    """Drop control characters and text-direction overrides from reply text.

    Line breaks and tabs stay. A model can otherwise reorder the text a reader
    sees or hide characters in it.
    """
    return CHAT_UNSAFE_CHARACTERS.sub("", text)


def shape_chat_chunk(item: Any) -> tuple[str, dict[str, Any] | None]:
    """Return the text of one chat message and, on the last one, its speed.

    The speed is only given when the server reported real counts. The text has
    control characters and direction overrides removed.
    """
    message = getattr(item, "message", None)
    content = getattr(message, "content", None)
    text = clean_chat_text(content) if isinstance(content, str) else ""
    if not getattr(item, "done", False):
        return text, None
    count = _count(getattr(item, "eval_count", None))
    duration = _count(getattr(item, "eval_duration", None))
    speed = None
    if count and duration:
        speed = round(count / (duration / 1_000_000_000), 1)
    return text, {"tokens": count, "tokens_per_second": speed}


def _base_name(name: str) -> str:
    """Return a model name with an implied `latest` tag made explicit."""
    return name if ":" in name else f"{name}:latest"


def shape_users(entry: Any, model: str) -> list[dict[str, Any]]:
    """List the subentries of a server that are set to use one model."""
    users = []
    wanted = _base_name(model)
    for subentry in entry.subentries.values():
        stored = subentry.data.get("model")
        if not isinstance(stored, str) or _base_name(stored) != wanted:
            continue
        users.append(
            {
                "subentry_id": subentry.subentry_id,
                "type": _short(subentry.subentry_type, 64),
                "title": _short(subentry.title, 256),
            }
        )
        if len(users) >= MAX_USERS:
            break
    return users


def shape_users_by_model(entry: Any) -> dict[str, list[dict[str, Any]]]:
    """Map each model name (implied `latest` tag made explicit) to its users.

    The map holds at most MAX_MODELS names and at most MAX_USERS users each.
    """
    by_model: dict[str, list[dict[str, Any]]] = {}
    for subentry in entry.subentries.values():
        stored = subentry.data.get("model")
        if not isinstance(stored, str):
            continue
        key = _base_name(stored)
        if key not in by_model and len(by_model) >= MAX_MODELS:
            continue
        users = by_model.setdefault(key, [])
        if len(users) >= MAX_USERS:
            continue
        users.append(
            {
                "subentry_id": subentry.subentry_id,
                "type": _short(subentry.subentry_type, 64),
                "title": _short(subentry.title, 256),
            }
        )
    return by_model


class ChatTracker:
    """Allow one test chat per connection at a time."""

    def __init__(self) -> None:
        """Start with no chat running."""
        self._tasks: dict[int, asyncio.Task[None]] = {}

    def task(self, key: int) -> asyncio.Task[None] | None:
        """Return the running chat task of a connection, if any."""
        return self._tasks.get(key)

    def start(self, key: int, task: asyncio.Task[None]) -> None:
        """Remember the chat task of a connection."""
        self._tasks[key] = task

    def finish(self, key: int, task: asyncio.Task[None]) -> None:
        """Forget a chat task once it is over."""
        if self._tasks.get(key) is task:
            del self._tasks[key]


class PullTracker:
    """Allow one download per server at a time."""

    def __init__(self) -> None:
        """Start with no download running."""
        self._active: set[str] = set()
        self._tasks: dict[str, asyncio.Task[None]] = {}

    def attach(self, entry_id: str, task: asyncio.Task[None]) -> None:
        """Remember the task that runs the download of a server."""
        self._tasks[entry_id] = task

    def task(self, entry_id: str) -> asyncio.Task[None] | None:
        """Return the task of the running download of a server, if any."""
        return self._tasks.get(entry_id)

    def start(self, entry_id: str) -> bool:
        """Mark a download as running. Return False if one already is."""
        if entry_id in self._active:
            return False
        self._active.add(entry_id)
        return True

    def finish(self, entry_id: str) -> None:
        """Mark the download of a server as over."""
        self._active.discard(entry_id)
        self._tasks.pop(entry_id, None)
