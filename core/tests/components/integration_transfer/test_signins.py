"""Tests for deciding what is a sign-in."""

import pytest

from homeassistant.components.integration_transfer.signins import (
    is_signin_key,
    keep_signins,
    strip_signins,
)


@pytest.mark.parametrize(
    "key",
    [
        "password",
        "Password",
        "token",
        "access_token",
        "refresh_token",
        "api_key",
        "apiKey",
        "key",
        "secret",
        "client_secret",
        "credentials",
        "auth",
        "pin",
        "code",
        "username",
        "user",
        "email",
        "webhook_id",
        "cloudhook_url",
        "mqtt_password",
        "broker_username",
        "device_key",
        "bearer-token",
        "my_secret_thing",
        "PrivateKeyPem",
    ],
)
def test_signin_keys(key: str) -> None:
    """Every fixed name, suffix and telling word counts as a sign-in."""
    assert is_signin_key(key)


@pytest.mark.parametrize("key", ["host", "port", "discovery", "keep_alive", "name"])
def test_ordinary_keys(key: str) -> None:
    """Ordinary settings are not sign-ins."""
    assert not is_signin_key(key)


def test_extra_names_from_diagnostics() -> None:
    """A name the integration's diagnostics redacts is a sign-in too."""
    assert not is_signin_key("serial")
    assert is_signin_key("serial", {"serial"})


def test_strip_is_recursive_and_drops_everything_under_a_signin() -> None:
    """Sign-ins are found at every level, and their whole value is left out."""
    value = {
        "host": "broker.local",
        "auth": {"user": "u", "nested": {"anything": "x"}},
        "broker": {"port": 1883, "password": "pw-value"},
        "accounts": [{"name": "a", "token": "t-value"}, {"name": "b"}],
    }
    stripped, left_out = strip_signins(value)
    assert stripped == {
        "host": "broker.local",
        "broker": {"port": 1883},
        "accounts": [{"name": "a"}, {"name": "b"}],
    }
    assert sorted(left_out) == ["accounts[0].token", "auth", "broker.password"]
    assert "pw-value" not in repr(stripped)
    assert "t-value" not in repr(stripped)


def test_keep_signins_puts_back_what_the_file_lacks() -> None:
    """Sign-ins absent from the incoming value are kept from this system."""
    current = {"host": "old", "password": "here", "broker": {"token": "t", "port": 1}}
    incoming = {"host": "new", "broker": {"port": 2}}
    assert keep_signins(incoming, current) == {
        "host": "new",
        "password": "here",
        "broker": {"port": 2, "token": "t"},
    }


def test_keep_signins_lets_the_file_win_when_it_carries_one() -> None:
    """A sign-in in the incoming value replaces the one here."""
    assert keep_signins({"password": "new"}, {"password": "old"}) == {
        "password": "new"
    }


def test_keep_signins_drops_ordinary_keys_the_file_lacks() -> None:
    """An ordinary setting missing from the file is removed, not kept."""
    assert keep_signins({}, {"host": "old"}) == {}
