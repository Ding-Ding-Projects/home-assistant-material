"""Guided setup: where recordings go, a real connection test, cameras, then how long to keep them."""

from pathlib import Path
import shutil
from typing import Any, override

import probatio

from homeassistant.components.camera import DOMAIN as CAMERA_DOMAIN
from homeassistant.components.file_upload import process_uploaded_file
from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.const import CONF_HOST, CONF_PASSWORD, CONF_PORT, CONF_USERNAME
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.selector import (
    EntitySelector,
    EntitySelectorConfig,
    FileSelector,
    FileSelectorConfig,
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)
from homeassistant.helpers.storage import STORAGE_DIR
from homeassistant.util.ulid import ulid

from .const import (
    CONF_BUFFER_HOURS,
    CONF_CAMERAS,
    CONF_DEFAULT_MODE,
    CONF_DESTINATION,
    CONF_DOMAIN,
    CONF_KEEP_DAYS,
    CONF_MAX_GB,
    CONF_PATH,
    CONF_PRIVATE_KEY_FILE,
    CONF_SEGMENT_MINUTES,
    CONF_SHARE,
    DEFAULT_BUFFER_HOURS,
    DEFAULT_KEEP_DAYS,
    DEFAULT_MAX_GB,
    DEFAULT_MODE,
    DEFAULT_SEGMENT_MINUTES,
    DEST_LOCAL,
    DEST_SCP,
    DEST_SFTP,
    DEST_SMB,
    DEST_USB,
    DESTINATIONS,
    DOMAIN,
    MAX_KEEP_DAYS,
    MODE_ALL_DAY,
    MODE_LIGHT,
    MODE_OFF,
    SMB_PORT,
    SSH_PORT,
)
from .destination import TestResult, candidate_disks, create_destination

# A rough figure for estimates only: a 1080p camera at about 2 Mbit/s.
BYTES_PER_CAMERA_DAY = 21_600_000_000

STEP_LABELS = {
    "reach": "Reach the server",
    "sign_in": "Sign in",
    "open_folder": "Open the folder",
    "write_test": "Write, read back and delete a test file",
    "free_space": "Free space",
}

PASSWORD = TextSelector(TextSelectorConfig(type=TextSelectorType.PASSWORD))
PORT = NumberSelector(
    NumberSelectorConfig(min=1, max=65535, mode=NumberSelectorMode.BOX)
)

SMB_SCHEMA = probatio.Schema(
    {
        probatio.Required(CONF_HOST): str,
        probatio.Required(CONF_SHARE): str,
        probatio.Optional(CONF_PATH, default=""): str,
        probatio.Optional(CONF_USERNAME, default=""): str,
        probatio.Optional(probatio.Secret(CONF_PASSWORD)): PASSWORD,
        probatio.Optional(CONF_DOMAIN, default=""): str,
        probatio.Required(CONF_PORT, default=SMB_PORT): PORT,
    }
)
SSH_SCHEMA = probatio.Schema(
    {
        probatio.Required(CONF_HOST): str,
        probatio.Required(CONF_PORT, default=SSH_PORT): PORT,
        probatio.Required(CONF_USERNAME): str,
        probatio.Optional(probatio.Secret(CONF_PASSWORD)): PASSWORD,
        probatio.Optional(CONF_PRIVATE_KEY_FILE): FileSelector(
            FileSelectorConfig(accept="*")
        ),
        probatio.Required(CONF_PATH): str,
    }
)


def results_text(result: TestResult) -> str:
    """The test steps as a short list for the form description."""
    lines = []
    for step in result.steps:
        mark = "✅" if step.ok else "❌"
        detail = f": {step.detail}" if step.detail else ""
        lines.append(f"{mark} {STEP_LABELS.get(step.key, step.key)}{detail}")
    return "\n".join(f"- {line}" for line in lines)


def failed_text(result: TestResult) -> str:
    """The step that failed, with its reason, for the error message."""
    step = result.failed
    if step is None:
        return ""
    label = STEP_LABELS.get(step.key, step.key)
    return f"{label}: {step.detail}" if step.detail else label


