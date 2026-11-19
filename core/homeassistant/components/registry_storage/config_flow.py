"""Guided setup, reconfigure and options for the Container registry storage integration."""

import secrets
from typing import Any
from urllib.parse import urlsplit

import probatio

from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import (
    BooleanSelector,
    EntitySelector,
    EntitySelectorConfig,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)

from .client import RegistryClient, normalize_address, valid_repository
from .const import (
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
    REGISTRY_ADDRESSES,
    TOKEN_PAGES,
    RegistryKind,
)
from .crypto import new_vault_key, unwrap_vault_key, wrap_vault_key
from .errors import LockError, Reason, RegistryStorageError
from .passwords import check_password, require_password
from .store import KeyStore, async_publish_lock, async_read_lock

_PASSWORD = TextSelector(TextSelectorConfig(type=TextSelectorType.PASSWORD))
_TEXT = TextSelector(TextSelectorConfig(type=TextSelectorType.TEXT))

_ERROR_KEYS = {
    Reason.AUTH_FAILED: "invalid_auth",
    Reason.DENIED: "denied",
    Reason.NOT_FOUND: "cannot_connect",
    Reason.RATE_LIMITED: "rate_limited",
    Reason.UNAVAILABLE: "cannot_connect",
    Reason.TIMEOUT: "cannot_connect",
    Reason.INVALID_RESPONSE: "cannot_connect",
    Reason.REJECTED: "rejected",
    Reason.INSECURE_ADDRESS: "insecure_address",
    Reason.INVALID_ADDRESS: "invalid_address",
    Reason.INVALID_REPOSITORY: "invalid_repository",
    Reason.WRONG_PASSWORD: "wrong_password",
    Reason.NOT_LOCKED: "not_locked",
    Reason.UNSUPPORTED_FORMAT: "not_locked",
    Reason.PASSWORD_MISMATCH: "password_mismatch",
    Reason.PASSWORD_TOO_WEAK: "password_too_weak",
}


def error_key(reason: Reason) -> str:
    """Return the form error for a reason code."""
    return _ERROR_KEYS.get(reason, "unknown")


def _password_schema(*, old: bool = False) -> probatio.Schema:
    fields: dict[Any, Any] = {}
    if old:
        fields[probatio.Required(CONF_OLD_PASSWORD)] = _PASSWORD
    fields[probatio.Required(CONF_PASSWORD)] = _PASSWORD
    fields[probatio.Required(CONF_PASSWORD_CONFIRMATION)] = _PASSWORD
    fields[probatio.Required(CONF_UNDERSTAND, default=False)] = BooleanSelector()
    return probatio.Schema(fields)


def _strength_line(password: str) -> str:
    check = check_password(password)
    return f"{check.length} characters, {check.rating.value.replace('_', ' ')}"


