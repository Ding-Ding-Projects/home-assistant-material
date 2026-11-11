"""Keep every entry of the Activity page for ever in a local Git repository.

Entries are produced by the logbook's own live stream, so the record holds
exactly what the Activity page shows. They are appended to one file per UTC day
in a Git repository inside the configuration folder. Nothing is ever deleted or
rewritten, and nothing leaves the instance unless a person sets a Git remote
and asks for a push.
"""

import probatio

from homeassistant.components import websocket_api
from homeassistant.const import (
    EVENT_HOMEASSISTANT_FINAL_WRITE,
    EVENT_HOMEASSISTANT_STARTED,
)
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.typing import ConfigType

from .const import (
    CONF_COMMIT_INTERVAL,
    DEFAULT_COMMIT_INTERVAL,
    DOMAIN,
    MAX_COMMIT_INTERVAL,
    MIN_COMMIT_INTERVAL,
)
from .manager import ActivityRecorder
from .websocket import (
    ws_days,
    ws_push,
    ws_read,
    ws_search,
    ws_set_remote,
    ws_status,
)

CONFIG_SCHEMA = probatio.Schema(
    {
        DOMAIN: probatio.Schema(
            {
                probatio.Optional(
                    CONF_COMMIT_INTERVAL, default=DEFAULT_COMMIT_INTERVAL
                ): probatio.All(
                    int, probatio.Range(min=MIN_COMMIT_INTERVAL, max=MAX_COMMIT_INTERVAL)
                )
            }
        )
    },
    extra=probatio.ALLOW_EXTRA,
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the permanent activity record."""
    interval = config.get(DOMAIN, {}).get(CONF_COMMIT_INTERVAL, DEFAULT_COMMIT_INTERVAL)
    recorder = ActivityRecorder(hass, interval)
    hass.data[DOMAIN] = recorder
    for command in (ws_status, ws_days, ws_read, ws_search, ws_set_remote, ws_push):
        websocket_api.async_register_command(hass, command)

    async def _async_stop(_: Event) -> None:
        await recorder.async_stop()

    @callback
    def _started(_: Event) -> None:
        recorder.async_refresh()

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_FINAL_WRITE, _async_stop)
    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _started)
    await recorder.async_start()
    return True