def keep_schema(hass: HomeAssistant, defaults: dict[str, Any]) -> probatio.Schema:
    """How long recordings are kept and how they are cut."""
    return probatio.Schema(
        {
            probatio.Required(
                CONF_KEEP_DAYS, default=defaults.get(CONF_KEEP_DAYS, DEFAULT_KEEP_DAYS)
            ): NumberSelector(
                NumberSelectorConfig(
                    min=1,
                    max=MAX_KEEP_DAYS,
                    unit_of_measurement="days",
                    mode=NumberSelectorMode.BOX,
                )
            ),
            probatio.Required(
                CONF_MAX_GB, default=defaults.get(CONF_MAX_GB, DEFAULT_MAX_GB)
            ): NumberSelector(
                NumberSelectorConfig(
                    min=0,
                    max=1_000_000,
                    unit_of_measurement="GB",
                    mode=NumberSelectorMode.BOX,
                )
            ),
            probatio.Required(
                CONF_BUFFER_HOURS,
                default=defaults.get(CONF_BUFFER_HOURS, DEFAULT_BUFFER_HOURS),
            ): NumberSelector(
                NumberSelectorConfig(
                    min=0,
                    max=168,
                    unit_of_measurement="hours",
                    mode=NumberSelectorMode.BOX,
                )
            ),
            probatio.Required(
                CONF_SEGMENT_MINUTES,
                default=defaults.get(CONF_SEGMENT_MINUTES, DEFAULT_SEGMENT_MINUTES),
            ): NumberSelector(
                NumberSelectorConfig(
                    min=1,
                    max=60,
                    unit_of_measurement="minutes",
                    mode=NumberSelectorMode.BOX,
                )
            ),
            probatio.Required(
                CONF_DEFAULT_MODE, default=defaults.get(CONF_DEFAULT_MODE, DEFAULT_MODE)
            ): SelectSelector(
                SelectSelectorConfig(
                    options=[MODE_ALL_DAY, MODE_LIGHT, MODE_OFF],
                    translation_key="recording_amount",
                )
            ),
        }
    )


def cameras_schema(default: list[str]) -> probatio.Schema:
    """Which cameras to record."""
    return probatio.Schema(
        {
            probatio.Required(CONF_CAMERAS, default=default): EntitySelector(
                EntitySelectorConfig(domain=CAMERA_DOMAIN, multiple=True)
            )
        }
    )


def _identity(data: dict[str, Any]) -> dict[str, Any]:
    """The settings that make two destinations the same place."""
    return {key: data[key] for key in (CONF_HOST, CONF_SHARE, CONF_PATH) if key in data}


def _clean_keep(user_input: dict[str, Any]) -> dict[str, Any]:
    return {
        CONF_KEEP_DAYS: int(user_input[CONF_KEEP_DAYS]),
        CONF_MAX_GB: float(user_input[CONF_MAX_GB]),
        CONF_BUFFER_HOURS: float(user_input[CONF_BUFFER_HOURS]),
        CONF_SEGMENT_MINUTES: int(user_input[CONF_SEGMENT_MINUTES]),
        CONF_DEFAULT_MODE: str(user_input.get(CONF_DEFAULT_MODE, DEFAULT_MODE)),
    }


