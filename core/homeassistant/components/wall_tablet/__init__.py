"""Remote control for wall tablets.

A browser in wall tablet mode announces itself with a name it chose, keeps
the connection it already holds, and listens for commands. Services let
automations send those commands, and an administrator can list the tablets
that announced themselves. Commands only ask the browser to do what a page
can do: show or leave the screensaver, reload, or open a page.

The list of tablets is kept in memory only; a tablet announces itself again
every time it connects.
"""

from dataclasses import dataclass
import re
import time
from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.service import async_register_admin_service
from homeassistant.helpers.typing import ConfigType
from homeassistant.util.hass_dict import HassKey

DOMAIN = "wall_tablet"
EVENT_COMMAND = "wall_tablet_command"

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)

COMMANDS = ("wake", "sleep", "reload", "navigate")
SCREEN_STATES = ("on", "screensaver", "off")

MAX_TABLETS = 50
MAX_NAME_LENGTH = 60
MAX_PATH_LENGTH = 255
# A tablet announces itself about every half minute.
ONLINE_WITHIN_SECONDS = 90

_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

DATA_TABLETS: HassKey["TabletRegistry"] = HassKey(DOMAIN)


@dataclass
class Tablet:
    """A tablet that announced itself."""

    tablet_id: str
    name: str
    screen: str
    last_seen: float


class TabletRegistry:
    """The tablets that announced themselves, kept in memory."""

    def __init__(self) -> None:
        """Create an empty registry."""
        self._tablets: dict[str, Tablet] = {}

    def announce(
        self, tablet_id: str, name: str, screen: str, now: float | None = None
    ) -> bool:
        """Record a tablet. Returns False when the list is full."""
        stamp = time.time() if now is None else now
        if tablet_id not in self._tablets and len(self._tablets) >= MAX_TABLETS:
            # Make room by dropping the tablet seen longest ago, but only when
            # it has been silent for a long time.
            oldest = min(self._tablets.values(), key=lambda item: item.last_seen)
            if stamp - oldest.last_seen < 24 * 3600:
                return False
            del self._tablets[oldest.tablet_id]
        self._tablets[tablet_id] = Tablet(tablet_id, name, screen, stamp)
        return True

    def forget(self, tablet_id: str) -> bool:
        """Remove a tablet from the list."""
        return self._tablets.pop(tablet_id, None) is not None

    def as_list(self, now: float | None = None) -> list[dict[str, Any]]:
        """The tablets, most recently seen first."""
        stamp = time.time() if now is None else now
        return [
            {
                "tablet_id": tablet.tablet_id,
                "name": tablet.name,
                "screen": tablet.screen,
                "last_seen": tablet.last_seen,
                "online": stamp - tablet.last_seen <= ONLINE_WITHIN_SECONDS,
            }
            for tablet in sorted(
                self._tablets.values(), key=lambda item: item.last_seen, reverse=True
            )
        ]


def clean_path(path: str) -> str:
    """Check a path to open: inside the interface, never an outside address."""
    path = path.strip()
    if (
        not path.startswith("/")
        or path.startswith("//")
        or "\\" in path
        or len(path) > MAX_PATH_LENGTH
        or any(ord(char) < 32 for char in path)
    ):
        raise probatio.Invalid("The path must start with a single slash")
    return path


def _tablet_id(value: Any) -> str:
    value = cv.string(value)
    if not _ID_PATTERN.match(value):
        raise probatio.Invalid("Use letters, numbers, dashes and underscores")
    return value


@callback
def _fire(
    hass: HomeAssistant, command: str, tablet_id: str | None, path: str | None
) -> None:
    data: dict[str, Any] = {"command": command, "tablet_id": tablet_id}
    if path is not None:
        data["path"] = path
    hass.bus.async_fire(EVENT_COMMAND, data)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the wall tablet commands."""
    hass.data[DATA_TABLETS] = TabletRegistry()

    async def _handle_service(call: ServiceCall) -> None:
        _fire(
            hass,
            call.service,
            call.data.get("tablet_id"),
            call.data.get("path"),
        )

    target = {probatio.Optional("tablet_id"): _tablet_id}
    for command in ("wake", "sleep", "reload"):
        async_register_admin_service(
            hass, DOMAIN, command, _handle_service, schema=probatio.Schema(target)
        )
    async_register_admin_service(
        hass,
        DOMAIN,
        "navigate",
        _handle_service,
        schema=probatio.Schema({**target, probatio.Required("path"): clean_path}),
    )

    websocket_api.async_register_command(hass, websocket_announce)
    websocket_api.async_register_command(hass, websocket_subscribe)
    websocket_api.async_register_command(hass, websocket_list)
    websocket_api.async_register_command(hass, websocket_command)
    websocket_api.async_register_command(hass, websocket_forget)
    return True


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "wall_tablet/announce",
        probatio.Required("tablet_id"): _tablet_id,
        probatio.Required("name"): probatio.All(
            str, probatio.Length(min=1, max=MAX_NAME_LENGTH)
        ),
        probatio.Required("screen"): probatio.In(SCREEN_STATES),
    }
)
@callback
def websocket_announce(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """A tablet says it is here and what its screen is doing."""
    if not hass.data[DATA_TABLETS].announce(
        msg["tablet_id"], msg["name"].strip() or msg["tablet_id"], msg["screen"]
    ):
        connection.send_error(msg["id"], "too_many_tablets", "Too many tablets")
        return
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "wall_tablet/subscribe",
        probatio.Required("tablet_id"): _tablet_id,
    }
)
@callback
def websocket_subscribe(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Send the commands meant for this tablet over this connection."""
    tablet_id = msg["tablet_id"]

    @callback
    def forward(event: Any) -> None:
        target = event.data.get("tablet_id")
        if target is None or target == tablet_id:
            connection.send_message(
                websocket_api.event_message(
                    msg["id"],
                    {
                        key: value
                        for key, value in event.data.items()
                        if key in ("command", "path")
                    },
                )
            )

    connection.subscriptions[msg["id"]] = hass.bus.async_listen(EVENT_COMMAND, forward)
    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "wall_tablet/list"})
@callback
def websocket_list(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """List the tablets that announced themselves."""
    connection.send_result(msg["id"], hass.data[DATA_TABLETS].as_list())


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "wall_tablet/command",
        probatio.Required("command"): probatio.In(COMMANDS),
        probatio.Optional("tablet_id"): _tablet_id,
        probatio.Optional("path"): clean_path,
    }
)
@callback
def websocket_command(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Send a command to one tablet, or to all of them."""
    if msg["command"] == "navigate" and "path" not in msg:
        connection.send_error(msg["id"], "invalid_format", "A path is needed")
        return
    _fire(hass, msg["command"], msg.get("tablet_id"), msg.get("path"))
    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "wall_tablet/forget",
        probatio.Required("tablet_id"): _tablet_id,
    }
)
@callback
def websocket_forget(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Remove a tablet from the list."""
    hass.data[DATA_TABLETS].forget(msg["tablet_id"])
    connection.send_result(msg["id"])
