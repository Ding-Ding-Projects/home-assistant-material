"""Tests for the guided setup, reconfigure, reauth and options flows."""

import json
from typing import Any

import pytest
from pytest_homeassistant.common import MockConfigEntry

from homeassistant.components.registry_storage.client import RegistryClient
from homeassistant.components.registry_storage.const import (
    CONF_ADDRESS,
    CONF_BACKUPS_REPOSITORY,
    CONF_CAMERA,
    CONF_CAMERA_REPOSITORIES,
    CONF_KEY_REF,
    CONF_OLD_PASSWORD,
    CONF_PASSWORD,
    CONF_PASSWORD_CONFIRMATION,
    CONF_REGISTRY,
    CONF_REPOSITORY,
    CONF_TOKEN,
    CONF_UNDERSTAND,
    CONF_USERNAME,
    DOMAIN,
)
from homeassistant.components.registry_storage.crypto import (
    new_vault_key,
    wrap_vault_key,
)
from homeassistant.components.registry_storage.store import (
    KeyStore,
    async_publish_lock,
    async_read_lock,
)
from homeassistant.config_entries import SOURCE_USER, ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType

from .common import BASE, TOKEN, USER, FakeRegistry
from .conftest import PASSWORD, REPOSITORY

GOOD = {
    CONF_PASSWORD: PASSWORD,
    CONF_PASSWORD_CONFIRMATION: PASSWORD,
    CONF_UNDERSTAND: True,
}


async def _start(
    hass: HomeAssistant, registry_choice: str = "docker_hub", **extra: Any
):
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    assert result["step_id"] == "user"
    return await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_REGISTRY: registry_choice, **extra}
    )


async def _to_password(hass: HomeAssistant):
    result = await _start(hass)
    assert result["step_id"] == "sign_in"
    return await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_USERNAME: USER, CONF_TOKEN: TOKEN}
    )


async def _to_repository(hass: HomeAssistant, password: str = PASSWORD):
    result = await _to_password(hass)
    assert result["step_id"] == "password"
    return await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {
            CONF_PASSWORD: password,
            CONF_PASSWORD_CONFIRMATION: password,
            CONF_UNDERSTAND: True,
        },
    )


@pytest.mark.usefixtures("patch_session")
async def test_full_flow(
    hass: HomeAssistant, registry: FakeRegistry, hass_storage: dict
) -> None:
    """Four steps end with a place, a stored key, a lock in the repository and no password anywhere."""
    result = await _to_repository(hass)
    assert result["step_id"] == "repository"
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_REPOSITORY: "Tester/Home-Vault"}
    )
    assert result["step_id"] == "finish"
    assert result["description_placeholders"]["repository"] == "tester/home-vault"
    assert "public" in result["description_placeholders"]["visibility"]
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    data = result["data"]
    assert data[CONF_REPOSITORY] == "tester/home-vault"
    assert data[CONF_ADDRESS] == "https://registry-1.docker.io"
    assert data[CONF_TOKEN] == TOKEN
    assert "lock" in registry.manifests["tester/home-vault"]

    key_file = hass_storage[f"registry_storage.{data[CONF_KEY_REF]}"]["data"]
    assert len(bytes.fromhex(key_file["vault_key"])) == 32
    assert PASSWORD not in json.dumps(data)
    assert PASSWORD not in json.dumps(key_file)
    assert PASSWORD.encode() not in registry.stored_bytes()
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    assert entry.state is ConfigEntryState.LOADED
    assert entry.title == "tester/home-vault"


@pytest.mark.usefixtures("patch_session")
async def test_private_repository_is_shown_truthfully(
    hass: HomeAssistant, registry: FakeRegistry
) -> None:
    """A repository that is not readable without signing in is shown as such."""
    registry.public = False
    result = await _to_repository(hass)
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_REPOSITORY: REPOSITORY}
    )
    assert "not readable" in result["description_placeholders"]["visibility"]


@pytest.mark.usefixtures("patch_session")
async def test_github_registry_uses_its_address(hass: HomeAssistant) -> None:
    """GitHub is known by name."""
    result = await _start(hass, "github")
    assert result["step_id"] == "sign_in"
    assert (
        "github.com/settings/tokens" in result["description_placeholders"]["token_page"]
    )
    assert result["description_placeholders"]["registry"] == "https://ghcr.io"


@pytest.mark.usefixtures("patch_session")
async def test_other_registry(hass: HomeAssistant) -> None:
    """Another registry is reached at the address given."""
    result = await _start(hass, "other", address="registry.example.com")
    assert result["step_id"] == "sign_in"
    assert (
        result["description_placeholders"]["registry"] == "https://registry.example.com"
    )