class RegistryStorageConfigFlow(ConfigFlow, domain=DOMAIN):
    """Four guided steps: which registry, sign in, password, repository."""

    VERSION = 1

    def __init__(self) -> None:
        """Start with nothing chosen. The password lives only in this object, only until the end."""
        self._registry = RegistryKind.DOCKER_HUB
        self._address = REGISTRY_ADDRESSES[RegistryKind.DOCKER_HUB]
        self._username = ""
        self._token = ""
        self._password = ""
        self._repository = ""
        self._visibility = ""
        self._vault_key = b""
        self._header: dict[str, Any] = {}
        self._reconfigure_entry: ConfigEntry | None = None

    def _client(self) -> RegistryClient:
        return RegistryClient(
            async_get_clientsession(self.hass),
            self._address,
            self._username,
            self._token,
        )

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Step 1: which registry."""
        errors: dict[str, str] = {}
        if user_input is not None:
            self._registry = RegistryKind(user_input[CONF_REGISTRY])
            if self._registry is RegistryKind.OTHER:
                try:
                    self._address = normalize_address(user_input.get(CONF_ADDRESS, ""))
                    await RegistryClient(
                        async_get_clientsession(self.hass), self._address, None, None
                    ).async_check_version()
                except RegistryStorageError as err:
                    errors[CONF_ADDRESS] = error_key(err.reason)
            else:
                self._address = REGISTRY_ADDRESSES[self._registry]
            if not errors:
                return await self.async_step_sign_in()
        return self.async_show_form(
            step_id="user",
            data_schema=probatio.Schema(
                {
                    probatio.Required(
                        CONF_REGISTRY, default=self._registry.value
                    ): SelectSelector(
                        SelectSelectorConfig(
                            options=[kind.value for kind in RegistryKind],
                            translation_key="registry",
                            mode=SelectSelectorMode.LIST,
                        )
                    ),
                    probatio.Optional(CONF_ADDRESS): _TEXT,
                }
            ),
            errors=errors,
        )

    async def async_step_sign_in(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Step 2: guided sign-in with an access token."""
        errors: dict[str, str] = {}
        if user_input is not None:
            self._username = user_input[CONF_USERNAME].strip()
            self._token = user_input[CONF_TOKEN].strip()
            try:
                # The repository is not chosen yet; the sign-in is checked against the account's own space.
                probe = f"{self._username.lower()}/registry-storage-check"
                check = await self._client().async_check_credentials(probe)
            except RegistryStorageError as err:
                errors["base"] = error_key(err.reason)
            else:
                if check.can_push is False:
                    errors["base"] = "read_only_token"
                elif self._reconfigure_entry is not None:
                    return self.async_update_reload_and_abort(
                        self._reconfigure_entry,
                        data_updates={
                            CONF_USERNAME: self._username,
                            CONF_TOKEN: self._token,
                        },
                        reason="reconfigure_successful",
                    )
                else:
                    return await self.async_step_password()
        return self.async_show_form(
            step_id="sign_in",
            data_schema=probatio.Schema(
                {
                    probatio.Required(CONF_USERNAME, default=self._username): _TEXT,
                    probatio.Required(CONF_TOKEN): _PASSWORD,
                }
            ),
            description_placeholders={
                "token_page": TOKEN_PAGES.get(
                    self._registry, urlsplit(self._address).netloc
                ),
                "registry": self._address,
            },
            errors=errors,
        )

    async def async_step_password(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Step 3: the password that locks everything."""
        errors: dict[str, str] = {}
        strength = ""
        if user_input is not None:
            password = user_input[CONF_PASSWORD]
            strength = _strength_line(password)
            try:
                require_password(password, user_input[CONF_PASSWORD_CONFIRMATION])
            except LockError as err:
                errors["base"] = error_key(err.reason)
            else:
                if not user_input[CONF_UNDERSTAND]:
                    errors[CONF_UNDERSTAND] = "understand_required"
                else:
                    self._password = password
                    return await self.async_step_repository()
        return self.async_show_form(
            step_id="password",
            data_schema=_password_schema(),
            description_placeholders={"strength": strength or "not typed yet"},
            errors=errors,
        )

    async def async_step_repository(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Step 4: the default repository. It is made if missing and its state is read."""
        errors: dict[str, str] = {}
        if user_input is not None:
            repository = user_input[CONF_REPOSITORY].strip().lower()
            if not valid_repository(repository):
                errors[CONF_REPOSITORY] = "invalid_repository"
            else:
                try:
                    await self._prepare_repository(repository)
                except RegistryStorageError as err:
                    errors["base"] = error_key(err.reason)
                else:
                    return await self.async_step_finish()
        default = self._repository or f"{self._username.lower()}/home-vault"
        return self.async_show_form(
            step_id="repository",
            data_schema=probatio.Schema(
                {probatio.Required(CONF_REPOSITORY, default=default): _TEXT}
            ),
            errors=errors,
        )

    async def _prepare_repository(self, repository: str) -> None:
        client = self._client()
        existing = await async_read_lock(client, repository)
        if existing is not None:
            self._vault_key = await self.hass.async_add_executor_job(
                unwrap_vault_key, existing, self._password
            )
            self._header = existing
        else:
            self._vault_key = new_vault_key()
            self._header = await self.hass.async_add_executor_job(
                wrap_vault_key, self._vault_key, self._password
            )
            await async_publish_lock(client, repository, self._header)
        public = await client.async_is_public(repository)
        self._repository = repository
        self._visibility = (
            "public: anyone can copy the locked files"
            if public
            else "not readable without signing in"
        )

    async def async_step_finish(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Show the repository's real state and create the place."""
        if user_input is not None:
            key_ref = secrets.token_hex(16)
            await KeyStore(self.hass, key_ref).async_save(self._vault_key, self._header)
            self._password = ""
            await self.async_set_unique_id(
                f"{urlsplit(self._address).netloc}/{self._username.lower()}/{self._repository}"
            )
            self._abort_if_unique_id_configured()
            return self.async_create_entry(
                title=self._repository,
                data={
                    CONF_REGISTRY: self._registry.value,
                    CONF_ADDRESS: self._address,
                    CONF_USERNAME: self._username,
                    CONF_TOKEN: self._token,
                    CONF_REPOSITORY: self._repository,
                    CONF_KEY_REF: key_ref,
                },
            )
        return self.async_show_form(
            step_id="finish",
            description_placeholders={
                "repository": self._repository,
                "visibility": self._visibility,
            },
        )

    async def _change_token(
        self, entry: ConfigEntry, user_input: dict[str, Any] | None
    ) -> ConfigFlowResult:
        self._reconfigure_entry = entry
        self._address = entry.data[CONF_ADDRESS]
        self._registry = RegistryKind(entry.data[CONF_REGISTRY])
        self._username = entry.data[CONF_USERNAME]
        return await self.async_step_sign_in(user_input)

    async def async_step_reconfigure(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Change the token (and account name)."""
        return await self._change_token(self._get_reconfigure_entry(), user_input)

    async def async_step_reauth(self, entry_data: dict[str, Any]) -> ConfigFlowResult:
        """Ask for a new token when the registry refused the old one, or for the password when the key is gone."""
        entry = self._get_reauth_entry()
        if await KeyStore(self.hass, entry.data[CONF_KEY_REF]).async_load() is None:
            return await self.async_step_restore_key()
        return await self._change_token(entry, None)

    async def async_step_restore_key(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Make the key again from the password, for example after a restore."""
        entry = self._get_reauth_entry()
        errors: dict[str, str] = {}
        if user_input is not None:
            client = RegistryClient(
                async_get_clientsession(self.hass),
                entry.data[CONF_ADDRESS],
                entry.data[CONF_USERNAME],
                entry.data[CONF_TOKEN],
            )
            try:
                header = await async_read_lock(client, entry.data[CONF_REPOSITORY])
                if header is None:
                    raise LockError(Reason.NOT_LOCKED)
                vault_key = await self.hass.async_add_executor_job(
                    unwrap_vault_key, header, user_input[CONF_PASSWORD]
                )
            except RegistryStorageError as err:
                errors["base"] = error_key(err.reason)
            else:
                await KeyStore(self.hass, entry.data[CONF_KEY_REF]).async_save(
                    vault_key, header
                )
                return self.async_update_reload_and_abort(
                    entry, reason="reauth_successful"
                )
        return self.async_show_form(
            step_id="restore_key",
            data_schema=probatio.Schema({probatio.Required(CONF_PASSWORD): _PASSWORD}),
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> RegistryStorageOptionsFlow:
        """Return the options flow."""
        return RegistryStorageOptionsFlow()


class RegistryStorageOptionsFlow(OptionsFlow):
    """Per-camera and backups repositories, and the password."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Choose what to change."""
        return self.async_show_menu(
            step_id="init", menu_options=["repositories", "password"]
        )

    def _store(self) -> Any:
        return (
            getattr(self.config_entry, "runtime_data", None)
            and self.config_entry.runtime_data.store
        )

    async def async_step_repositories(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Give a camera, or the backups, a repository of their own."""
        store = self._store()
        if store is None:
            return self.async_abort(reason="not_loaded")
        errors: dict[str, str] = {}
        cameras = dict(self.config_entry.options.get(CONF_CAMERA_REPOSITORIES, {}))
        backups = self.config_entry.options.get(CONF_BACKUPS_REPOSITORY) or ""
        if user_input is not None:
            backups = (user_input.get(CONF_BACKUPS_REPOSITORY) or "").strip().lower()
            camera = user_input.get(CONF_CAMERA)
            repository = (user_input.get(CONF_REPOSITORY) or "").strip().lower()
            wanted = [value for value in (backups, repository) if value]
            if any(not valid_repository(value) for value in wanted):
                errors["base"] = "invalid_repository"
            elif camera and not repository:
                cameras.pop(camera, None)
            elif camera:
                cameras[camera] = repository
            if not errors:
                try:
                    for value in wanted:
                        await store.async_ensure_lock(value)
                except RegistryStorageError as err:
                    errors["base"] = error_key(err.reason)
            if not errors:
                return self.async_create_entry(
                    data={
                        CONF_CAMERA_REPOSITORIES: cameras,
                        CONF_BACKUPS_REPOSITORY: backups or None,
                    }
                )
        return self.async_show_form(
            step_id="repositories",
            data_schema=probatio.Schema(
                {
                    probatio.Optional(CONF_CAMERA): EntitySelector(
                        EntitySelectorConfig(domain="camera")
                    ),
                    probatio.Optional(CONF_REPOSITORY): _TEXT,
                    probatio.Optional(CONF_BACKUPS_REPOSITORY, default=backups): _TEXT,
                }
            ),
            description_placeholders={
                "default": store.settings.default_repository,
                "count": str(len(cameras)),
            },
            errors=errors,
        )

    async def async_step_password(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Change the password; the old one is required."""
        store = self._store()
        if store is None:
            return self.async_abort(reason="not_loaded")
        errors: dict[str, str] = {}
        strength = ""
        if user_input is not None:
            strength = _strength_line(user_input[CONF_PASSWORD])
            if not user_input[CONF_UNDERSTAND]:
                errors[CONF_UNDERSTAND] = "understand_required"
            else:
                try:
                    await store.async_change_password(
                        user_input[CONF_OLD_PASSWORD],
                        user_input[CONF_PASSWORD],
                        user_input[CONF_PASSWORD_CONFIRMATION],
                    )
                except RegistryStorageError as err:
                    errors["base"] = error_key(err.reason)
                else:
                    return self.async_create_entry(data=dict(self.config_entry.options))
        return self.async_show_form(
            step_id="password",
            data_schema=_password_schema(old=True),
            description_placeholders={"strength": strength or "not typed yet"},
            errors=errors,
        )
