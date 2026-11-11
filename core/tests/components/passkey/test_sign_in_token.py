"""Tests for the signed sign-in challenges."""

from collections.abc import Callable
from datetime import timedelta

from freezegun.api import FrozenDateTimeFactory
import pytest

from homeassistant.components.passkey.const import CHALLENGE_TTL, MAX_TOKEN_LENGTH
from homeassistant.components.passkey.origin import RelyingParty
from homeassistant.components.passkey.sign_in_token import SignInTokens, remote_key

RELYING_PARTY = RelyingParty(origin="https://ha.example.com", rp_id="ha.example.com")


def _issue(tokens: SignInTokens, **overrides: str | None) -> str:
    fields = {
        "challenge": b"0123456789abcdef0123456789abcdef",
        "remote": "203.0.113.5",
        "relying_party": RELYING_PARTY,
        "client_id": "https://ha.example.com/",
        "redirect_uri": "https://ha.example.com/?auth_callback=1",
        "code_challenge": None,
        "code_challenge_method": None,
    }
    return tokens.issue(**{**fields, **overrides})


def test_token_carries_what_it_is_bound_to() -> None:
    """Everything the finish step needs comes back out of a genuine token."""
    tokens = SignInTokens()

    challenge = tokens.verify(
        _issue(tokens, code_challenge="c" * 43, code_challenge_method="S256")
    )

    assert challenge is not None
    assert challenge.challenge == b"0123456789abcdef0123456789abcdef"
    assert challenge.remote == "203.0.113.5"
    assert challenge.relying_party == RELYING_PARTY
    assert challenge.client_id == "https://ha.example.com/"
    assert challenge.redirect_uri == "https://ha.example.com/?auth_callback=1"
    assert challenge.code_challenge == "c" * 43
    assert challenge.code_challenge_method == "S256"


def test_a_token_is_not_stored_by_issuing_it() -> None:
    """Issuing is stateless; only consuming remembers a token id."""
    tokens = SignInTokens()
    for _ in range(50):
        _issue(tokens)

    assert tokens._used == {}


@pytest.mark.parametrize(
    "mangle",
    [
        pytest.param(lambda t: t + "A", id="longer_signature"),
        pytest.param(lambda t: "A" + t, id="changed_body"),
        pytest.param(lambda t: t.partition(".")[0], id="no_signature"),
        pytest.param(lambda t: "." + t.partition(".")[2], id="no_body"),
        pytest.param(lambda t: "", id="empty"),
        pytest.param(lambda t: "!!!.!!!", id="not_base64"),
        pytest.param(lambda t: t + "A" * MAX_TOKEN_LENGTH, id="oversized"),
    ],
)
def test_altered_token_is_refused(mangle: Callable[[str], str]) -> None:
    """Any change to a token makes it invalid."""
    tokens = SignInTokens()

    assert tokens.verify(mangle(_issue(tokens))) is None


def test_token_of_another_key_is_refused() -> None:
    """A token only verifies against the key that signed it."""
    assert SignInTokens().verify(_issue(SignInTokens())) is None


def test_token_expires(freezer: FrozenDateTimeFactory) -> None:
    """A token is refused once its lifetime is over."""
    tokens = SignInTokens()
    token = _issue(tokens)

    freezer.tick(CHALLENGE_TTL - timedelta(seconds=1))
    assert tokens.verify(token) is not None
    freezer.tick(timedelta(seconds=2))
    assert tokens.verify(token) is None


def test_token_can_be_consumed_once(freezer: FrozenDateTimeFactory) -> None:
    """A replayed token is refused until it would have expired anyway."""
    tokens = SignInTokens()
    challenge = tokens.verify(_issue(tokens))
    assert challenge is not None

    assert tokens.consume(challenge) is True
    assert tokens.consume(challenge) is False

    freezer.tick(CHALLENGE_TTL + timedelta(seconds=1))
    assert tokens.verify(_issue(tokens)) is not None
    other = tokens.verify(_issue(tokens))
    assert other is not None
    assert tokens.consume(other) is True
    assert challenge.token_id not in tokens._used


def test_replay_set_is_bounded(monkeypatch: pytest.MonkeyPatch) -> None:
    """A full replay set refuses further tokens instead of growing."""
    monkeypatch.setattr(
        "homeassistant.components.passkey.sign_in_token.MAX_USED_SIGN_IN_TOKENS", 2
    )
    tokens = SignInTokens()
    verified = [tokens.verify(_issue(tokens)) for _ in range(3)]
    assert all(verified)

    results = [tokens.consume(item) for item in verified if item]

    assert results == [True, True, False]


@pytest.mark.parametrize(
    ("address", "key"),
    [
        ("203.0.113.5", "203.0.113.5"),
        ("2001:db8:1:2::1", "2001:db8:1:2::"),
        ("2001:db8:1:2:ffff:ffff:ffff:ffff", "2001:db8:1:2::"),
        ("2001:db8:1:3::1", "2001:db8:1:3::"),
        ("::ffff:203.0.113.5", "203.0.113.5"),
        ("not-an-address", None),
        (None, None),
    ],
)
def test_remote_key(address: str | None, key: str | None) -> None:
    """IPv6 clients are keyed on their /64."""
    assert remote_key(address) == key
