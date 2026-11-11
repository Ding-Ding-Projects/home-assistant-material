"""Tests for the pure helpers of the Ollama suite."""

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest

from homeassistant.components.ollama_suite.const import MAX_MODELS, MAX_TEXT_LENGTH
from homeassistant.components.ollama_suite.data import (
    map_error,
    mask_address,
    shape_models,
    shape_running,
    shape_show,
)

DETAILS = SimpleNamespace(
    family="llama",
    families=["llama"],
    format="gguf",
    parameter_size="3.2B",
    quantization_level="Q4_K_M",
)


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("http://user:secret@192.168.1.5:11434", "http://192.168.1.5:11434"),
        ("https://host.local/path/?token=abc#frag", "https://host.local/path"),
        ("http://[::1]:11434/", "http://[::1]:11434"),
        ("ftp://host", ""),
        ("not a url", ""),
        ("", ""),
        (None, ""),
    ],
)
def test_mask_address(url: str | None, expected: str) -> None:
    """The address never carries credentials, query or fragment."""
    assert mask_address(url) == expected


class _Status(Exception):
    def __init__(self, status_code: int) -> None:
        self.status_code = status_code


@pytest.mark.parametrize(
    ("err", "code"),
    [
        (_Status(401), "unauthorized"),
        (_Status(404), "not_found"),
        (_Status(503), "server_error"),
        (_Status(400), "bad_request"),
        (TimeoutError(), "timeout"),
        (ConnectionError(), "cannot_connect"),
        (ValueError(), "unknown"),
    ],
)
def test_map_error(err: BaseException, code: str) -> None:
    """Errors become plain codes."""
    assert map_error(err) == code


def test_shape_models() -> None:
    """Models carry the listed fields and the list is capped."""
    item = SimpleNamespace(
        model="llama3.2:3b",
        digest="abc",
        size=2_000_000_000,
        modified_at=datetime(2026, 1, 1, tzinfo=UTC),
        details=DETAILS,
    )
    response = SimpleNamespace(models=[item] * (MAX_MODELS + 5))
    shaped = shape_models(response)
    assert len(shaped["models"]) == MAX_MODELS
    assert shaped["total"] == MAX_MODELS + 5
    assert shaped["truncated"] is True
    assert shaped["models"][0] == {
        "name": "llama3.2:3b",
        "digest": "abc",
        "size": 2_000_000_000,
        "modified_at": "2026-01-01T00:00:00+00:00",
        "family": "llama",
        "families": ["llama"],
        "format": "gguf",
        "parameter_size": "3.2B",
        "quantization_level": "Q4_K_M",
    }


def test_shape_running_totals() -> None:
    """Memory is summed over the loaded models."""
    items = [
        SimpleNamespace(
            model=name,
            digest="d",
            size=size,
            size_vram=vram,
            context_length=4096,
            expires_at=None,
            details=DETAILS,
        )
        for name, size, vram in (("a", 10, 4), ("b", 20, None))
    ]
    shaped = shape_running(SimpleNamespace(models=items))
    assert shaped["memory_used"] == 30
    assert shaped["memory_gpu"] == 4
    assert [item["name"] for item in shaped["running"]] == ["a", "b"]


def test_shape_show_keeps_only_small_values() -> None:
    """Large arrays and long texts are cut from the details."""
    info: dict[str, Any] = {
        "general.architecture": "llama",
        "llama.context_length": 131072,
        "tokenizer.ggml.tokens": ["x"] * 100_000,
    }
    response = SimpleNamespace(
        modified_at=None,
        capabilities=["completion"],
        parameters="stop x",
        template="t" * (MAX_TEXT_LENGTH + 10),
        license=None,
        modelinfo=info,
        details=DETAILS,
    )
    shaped = shape_show(response, "llama3.2:3b")
    assert shaped["info"] == {
        "general.architecture": "llama",
        "llama.context_length": 131072,
    }
    assert len(shaped["template"]) == MAX_TEXT_LENGTH
    assert shaped["license"] is None
    assert shaped["name"] == "llama3.2:3b"
