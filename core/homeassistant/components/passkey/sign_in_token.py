"""Stateless, signed sign-in challenges.

Starting a sign-in stores nothing on the server. The challenge and everything it
is bound to travel inside a token signed with a key that only lives in memory.
The only state is the set of token ids that were already presented to finish,
kept until the token would have expired anyway.
"""

import base64
import binascii
from dataclasses import dataclass
from datetime import datetime
import hashlib
import heapq
import hmac
from ipaddress import IPv6Address, ip_address, ip_network
import json
import secrets
from typing import Any

from homeassistant.util import dt as dt_util

from .const import (
    CHALLENGE_TTL,
    MAX_TOKEN_LENGTH,
    MAX_USED_PER_REMOTE,
    MAX_USED_SIGN_IN_TOKENS,
)
from .origin import RelyingParty


def remote_key(address: str | None) -> str | None:
    """Return the address a limit or binding is keyed on.

    IPv6 clients are keyed on their /64, because one subscriber controls a whole
    /64 and could otherwise show a new address for every request.
    """
    if address is None:
        return None
    try:
        parsed = ip_address(address)
    except ValueError:
        return None
    if isinstance(parsed, IPv6Address):
        if parsed.ipv4_mapped is not None:
            return str(parsed.ipv4_mapped)
        return str(ip_network(f"{parsed}/64", strict=False).network_address)
    return str(parsed)


def _encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


@dataclass(frozen=True, slots=True)
class SignInChallenge:
    """The verified content of a sign-in token."""

    token_id: str
    challenge: bytes
    expires: datetime
    remote: str
    relying_party: RelyingParty
    client_id: str
    redirect_uri: str
    code_challenge: str | None
    code_challenge_method: str | None


class SignInTokens:
    """Issue and verify signed sign-in challenges."""

    def __init__(self) -> None:
        """Generate the signing key. It is never stored."""
        self._key = secrets.token_bytes(32)
        self._used: dict[str, datetime] = {}
        self._expiries: list[tuple[datetime, str, str]] = []
        self._per_remote: dict[str, int] = {}

    def _sign(self, body: str) -> str:
        return _encode(hmac.digest(self._key, body.encode(), hashlib.sha256))

    def issue(
        self,
        *,
        challenge: bytes,
        remote: str,
        relying_party: RelyingParty,
        client_id: str,
        redirect_uri: str,
        code_challenge: str | None,
        code_challenge_method: str | None,
    ) -> str:
        """Return a signed token carrying the challenge and what it is bound to."""
        payload: dict[str, Any] = {
            "i": secrets.token_urlsafe(16),
            "c": _encode(challenge),
            "e": (dt_util.utcnow() + CHALLENGE_TTL).timestamp(),
            "r": remote,
            "o": relying_party.origin,
            "p": relying_party.rp_id,
            "a": client_id,
            "u": redirect_uri,
            "x": code_challenge,
            "m": code_challenge_method,
        }
        body = _encode(json.dumps(payload, separators=(",", ":")).encode())
        return f"{body}.{self._sign(body)}"

    def verify(self, token: str) -> SignInChallenge | None:
        """Return the content of a genuine, unexpired token, else None."""
        if len(token) > MAX_TOKEN_LENGTH or not token.isascii():
            return None
        body, separator, signature = token.partition(".")
        if not separator or not hmac.compare_digest(
            self._sign(body).encode(), signature.encode()
        ):
            return None
        try:
            payload = json.loads(_decode(body))
            expires = dt_util.utc_from_timestamp(payload["e"])
            result = SignInChallenge(
                token_id=payload["i"],
                challenge=_decode(payload["c"]),
                expires=expires,
                remote=payload["r"],
                relying_party=RelyingParty(origin=payload["o"], rp_id=payload["p"]),
                client_id=payload["a"],
                redirect_uri=payload["u"],
                code_challenge=payload["x"],
                code_challenge_method=payload["m"],
            )
        except (ValueError, KeyError, TypeError, binascii.Error):
            return None
        if expires <= dt_util.utcnow():
            return None
        return result

    def _drop_earliest(self) -> None:
        _, token_id, remote = heapq.heappop(self._expiries)
        del self._used[token_id]
        if self._per_remote[remote] <= 1:
            del self._per_remote[remote]
        else:
            self._per_remote[remote] -= 1

    def consume(self, challenge: SignInChallenge) -> bool:
        """Mark a token as used.

        Call this only once the assertion has been verified. Return False when
        the token was used before or its address already holds too many entries.
        A full set drops the entry that would expire first.
        """
        now = dt_util.utcnow()
        while self._expiries and self._expiries[0][0] <= now:
            self._drop_earliest()
        if (
            challenge.token_id in self._used
            or self._per_remote.get(challenge.remote, 0) >= MAX_USED_PER_REMOTE
        ):
            return False
        if len(self._used) >= MAX_USED_SIGN_IN_TOKENS:
            self._drop_earliest()
        self._used[challenge.token_id] = challenge.expires
        heapq.heappush(
            self._expiries, (challenge.expires, challenge.token_id, challenge.remote)
        )
        self._per_remote[challenge.remote] = (
            self._per_remote.get(challenge.remote, 0) + 1
        )
        return True
