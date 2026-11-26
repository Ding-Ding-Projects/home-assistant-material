"""Send one summary notification of the home each morning."""

from collections.abc import Callable
from datetime import datetime, time, timedelta
import logging

from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util

from .compose import BriefingSources, _label, async_compose_message, unavailable_sources
from .const import EVENT_SENT

_LOGGER = logging.getLogger(__name__)

TITLE = "Morning briefing"


class Briefing:
    """Own the daily timer, the last message and the enabled flag."""

    def __init__(
        self,
        hass: HomeAssistant,
        name: str,
        at: time,
        targets: list[str],
        sources: BriefingSources,
    ) -> None:
        """Store the settings; nothing runs until async_start."""
        self.hass = hass
        self.name = name
        self.at = at
        self.targets = targets
        self.sources = sources
        self.enabled = True
        self.last_sent: datetime | None = None
        self.last_message: str | None = None
        self._unsub_timer: CALLBACK_TYPE | None = None
        self._listeners: list[Callable[[], None]] = []

    @property
    def next_briefing(self) -> datetime | None:
        """When the next briefing goes out; empty while disabled."""
        if not self.enabled:
            return None
        now = dt_util.now()
        candidate = now.replace(
            hour=self.at.hour, minute=self.at.minute, second=0, microsecond=0
        )
        if candidate <= now:
            candidate = dt_util.as_local(
                dt_util.start_of_local_day(now + timedelta(days=1))
            ).replace(hour=self.at.hour, minute=self.at.minute)
        return candidate

    @callback
    def async_add_listener(self, listener: Callable[[], None]) -> CALLBACK_TYPE:
        """Call listener whenever the schedule or last message changes."""
        self._listeners.append(listener)
        return lambda: self._listeners.remove(listener)

    @callback
    def _notify_listeners(self) -> None:
        for listener in list(self._listeners):
            listener()

    @callback
    def async_start(self) -> None:
        """Start the daily timer."""
        self._unsub_timer = async_track_time_change(
            self.hass,
            self._handle_time,
            hour=self.at.hour,
            minute=self.at.minute,
            second=0,
        )

    @callback
    def async_stop(self) -> None:
        """Stop the daily timer."""
        if self._unsub_timer is not None:
            self._unsub_timer()
            self._unsub_timer = None

    @callback
    def async_restore_last(self, sent: datetime, message: str | None) -> None:
        """Take the last briefing from before a restart."""
        if self.last_sent is None:
            self.last_sent = sent
            self.last_message = message

    @callback
    def async_set_enabled(self, enabled: bool) -> None:
        """Turn the daily briefing on or off."""
        self.enabled = enabled
        self._notify_listeners()

    async def _handle_time(self, now: datetime) -> None:
        if self.enabled:
            await self.async_send()
        else:
            self._notify_listeners()

    async def async_send(self) -> str:
        """Compose and send a briefing now."""
        message = await async_compose_message(self.hass, self.sources)
        missing = unavailable_sources(self.hass, self.sources)
        for target in self.targets:
            domain, _, service = target.partition(".")
            payload: dict = {"message": message, "title": TITLE}
            if domain == "notify" and service.startswith("mobile_app_"):
                actions = [
                    {"action": "URI", "title": _label(self.hass, entity), "uri": f"entityId:{entity}"}
                    for entity in missing[:3]
                ]
                if actions:
                    payload["data"] = {"actions": actions}
            try:
                await self.hass.services.async_call(
                    domain,
                    service,
                    payload,
                    blocking=True,
                )
            except HomeAssistantError:
                _LOGGER.exception("Could not send the briefing to %s", target)
        self.last_sent = dt_util.utcnow()
        self.last_message = message
        self.hass.bus.async_fire(
            EVENT_SENT,
            {"name": self.name, "message": message, "sent_at": self.last_sent},
        )
        self._notify_listeners()
        return message
