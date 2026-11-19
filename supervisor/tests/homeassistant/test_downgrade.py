"""Test the rules for going back to an older Home Assistant version."""

import pytest

from supervisor.homeassistant.downgrade import (
    SKIP_PASS_LIFETIME_SECONDS,
    SKIP_PASS_LIMIT,
    DowngradeSkipPasses,
    is_downgrade,
)


@pytest.mark.parametrize(
    ("current", "target", "expected"),
    [
        pytest.param("2026.11.1.527", "2026.11.1.525", True, id="older-build"),
        pytest.param("2026.11.1.527", "2026.11.1.528", False, id="newer-build"),
        pytest.param("2026.11.1.527", "2026.11.1.527", False, id="same"),
        pytest.param("2026.11.1.527", "2026.10.0.500", True, id="older-month"),
        pytest.param("2026.11.0.460", "2026.11.1.457", False, id="newer-base"),
        pytest.param("2025.8.3", "2025.8.0", True, id="plain-older"),
        pytest.param("2025.8.0", "2025.8.3", False, id="plain-newer"),
        pytest.param(None, "2025.8.0", False, id="nothing-installed"),
        pytest.param("landingpage", "2025.8.0", False, id="from-landing-page"),
        pytest.param("2025.8.0", "dev-build", True, id="not-comparable"),
    ],
)
def test_is_downgrade(current: str | None, target: str, expected: bool) -> None:
    """Test which version changes count as going back."""
    assert is_downgrade(current, target) is expected


def test_pass_is_single_use() -> None:
    """Test a pass works once."""
    passes = DowngradeSkipPasses()
    token = passes.issue("2026.11.1.525", "user-a", 100.0)

    assert passes.consume(token, "2026.11.1.525", "user-a", 101.0) is True
    assert passes.consume(token, "2026.11.1.525", "user-a", 102.0) is False


@pytest.mark.parametrize(
    ("version", "holder", "now"),
    [
        pytest.param("2026.11.1.524", "user-a", 101.0, id="wrong-version"),
        pytest.param("2026.11.1.525", "user-b", 101.0, id="wrong-holder"),
        pytest.param(
            "2026.11.1.525",
            "user-a",
            100.0 + SKIP_PASS_LIFETIME_SECONDS + 1,
            id="expired",
        ),
    ],
)
def test_pass_refused_and_spent(version: str, holder: str, now: float) -> None:
    """Test a pass that does not match is refused and cannot be tried again."""
    passes = DowngradeSkipPasses()
    token = passes.issue("2026.11.1.525", "user-a", 100.0)

    assert passes.consume(token, version, holder, now) is False
    assert passes.consume(token, "2026.11.1.525", "user-a", 101.0) is False


def test_unknown_pass_refused() -> None:
    """Test a made-up pass is refused."""
    passes = DowngradeSkipPasses()
    passes.issue("2026.11.1.525", "user-a", 100.0)

    assert passes.consume("made-up", "2026.11.1.525", "user-a", 101.0) is False


def test_pass_store_is_bounded() -> None:
    """Test old passes are dropped when too many are issued."""
    passes = DowngradeSkipPasses()
    first = passes.issue("2026.11.1.525", "user-a", 100.0)
    for index in range(SKIP_PASS_LIMIT):
        passes.issue("2026.11.1.525", "user-a", 101.0 + index)

    assert len(passes) == SKIP_PASS_LIMIT
    assert passes.consume(first, "2026.11.1.525", "user-a", 120.0) is False