class CameraRecordingConfigFlow(ConfigFlow, domain=DOMAIN):
    """Set up a place to record cameras to."""

    VERSION = 1

    def __init__(self) -> None:
        """Start an empty setup."""
        self._data: dict[str, Any] = {}
        self._result: TestResult | None = None
        self._cameras: list[str] = []

    @staticmethod
    @callback
    @override
    def async_get_options_flow(config_entry: ConfigEntry) -> CameraRecordingOptionsFlow:
        """Change the cameras and the limits later."""
        return CameraRecordingOptionsFlow()

    @override
    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Step 1: where should recordings go?"""
        return self.async_show_menu(step_id="user", menu_options=list(DESTINATIONS))

    async def async_step_local(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """A disk or folder on this computer."""
        schema = probatio.Schema(
            {
                probatio.Required(
                    CONF_PATH, default=self.hass.config.path("recordings")
                ): str
            }
        )
        if user_input is None:
            return self.async_show_form(step_id=DEST_LOCAL, data_schema=schema)
        return await self._async_try(
            DEST_LOCAL, schema, {CONF_DESTINATION: DEST_LOCAL, **user_input}, user_input
        )

    async def async_step_external_disk(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """An external or USB disk, chosen from the disks Home Assistant can see."""
        disks = await self.hass.async_add_executor_job(candidate_disks)
        if disks:
            options = [
                SelectOptionDict(value=path, label=label)
                for path, label in disks.items()
            ]
            schema = probatio.Schema(
                {
                    probatio.Required(CONF_PATH): SelectSelector(
                        SelectSelectorConfig(options=options, custom_value=True)
                    )
                }
            )
        else:
            schema = probatio.Schema({probatio.Required(CONF_PATH): str})
        placeholders = {"disks": str(len(disks))}
        if user_input is None:
            return self.async_show_form(
                step_id=DEST_USB,
                data_schema=schema,
                description_placeholders=placeholders,
            )
        path = str(Path(user_input[CONF_PATH]) / "home-assistant-recordings")
        return await self._async_try(
            DEST_USB,
            schema,
            {CONF_DESTINATION: DEST_USB, CONF_PATH: path},
            user_input,
            placeholders,
        )

    async def async_step_smb(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """A Windows shared folder."""
        if user_input is None:
            return self.async_show_form(step_id=DEST_SMB, data_schema=SMB_SCHEMA)
        data = {
            CONF_DESTINATION: DEST_SMB,
            **user_input,
            CONF_PORT: int(user_input[CONF_PORT]),
        }
        return await self._async_try(DEST_SMB, SMB_SCHEMA, data, user_input)

    async def async_step_sftp(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """An SSH server, copied to with SFTP."""
        return await self._async_ssh(DEST_SFTP, user_input)

    async def async_step_scp(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """An SSH server, copied to with SCP."""
        return await self._async_ssh(DEST_SCP, user_input)

    async def _async_ssh(
        self, kind: str, user_input: dict[str, Any] | None
    ) -> ConfigFlowResult:
        if user_input is None:
            return self.async_show_form(step_id=kind, data_schema=SSH_SCHEMA)
        errors: dict[str, str] = {}
        if not str(user_input[CONF_PATH]).startswith("/"):
            errors[CONF_PATH] = "path_not_absolute"
        elif not (
            user_input.get(CONF_PASSWORD) or user_input.get(CONF_PRIVATE_KEY_FILE)
        ):
            errors["base"] = "password_or_key"
        if errors:
            return self.async_show_form(
                step_id=kind,
                data_schema=self.add_suggested_values_to_schema(SSH_SCHEMA, user_input),
                errors=errors,
            )
        data = {
            CONF_DESTINATION: kind,
            **user_input,
            CONF_PORT: int(user_input[CONF_PORT]),
        }
        if key := user_input.get(CONF_PRIVATE_KEY_FILE):
            try:
                data[CONF_PRIVATE_KEY_FILE] = await self.hass.async_add_executor_job(
                    save_private_key, self.hass, key
                )
            except ValueError:
                return self.async_show_form(
                    step_id=kind,
                    data_schema=self.add_suggested_values_to_schema(
                        SSH_SCHEMA, user_input
                    ),
                    errors={CONF_PRIVATE_KEY_FILE: "invalid_key"},
                )
        return await self._async_try(kind, SSH_SCHEMA, data, user_input)

    async def _async_try(
        self,
        step_id: str,
        schema: probatio.Schema,
        data: dict[str, Any],
        user_input: dict[str, Any],
        placeholders: dict[str, str] | None = None,
    ) -> ConfigFlowResult:
        """Run the connection test; go on only when every step passes."""
        destination = create_destination(self.hass, data)
        self._async_abort_entries_match(
            {CONF_DESTINATION: data[CONF_DESTINATION], **_identity(data)}
        )
        if data[CONF_DESTINATION] in (DEST_LOCAL, DEST_USB) and not str(
            data[CONF_PATH]
        ).startswith("/"):
            return self.async_show_form(
                step_id=step_id,
                data_schema=self.add_suggested_values_to_schema(schema, user_input),
                errors={CONF_PATH: "path_not_absolute"},
                description_placeholders=placeholders,
            )
        result = await destination.async_test()
        if not result.ok:
            safe_input = {
                k: v
                for k, v in user_input.items()
                if k not in (CONF_PASSWORD, CONF_PRIVATE_KEY_FILE)
            }
            if key := data.get(CONF_PRIVATE_KEY_FILE):
                await self.hass.async_add_executor_job(Path(key).unlink, True)
            return self.async_show_form(
                step_id=step_id,
                data_schema=self.add_suggested_values_to_schema(schema, safe_input),
                errors={"base": "test_failed"},
                description_placeholders={
                    **(placeholders or {}),
                    "results": results_text(result),
                    "failed": failed_text(result),
                },
            )
        # Set only after a passing test, so an abandoned attempt does not block a retry.
        await self.async_set_unique_id(f"{data[CONF_DESTINATION]}:{destination.label}")
        self._abort_if_unique_id_configured()
        self._data = data
        self._result = result
        return await self.async_step_test()

    async def async_step_test(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Step 3: show what the test checked."""
        if user_input is None and self._result is not None:
            return self.async_show_form(
                step_id="test",
                data_schema=probatio.Schema({}),
                description_placeholders={
                    "label": create_destination(self.hass, self._data).label,
                    "results": results_text(self._result),
                },
            )
        return await self.async_step_cameras()

    async def async_step_cameras(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Step 4: which cameras to record."""
        errors: dict[str, str] = {}
        if user_input is not None:
            if user_input[CONF_CAMERAS]:
                self._cameras = list(user_input[CONF_CAMERAS])
                return await self.async_step_keep()
            errors[CONF_CAMERAS] = "no_cameras"
        default = sorted(self.hass.states.async_entity_ids(CAMERA_DOMAIN))
        return self.async_show_form(
            step_id="cameras", data_schema=cameras_schema(default), errors=errors
        )

    async def async_step_keep(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Step 5: how long to keep recordings, then start."""
        if user_input is not None:
            return self.async_create_entry(
                title=create_destination(self.hass, self._data).label,
                data=self._data,
                options={CONF_CAMERAS: self._cameras, **_clean_keep(user_input)},
            )
        free = self._result.free_bytes if self._result else None
        days = (
            "?"
            if not free
            else str(int(free / (BYTES_PER_CAMERA_DAY * max(1, len(self._cameras)))))
        )
        return self.async_show_form(
            step_id="keep",
            data_schema=keep_schema(self.hass, {}),
            description_placeholders={"cameras": str(len(self._cameras)), "days": days},
        )


class CameraRecordingOptionsFlow(OptionsFlow):
    """Change the cameras and the limits."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Cameras and limits on one form."""
        errors: dict[str, str] = {}
        if user_input is not None:
            if user_input[CONF_CAMERAS]:
                return self.async_create_entry(
                    data={
                        CONF_CAMERAS: list(user_input[CONF_CAMERAS]),
                        **_clean_keep(user_input),
                    }
                )
            errors[CONF_CAMERAS] = "no_cameras"
        options = dict(self.config_entry.options)
        schema = probatio.Schema(
            {
                **cameras_schema(list(options.get(CONF_CAMERAS, []))).schema,
                **keep_schema(self.hass, options).schema,
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema, errors=errors)


def save_private_key(hass: HomeAssistant, uploaded_file_id: str) -> str:
    """Check an uploaded private key and keep it in the storage folder. Runs in the executor."""
    from asyncssh import KeyImportError, import_private_key  # noqa: PLC0415

    with process_uploaded_file(hass, uploaded_file_id) as file_path:
        try:
            import_private_key(Path(file_path).read_bytes())
        except (KeyImportError, ValueError) as err:
            raise ValueError("invalid key") from err
        dest = Path(hass.config.path(STORAGE_DIR, DOMAIN)) / f".{ulid()}_id"
        dest.parent.mkdir(exist_ok=True)
        return str(shutil.move(file_path, dest))
