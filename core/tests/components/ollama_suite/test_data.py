"""Tests for the pure helpers of the Ollama suite."""

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from homeassistant.components.ollama_suite.const import MAX_MODELS, MAX_TEXT_LENGTH
from homeassistant.components.ollama_suite.data import (
    PullTracker,
    listed_size,
    map_error,
    mask_address,
    shape_chat_chunk,
    shape_models,
    shape_progress,
    shape_running,
    shape_show,
    valid_listed_name,
    valid_pull_name,
)

DETAILS = SimpleNamespace(
    family="llama",
    families=["llama"],
    format="gguf",
    parameter_size="3.2B",
    quantization_level="Q4_K_M",
)


@pytest.mark.parametrize(
    ("content", "expected"),
    [
        pytest.param("plain\ttext\nline", "plain\ttext\nline", id="keeps-layout"),
        pytest.param("a\x00b\x1b[31mc\x7f", "ab[31mc", id="control-characters"),
        pytest.param("a‮b‪c⁦d⁩", "abcd", id="direction-overrides"),
        pytest.param("a‎b‏c؜d", "abcd", id="direction-marks"),
        pytest.param("café 中文", "café 中文", id="letters"),
    ],
)
def test_shape_chat_chunk_cleans_reply_text(content: str, expected: str) -> None:
    """Reply text loses control characters and direction overrides only."""
    item = SimpleNamespace(message=SimpleNamespace(content=content), done=False)
    assert shape_chat_chunk(item) == (expected, None)


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("http://user:secret@192.168.1.5:11434", "http://192.168.1.5:11434"),
        ("https://host.local/path/secret?token=abc#frag", "https://host.local"),
        ("http://[::1]:11434/", "http://[::1]:11434"),
        ("ftp://host", ""),
        ("not a url", ""),
        ("", ""),
        (None, ""),
    ],
)
def test_mask_address(url: str | None, expected: str) -> None:
    """The address never carries credentials, path, query or fragment."""
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
        (httpx.ConnectTimeout("x"), "timeout"),
        (httpx.ReadTimeout("x"), "timeout"),
        (httpx.ConnectError("x"), "cannot_connect"),
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


@pytest.mark.parametrize(
    "name",
    [
        "llama3",
        "llama3.2:3b",
        "library-user/my_model:Q4_K_M",
        "qwen2.5-coder:7b-instruct-q4_K_M",
    ],
)
def test_valid_pull_name(name: str) -> None:
    """Library names, with an optional namespace and tag, are accepted."""
    assert valid_pull_name(name)


@pytest.mark.parametrize(
    "name",
    [
        "",
        " llama3",
        "llama3 ",
        "Llama3",
        "llama3:",
        ":tag",
        "a:b:c",
        "a/b/c",
        "hf.co/user/model",
        "registry.example.com/user/model:1",
        "http://evil/x",
        "../etc/passwd",
        "llama3\n",
        "llama3;rm",
        "llama3:tag with space",
        "x" * 300,
        None,
        5,
    ],
)
def test_invalid_pull_name(name: Any) -> None:
    """Anything else is refused, including hosts and control characters."""
    assert not valid_pull_name(name)


def test_valid_listed_name() -> None:
    """A listed name only has to be printable and a sensible length."""
    assert valid_listed_name("hf.co/user/model:Q4")
    assert not valid_listed_name("")
    assert not valid_listed_name("a\nb")
    assert not valid_listed_name(" a")
    assert not valid_listed_name("a" * 300)


def test_shape_progress() -> None:
    """Progress numbers are those reported, bounded and never inconsistent."""
    shaped = shape_progress(
        SimpleNamespace(
            status="pulling abc", digest="sha256:abc", total=100, completed=40
        )
    )
    assert shaped == {
        "status": "pulling abc",
        "digest": "sha256:abc",
        "total": 100,
        "completed": 40,
    }
    over = shape_progress(
        SimpleNamespace(status="x", digest=None, total=10, completed=99)
    )
    assert over["completed"] == 10
    unknown = shape_progress(SimpleNamespace(status="pulling manifest"))
    assert unknown["total"] is None
    assert unknown["completed"] is None
    zero = shape_progress(SimpleNamespace(status="x", total=0, completed=0))
    assert zero["total"] is None
    odd = shape_progress(SimpleNamespace(status="x", total=-5, completed="7"))
    assert odd["total"] is None
    assert odd["completed"] is None


def test_listed_size() -> None:
    """A model is found by its exact name and its size is returned."""
    response = SimpleNamespace(
        models=[SimpleNamespace(model="a:1", size=5), SimpleNamespace(model="b:1")]
    )
    assert listed_size(response, "a:1") == (True, 5)
    assert listed_size(response, "b:1") == (True, None)
    assert listed_size(response, "c:1") == (False, None)


def test_pull_tracker_allows_one_per_server() -> None:
    """A second download on the same server is refused until the first ends."""
    tracker = PullTracker()
    assert tracker.start("one")
    assert not tracker.start("one")
    assert tracker.start("two")
    tracker.finish("one")
    assert tracker.start("one")


@pytest.mark.parametrize("value", [-1, 2**53 + 1, 10**30, True, 1.5, "7", None])
def test_counts_outside_the_exact_range_are_dropped(value: Any) -> None:
    """Negative, huge and non-integer counts are never passed on."""
    item = SimpleNamespace(
        model="m", size=value, size_vram=value, context_length=value, details=None
    )
    running = shape_running(SimpleNamespace(models=[item]))["running"][0]
    listed = shape_models(SimpleNamespace(models=[item]))["models"][0]
    assert running["size"] is None
    assert running["size_vram"] is None
    assert running["context_length"] is None
    assert listed["size"] is None


def test_count_at_the_limit_is_kept() -> None:
    """The largest exact integer is still shown."""
    item = SimpleNamespace(model="m", size=2**53, details=None)
    assert shape_models(SimpleNamespace(models=[item]))["models"][0]["size"] == 2**53