@pytest.mark.parametrize(
    ("address", "error"),
    [
        ("http://registry.example.com", "insecure_address"),
        ("", "invalid_address"),
        ("ftp://registry.example.com", "invalid_address"),
    ],
)
@pytest.mark.usefixtures("patch_session")
async def test_other_registry_address_errors(
    hass: HomeAssistant, address: str, error: str
) -> None:
    """A bad address is shown as an error on the address field."""
    result = await _start(hass, "other", address=address)
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {CONF_ADDRESS: error}


@pytest.mark.usefixtures("patch_session")
async def test_other_registry_not_a_registry(
    hass: HomeAssistant, registry: FakeRegistry
) -> None:
    """An address that does not speak the registry interface cannot be used."""
    registry.fail("GET", 404)
    result = await _start(hass, "other", address="registry.example.com")
    assert result["errors"] == {CONF_ADDRESS: "cannot_connect"}


@pytest.mark.parametrize(
    ("token", "can_push", "error"),
    [
        ("wrong", True, "invalid_auth"),
        (TOKEN, False, "read_only_token"),
    ],
)
@pytest.mark.usefixtures("patch_session")
async def test_sign_in_errors(
    hass: HomeAssistant, registry: FakeRegistry, token: str, can_push: bool, error: str
) -> None:
    """A wrong token, and a token that can only read, are explained."""
    registry.can_push = can_push
    result = await _start(hass)
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_USERNAME: USER, CONF_TOKEN: token}
    )
    assert result["step_id"] == "sign_in"
    assert result["errors"] == {"base": error}
    registry.can_push = True
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_USERNAME: USER, CONF_TOKEN: TOKEN}
    )
    assert result["step_id"] == "password"


@pytest.mark.parametrize(
    ("user_input", "errors"),
    [
        (
            {
                CONF_PASSWORD: "short",
                CONF_PASSWORD_CONFIRMATION: "short",
                CONF_UNDERSTAND: True,
            },
            {"base": "password_too_weak"},
        ),
        (
            {
                CONF_PASSWORD: PASSWORD,
                CONF_PASSWORD_CONFIRMATION: PASSWORD + "x",
                CONF_UNDERSTAND: True,
            },
            {"base": "password_mismatch"},
        ),
        (
            {
                CONF_PASSWORD: PASSWORD,
                CONF_PASSWORD_CONFIRMATION: PASSWORD,
                CONF_UNDERSTAND: False,
            },
            {CONF_UNDERSTAND: "understand_required"},
        ),
    ],
)
@pytest.mark.usefixtures("patch_session")
async def test_password_step_errors(
    hass: HomeAssistant, user_input: dict[str, Any], errors: dict[str, str]
) -> None:
    """The password cannot be weak, unconfirmed or accepted without the warning ticked."""
    result = await _to_password(hass)
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], user_input
    )
    assert result["step_id"] == "password"
    assert result["errors"] == errors
    assert "characters" in result["description_placeholders"]["strength"]


@pytest.mark.usefixtures("patch_session")
async def test_repository_name_error(hass: HomeAssistant) -> None:
    """A repository name a registry would refuse is caught in the form."""
    result = await _to_repository(hass)
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_REPOSITORY: "No Spaces/Allowed"}
    )
    assert result["errors"] == {CONF_REPOSITORY: "invalid_repository"}


@pytest.mark.usefixtures("patch_session")
async def test_repository_denied(hass: HomeAssistant, registry: FakeRegistry) -> None:
    """A registry that refuses writes to that repository shows an error and can be retried."""
    result = await _to_repository(hass)
    registry.fail("GET", 403)
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_REPOSITORY: REPOSITORY}
    )
    assert result["errors"] == {"base": "denied"}
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_REPOSITORY: REPOSITORY}
    )
    assert result["step_id"] == "finish"


@pytest.mark.usefixtures("patch_session")
async def test_joining_a_repository_that_is_already_locked(
    hass: HomeAssistant, registry: FakeRegistry, hass_storage: dict
) -> None:
    """The same password opens a repository another instance made; its key is adopted."""
    vault = new_vault_key()
    header = wrap_vault_key(vault, PASSWORD)
    client = RegistryClient(registry, BASE, USER, TOKEN)  # type: ignore[arg-type]
    await async_publish_lock(client, REPOSITORY, header)

    result = await _to_repository(hass)
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_REPOSITORY: REPOSITORY}
    )
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    key_file = hass_storage[f"registry_storage.{result['data'][CONF_KEY_REF]}"]["data"]
    assert bytes.fromhex(key_file["vault_key"]) == vault
    assert await async_read_lock(client, REPOSITORY) == header


