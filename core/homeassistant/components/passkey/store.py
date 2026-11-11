"""Storage of passkeys and of the short-lived registration challenges."""

from dataclasses import asdict, dataclass, fields
from datetime import datetime
import logging
import secrets
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util
from homeassistant.util.hass_dict import HassKey

from .const import (
    CHALLENGE_TTL,
    MAX_PENDING_REGISTRATIONS,
    MAX_PENDING_REGISTRATIONS_PER_USER,
    STORAGE_KEY,
    STORAGE_VERSION,
)
from .origin import RelyingParty
from .sign_in_token import SignInTokens

_LOGGER = logging.getLogger(__name__)

DATA_STORE: HassKey[PasskeyStore] = HassKey("passkey_store")


@dataclass(slots=True)
class PasskeyCredential:
    """A public key credential. Only public material is ever stored."""

    id: str
    user_id: str
    public_key: str
    sign_count: int
    transports: list[str]
    name: str
    created: str
    rp_id: str
    last_used: str | None = None

    def as_public_dict(self) -> dict[str, Any]:
        """Return what is safe to show to the owner."""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "created": self.created,
            "last_used": self.last_used,
        }


@dataclass(slots=True)
class PendingRegistration:
    """A registration challenge that was issued and not used yet."""

    challenge: bytes
    relying_party: RelyingParty
    expires: datetime
    user_id: str
    connection: object


_CREDENTIAL_FIELDS = frozenset(field.name for field in fields(PasskeyCredential))
_REQUIRED_FIELDS = _CREDENTIAL_FIELDS - {"last_used"}


class PasskeyStore:
    """Own the stored passkeys, the pending registrations and the sign-in tokens."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the store."""
        self._hass = hass
        self._store: Store[dict[str, list[dict[str, Any]]]] = Store(
            hass, STORAGE_VERSION, STORAGE_KEY, private=True, atomic_writes=True
        )
        self._credentials: dict[str, PasskeyCredential] = {}
        self._registrations: dict[str, PendingRegistration] = {}
        self.sign_in_tokens = SignInTokens()

    async def async_load(self) -> None:
        """Load the stored passkeys, skipping any item that is malformed."""
        stored = await self._store.async_load()
        self._credentials = {}
        raw_items = stored.get("credentials") if isinstance(stored, dict) else None
        if not isinstance(raw_items, list):
            if stored is not None:
                _LOGGER.error(
                    "The stored passkeys have an unexpected shape and were not loaded"
                )
            return
        for index, item in enumerate(raw_items):
            credential = self._parse(item)
            if credential is None:
                _LOGGER.error("Skipping malformed stored passkey number %s", index)
                continue
            self._credentials[credential.id] = credential

    @staticmethod
    def _parse(item: object) -> PasskeyCredential | None:
        if not isinstance(item, dict) or not _REQUIRED_FIELDS <= item.keys():
            return None
        if not _CREDENTIAL_FIELDS >= item.keys():
            return None
        try:
            credential = PasskeyCredential(**item)
        except TypeError:
            return None
        if (
            not all(
                isinstance(getattr(credential, name), str)
                for name in ("id", "user_id", "public_key", "name", "created", "rp_id")
            )
            or not isinstance(credential.sign_count, int)
            or not isinstance(credential.transports, list)
            or not (credential.last_used is None or isinstance(credential.last_used, str))
        ):
            return None
        return credential

    async def _async_save(self) -> None:
        await self._store.async_save(
            {"credentials": [asdict(item) for item in self._credentials.values()]}
        )

    def get(self, credential_id: str) -> PasskeyCredential | None:
        """Return a passkey by its credential id."""
        return self._credentials.get(credential_id)

    def for_user(self, user_id: str) -> list[PasskeyCredential]:
        """Return the passkeys of one user, oldest first."""
        return sorted(
            (item for item in self._credentials.values() if item.user_id == user_id),
            key=lambda item: item.created,
        )

    async def async_add(self, credential: PasskeyCredential) -> None:
        """Add a passkey."""
        self._credentials[credential.id] = credential
        await self._async_save()

    async def async_save_changes(self) -> None:
        """Persist a change made to a stored passkey."""
        await self._async_save()

    async def async_remove(self, credential_id: str) -> None:
        """Remove a passkey."""
        if self._credentials.pop(credential_id, None) is not None:
            await self._async_save()

    async def async_remove_user(self, user_id: str) -> int:
        """Remove every passkey of a user and return how many were removed."""
        doomed = [item.id for item in self.for_user(user_id)]
        for credential_id in doomed:
            del self._credentials[credential_id]
        if doomed:
            await self._async_save()
        return len(doomed)

    def _purge_expired(self, now: datetime) -> None:
        for key in [k for k, v in self._registrations.items() if v.expires <= now]:
            del self._registrations[key]

    def add_registration(
        self,
        *,
        challenge: bytes,
        relying_party: RelyingParty,
        user_id: str,
        connection: object,
    ) -> str | None:
        """Remember a registration challenge and return the id the client sends back.

        A user keeps at most a few pending registrations; starting another replaces
        their own oldest one. Nobody else's entry is ever evicted, and when the pool
        is full the newcomer is refused with None.
        """
        now = dt_util.utcnow()
        self._purge_expired(now)

        own = [k for k, v in self._registrations.items() if v.user_id == user_id]
        while len(own) >= MAX_PENDING_REGISTRATIONS_PER_USER:
            del self._registrations[own.pop(0)]
        if len(self._registrations) >= MAX_PENDING_REGISTRATIONS:
            return None

        challenge_id = secrets.token_urlsafe(32)
        self._registrations[challenge_id] = PendingRegistration(
            challenge=challenge,
            relying_party=relying_party,
            expires=now + CHALLENGE_TTL,
            user_id=user_id,
            connection=connection,
        )
        return challenge_id

    def pop_registration(self, challenge_id: str) -> PendingRegistration | None:
        """Take a registration challenge. It is gone afterwards, whatever the outcome."""
        pending = self._registrations.pop(challenge_id, None)
        if pending is None or pending.expires <= dt_util.utcnow():
            return None
        return pending
