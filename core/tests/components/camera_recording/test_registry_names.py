"""Tests for file names that come back from the registry."""

import pytest

from homeassistant.components.camera_recording.registry_place import safe_file_name


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("20250101-120000.mp4", True),
        ("clip.jpg", True),
        ("", False),
        (".", False),
        ("..", False),
        ("../config/secrets.yaml", False),
        ("..\\config\\secrets.yaml", False),
        ("/etc/passwd", False),
        ("sub/clip.mp4", False),
        ("clip\0.mp4", False),
    ],
)
def test_only_plain_file_names_are_trusted(name: str, expected: bool) -> None:
    """A name read from the registry never leads out of the recording folder."""
    assert safe_file_name(name) is expected