@pytest.mark.usefixtures("patch_session")
async def test_joining_with_the_wrong_password(
    hass: HomeAssistant, registry: FakeRegistry
) -> None:
    """A repository locked with another password is not taken over."""
    client = RegistryClient(registry, BASE, USER, TOKEN)  # type: ignore[arg-type]
    await async_publish_lock(
        client, REPOSITORY, wrap_vault_key(new_vault_key(), "some other long password")
    )
    result = await _to_repository(hass)
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_REPOSITORY: REPOSITORY}
    )
    assert result["errors"] == {"base": "wrong_password"}


@pytest.mark.usefixtures("patch_session")
async def test_repository_that_is_not_ours(
    hass: HomeAssistant, registry: FakeRegistry
) -> None:
    """A repository whose lock tag is something else is reported."""
    client = RegistryClient(registry, BASE, USER, TOKEN)  # type: ignore[arg-type]
    layer = await client.async_upload_blob(REPOSITORY, b"{}")
    manifest = (
        b'{"schemaVersion":2,"config":{"mediaType":"x","digest":"%s","size":2},"layers":[]}'
        % layer.encode()
    )
    await client.async_put_manifest(REPOSITORY, "lock", manifest)
    result = await _to_repository(hass)
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_REPOSITORY: REPOSITORY}
    )
    assert result["errors"] == {"base": "not_locked"}


@pytest.mark.usefixtures("patch_session")
async def test_same_place_twice(hass: HomeAssistant) -> None:
    """The same account and repository cannot be added twice."""
    for expected in (FlowResultType.CREATE_ENTRY, FlowResultType.ABORT):
        result = await _to_repository(hass)
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"], {CONF_REPOSITORY: REPOSITORY}
        )
        result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
        assert result["type"] is expected
    assert result["reason"] == "already_configured"


async def _entry(hass: HomeAssistant, registry: FakeRegistry) -> MockConfigEntry:
    vault = new_vault_key()
    header = wrap_vault_key(vault, PASSWORD)
    await KeyStore(hass, "ref1").async_save(vault, header)
    entry = MockConfigEntry(
        domain=DOMAIN,
        unique_id="registry-1.docker.io/tester/tester/vault",
        title=REPOSITORY,
        data={
            CONF_REGISTRY: "docker_hub",
            CONF_ADDRESS: "https://registry-1.docker.io",
            CONF_USERNAME: USER,
            CONF_TOKEN: TOKEN,
            CONF_REPOSITORY: REPOSITORY,
            CONF_KEY_REF: "ref1",
        },
    )
    entry.add_to_hass(hass)
    return entry


@pytest.mark.usefixtures("patch_session")
async def test_reconfigure_token(hass: HomeAssistant, registry: FakeRegistry) -> None:
    """The token can be changed, and is checked first."""
    entry = await _entry(hass, registry)
    assert await hass.config_entries.async_setup(entry.entry_id)
    result = await entry.start_reconfigure_flow(hass)
    assert result["step_id"] == "sign_in"
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_USERNAME: USER, CONF_TOKEN: "nope"}
    )
    assert result["errors"] == {"base": "invalid_auth"}
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_USERNAME: USER, CONF_TOKEN: TOKEN}
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "reconfigure_successful"


@pytest.mark.usefixtures("patch_session")
async def test_reauth_when_the_token_is_refused(
    hass: HomeAssistant, registry: FakeRegistry
) -> None:
    """A refused saved token starts a flow that asks for a new one."""
    entry = await _entry(hass, registry)
    hass.config_entries.async_update_entry(
        entry, data={**entry.data, CONF_TOKEN: "revoked"}
    )
    assert not await hass.config_entries.async_setup(entry.entry_id)
    assert entry.state is ConfigEntryState.SETUP_ERROR
    flows = hass.config_entries.flow.async_progress_by_handler(DOMAIN)
    assert [flow["context"]["source"] for flow in flows] == ["reauth"]
    result = await hass.config_entries.flow.async_configure(
        flows[0]["flow_id"], {CONF_USERNAME: USER, CONF_TOKEN: TOKEN}
    )
    assert result["type"] is FlowResultType.ABORT
    assert entry.data[CONF_TOKEN] == TOKEN


