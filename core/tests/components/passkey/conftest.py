"""Test configuration for passkey."""

from dataclasses import dataclass

import pytest
from pytest_homeassistant.common import register_auth_provider
from pytest_homeassistant.typing import ClientSessionGenerator

from homeassistant.auth.models import Credentials, User
from homeassistant.components.passkey.store import DATA_STORE, PasskeyCredential
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

from .authenticator import SoftwareAuthenticator

ORIGIN = "http://localhost"
RP_ID = "localhost"


@pytest.fixture
def aiohttp_client(
    aiohttp_client: ClientSessionGenerator,
    socket_enabled: None,
) -> ClientSessionGenerator:
    """Return aiohttp_client and allow opening sockets."""
    return aiohttp_client


@pytest.fixture(autouse=True)
async def setup_passkey(hass: HomeAssistant) -> None:
    """Set up the integration, two auth providers and an unrelated owner."""
    await register_auth_provider(hass, {"type": "insecure_example", "users": []})
    await register_auth_provider(hass, {"type": "homeassistant"})
    assert await async_setup_component(hass, "passkey", {})
    await hass.auth.async_create_user("Owner")


@dataclass
class Account:
    """A user together with the authenticator that holds their passkey."""

    user: User
    authenticator: SoftwareAuthenticator

    @property
    def handle(self) -> bytes:
        """Return the user handle the authenticator returns."""
        return self.user.id.encode()


async def create_account(
    hass: HomeAssistant,
    name: str = "Test User",
    *,
    register: bool = True,
    provider_types: tuple[str, ...] = ("insecure_example",),
    local_only: bool | None = None,
) -> Account:
    """Create a user with credentials and, optionally, a stored passkey."""
    user = await hass.auth.async_create_user(name, local_only=local_only)
    user.credentials.extend(
        Credentials(
            auth_provider_type=provider_type,
            auth_provider_id=None,
            data={"username": name},
            is_new=False,
        )
        for provider_type in provider_types
    )
    authenticator = SoftwareAuthenticator(origin=ORIGIN, rp_id=RP_ID)
    if register:
        await hass.data[DATA_STORE].async_add(
            PasskeyCredential(
                id=authenticator.credential_id_b64,
                user_id=user.id,
                public_key=authenticator.public_key_b64,
                sign_count=0,
                transports=["internal"],
                name="Laptop",
                created="2026-01-01T00:00:00+00:00",
                rp_id=RP_ID,
            )
        )
    return Account(user, authenticator)


@pytest.fixture
async def account(hass: HomeAssistant) -> Account:
    """Return a user with a stored passkey."""
    return await create_account(hass)