@pytest.mark.usefixtures("patch_session")
async def test_options_repositories(
    hass: HomeAssistant, registry: FakeRegistry
) -> None:
    """A camera and the backups can have their own repositories, made on the spot."""
    entry = await _entry(hass, registry)
    assert await hass.config_entries.async_setup(entry.entry_id)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] is FlowResultType.MENU
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "repositories"}
    )
    assert result["description_placeholders"]["default"] == REPOSITORY
    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {
            CONF_CAMERA: "camera.front_door",
            CONF_REPOSITORY: "tester/front-door",
            CONF_BACKUPS_REPOSITORY: "tester/backups",
        },
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options[CONF_CAMERA_REPOSITORIES] == {
        "camera.front_door": "tester/front-door"
    }
    assert entry.options[CONF_BACKUPS_REPOSITORY] == "tester/backups"
    assert "lock" in registry.manifests["tester/front-door"]
    assert "lock" in registry.manifests["tester/backups"]
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.LOADED

    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "repositories"}
    )
    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {CONF_CAMERA: "camera.front_door", CONF_BACKUPS_REPOSITORY: ""},
    )
    assert entry.options[CONF_CAMERA_REPOSITORIES] == {}
    assert entry.options[CONF_BACKUPS_REPOSITORY] is None


@pytest.mark.usefixtures("patch_session")
async def test_options_repository_errors(
    hass: HomeAssistant, registry: FakeRegistry
) -> None:
    """A bad repository name or a refusing registry is shown and nothing is saved."""
    entry = await _entry(hass, registry)
    assert await hass.config_entries.async_setup(entry.entry_id)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "repositories"}
    )
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {CONF_BACKUPS_REPOSITORY: "Bad Name"}
    )
    assert result["errors"] == {"base": "invalid_repository"}
    registry.fail("GET", 403)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {CONF_BACKUPS_REPOSITORY: "tester/backups"}
    )
    assert result["errors"] == {"base": "denied"}
    assert entry.options.get(CONF_BACKUPS_REPOSITORY) is None


@pytest.mark.usefixtures("patch_session")
async def test_options_change_password(
    hass: HomeAssistant, registry: FakeRegistry
) -> None:
    """The password changes only with the old one, and the lock in the registry follows."""
    entry = await _entry(hass, registry)
    assert await hass.config_entries.async_setup(entry.entry_id)
    new = "cobalt yonder wombat sprocket larkspur"
    for user_input, error in (
        (
            {
                CONF_OLD_PASSWORD: "wrong password here",
                CONF_PASSWORD: new,
                CONF_PASSWORD_CONFIRMATION: new,
                CONF_UNDERSTAND: True,
            },
            "wrong_password",
        ),
        (
            {
                CONF_OLD_PASSWORD: PASSWORD,
                CONF_PASSWORD: "short",
                CONF_PASSWORD_CONFIRMATION: "short",
                CONF_UNDERSTAND: True,
            },
            "password_too_weak",
        ),
        (
            {
                CONF_OLD_PASSWORD: PASSWORD,
                CONF_PASSWORD: new,
                CONF_PASSWORD_CONFIRMATION: new + "x",
                CONF_UNDERSTAND: True,
            },
            "password_mismatch",
        ),
        (
            {
                CONF_OLD_PASSWORD: PASSWORD,
                CONF_PASSWORD: new,
                CONF_PASSWORD_CONFIRMATION: new,
                CONF_UNDERSTAND: False,
            },
            None,
        ),
    ):
        result = await hass.config_entries.options.async_init(entry.entry_id)
        result = await hass.config_entries.options.async_configure(
            result["flow_id"], {"next_step_id": "password"}
        )
        result = await hass.config_entries.options.async_configure(
            result["flow_id"], user_input
        )
        assert result["type"] is FlowResultType.FORM
        expected = (
            {"base": error} if error else {CONF_UNDERSTAND: "understand_required"}
        )
        assert result["errors"] == expected
        hass.config_entries.options.async_abort(result["flow_id"])

    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "password"}
    )
    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {
            CONF_OLD_PASSWORD: PASSWORD,
            CONF_PASSWORD: new,
            CONF_PASSWORD_CONFIRMATION: new,
            CONF_UNDERSTAND: True,
        },
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY


async def test_options_when_not_loaded(
    hass: HomeAssistant, registry: FakeRegistry
) -> None:
    """The options need the place to be running."""
    entry = await _entry(hass, registry)
    for step in ("repositories", "password"):
        result = await hass.config_entries.options.async_init(entry.entry_id)
        result = await hass.config_entries.options.async_configure(
            result["flow_id"], {"next_step_id": step}
        )
        assert result["type"] is FlowResultType.ABORT
        assert result["reason"] == "not_loaded"
