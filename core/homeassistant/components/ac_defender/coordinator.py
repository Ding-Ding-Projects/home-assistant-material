"""The coordinator that runs the decision engine for one defended climate entity."""

from collections import deque
from datetime import datetime, timedelta
import random
from typing import Any

from homeassistant.components.climate import (
    ATTR_FAN_MODE,
    ATTR_FAN_MODES,
    ATTR_HVAC_ACTION,
    ATTR_MAX_TEMP,
    ATTR_MIN_TEMP,
    ATTR_PRESET_MODE,
    ATTR_TARGET_TEMP_STEP,
    DOMAIN as CLIMATE_DOMAIN,
    SERVICE_SET_FAN_MODE,
    SERVICE_SET_HVAC_MODE,
    SERVICE_SET_TEMPERATURE,
    HVACMode,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import (
    ATTR_ENTITY_ID,
    ATTR_TEMPERATURE,
    EVENT_LOGBOOK_ENTRY,
    STATE_ON,
    STATE_UNAVAILABLE,
    STATE_UNKNOWN,
)
from homeassistant.core import (
    CALLBACK_TYPE,
    Context,
    Event,
    EventStateChangedData,
    HomeAssistant,
    callback,
)
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import (
    async_track_state_change_event,
    async_track_time_interval,
)
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .arbiter import AC, Arbiter, BandError
from .const import (
    CONF_CLIMATE,
    CONF_COURTESY_WAIT,
    CONF_DOOR_SENSOR,
    CONF_FLOOR,
    CONF_FREEZE_RULE,
    CONF_GUARDS,
    CONF_HEAT_CAP,
    CONF_HEAT_MODE,
    CONF_MY_TEMPERATURE,
    CONF_OUTDOOR,
    CONF_PLAIN_LOG,
    CONF_POWER_KW,
    CONF_PRESENCE,
    CONF_ROOM_SENSOR,
    CONF_SAFETY_TEMPERATURE,
    DEFAULT_COURTESY_WAIT,
    DEFAULT_FLOOR,
    DEFAULT_MY_TEMPERATURE,
    DEFAULT_SAFETY_TEMPERATURE,
    DOMAIN,
    EVALUATE_INTERVAL_SECONDS,
    HARD_FLOOR,
    HEAT_MODE_CAP,
    HEAT_MODE_OFF,
    LOG_SIZE,
    MAX_COURTESY_WAIT,
    PROTECTIVE_PRESETS,
    RESTART_FRESH_WAIT_MINUTES,
    SAVE_DELAY_SECONDS,
    STATE_STOPPED,
    STORAGE_VERSION,
)
from .cost import CostTracker, PriceTable
from .guards import guards_for
from .model import Command, Ctx, Decision, Standdown, Touch
from .pipeline import build_runtime, clamp_floor, decide
from .reasons import Reason, reason_from_parts, reason_parts
from .siblings import check_band, sibling_of

SIGNAL_UPDATE = f"{DOMAIN}_update_{{}}"
SIGNAL_GUARD_ACTED = f"{DOMAIN}_guard_acted_{{}}"
SIGNAL_HANDOVER = f"{DOMAIN}_handover_{{}}"

MISSING_KEYS = (CONF_ROOM_SENSOR, CONF_OUTDOOR, CONF_DOOR_SENSOR, CONF_PRESENCE)
KEEP_SAMPLES = timedelta(hours=3)
KEEP_TOUCHES = timedelta(hours=24)
MAX_TOUCHES = 100
MAX_COMMANDS = 200


def option(entry: ConfigEntry, key: str, default: Any = None) -> Any:
    """Return a stored value, options first and then the original data."""
    if key in entry.options:
        return entry.options[key]
    return entry.data.get(key, default)


def _number(state: Any, attribute: str | None = None) -> float | None:
    """Return a float from a state or one of its attributes."""
    if state is None:
        return None
    raw = state.attributes.get(attribute) if attribute else state.state
    try:
        return float(raw)
    except TypeError, ValueError:
        return None


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _parse(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return dt_util.parse_datetime(value)
    except ValueError:
        return None


class InvalidValue(ValueError):
    """A refused value; the key and placeholders word it in any language."""

    def __init__(self, key: str, message: str, **placeholders: Any) -> None:
        """Keep the English message, the translation key and its values."""
        super().__init__(message)
        self.key = key
        self.placeholders = {name: str(value) for name, value in placeholders.items()}


class DefenderCoordinator:
    """Evaluates the guards when something changes and sends the commands."""

    def __init__(
        self, hass: HomeAssistant, entry: ConfigEntry, run_mode: str = "cool"
    ) -> None:
        """Set up the coordinator."""
        self.hass = hass
        self.entry = entry
        self.run_mode = run_mode
        self.role = "ac" if run_mode == "cool" else "heat"
        self.climate_id: str = entry.data[CONF_CLIMATE]
        self.guards = guards_for(run_mode)
        self.guard_state: dict[str, dict[str, Any]] = {}
        self.touches: list[Touch] = []
        self.commands: list[Command] = []
        self.room_samples: list[tuple[datetime, float]] = []
        self.outdoor_samples: list[tuple[datetime, float]] = []
        self.reading_times: list[datetime] = []
        self.action_changes: list[tuple[datetime, str | None]] = []
        self.cooling_started: datetime | None = None
        self.pause: Standdown | None = None
        self.decision = Decision(state="defending", reason=Reason("starting_up"))
        self.last_acted: dict[str, dict[str, Any]] = {}
        self.log: deque[dict[str, Any]] = deque(maxlen=LOG_SIZE)
        self.cost = CostTracker(PriceTable(), option(entry, CONF_POWER_KW))
        self.arbiter: Arbiter | None = None
        self.gated = False
        self._last_seq = 0
        self.rng = random.Random()
        self._own_contexts: deque[str] = deque(maxlen=20)
        self._last_room: float | None = None
        self._last_action: str | None = None
        self._last_command_time: datetime | None = None
        self._last_mode: str | None = None
        self._missing: set[str] = set()
        self.off_command_at: datetime | None = None
        self.last_off_at: datetime | None = None
        self._unsubs: list[CALLBACK_TYPE] = []
        self._store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION, f"{entry.domain}.{entry.entry_id}"
        )
        self._started_at = dt_util.utcnow()
        self._waiting_fresh = False
        self.restored_holder: str | None = None
        self.reload_options()

    @property
    def signal(self) -> str:
        """Return the dispatcher signal of this entry."""
        return SIGNAL_UPDATE.format(self.entry.entry_id)

    def reload_options(self) -> None:
        """Read the stored settings again."""
        entry = self.entry
        self.my_temp: float = float(
            option(entry, CONF_MY_TEMPERATURE, DEFAULT_MY_TEMPERATURE)
        )
        self.safety_temp: float = float(
            option(entry, CONF_SAFETY_TEMPERATURE, DEFAULT_SAFETY_TEMPERATURE)
        )
        if self.run_mode == "heat":
            self.heat_mode: str = option(entry, CONF_HEAT_MODE, HEAT_MODE_OFF)
            self.my_temp = float(option(entry, CONF_HEAT_CAP, self.my_temp))
            self.floor: float | None = clamp_floor(
                option(entry, CONF_FLOOR, DEFAULT_FLOOR)
            )
            self.freeze_guard = bool(option(entry, CONF_FREEZE_RULE, True))
            try:
                wait = float(option(entry, CONF_COURTESY_WAIT, DEFAULT_COURTESY_WAIT))
            except TypeError, ValueError:
                wait = float(DEFAULT_COURTESY_WAIT)
            self.courtesy_wait = min(max(wait, 0.0), float(MAX_COURTESY_WAIT))
        else:
            self.courtesy_wait = float(DEFAULT_COURTESY_WAIT)
            self.heat_mode = HEAT_MODE_OFF
            self.floor = None
            self.freeze_guard = True
        self.cfg, self.enabled = build_runtime(
            self.guards, {CONF_GUARDS: entry.options.get(CONF_GUARDS, {})}
        )
        self.cost.power_kw = option(entry, CONF_POWER_KW)

    def tracked_entities(self) -> list[str]:
        """Return every entity whose changes matter."""
        keys = (CONF_ROOM_SENSOR, CONF_DOOR_SENSOR, CONF_PRESENCE, CONF_OUTDOOR)
        return [
            self.climate_id,
            *(v for k in keys if (v := option(self.entry, k))),
        ]

    def _data_to_save(self) -> dict[str, Any]:
        """Return what must survive a restart."""
        pause = self.pause
        cost = self.cost
        return {
            "saved_at": dt_util.utcnow().isoformat(),
            "pause": {
                "kind": pause.kind,
                "until": pause.until.isoformat() if pause.until else None,
                "reason": pause.reason,
                "reason_parts": reason_parts(pause.reason),
                "stop_everything": pause.stop_everything,
            }
            if pause
            else None,
            "last_acted": {
                guard: {
                    "time": item["time"].isoformat(),
                    "reason": item["reason"],
                    "parts": reason_parts(item["reason"]),
                }
                for guard, item in self.last_acted.items()
            },
            "touches": [
                [t.time.isoformat(), t.old, t.new, t.source, t.user_id]
                for t in self.touches
            ],
            "commands": [[c.time.isoformat(), c.setpoint] for c in self.commands],
            "off_command_at": _iso(self.off_command_at),
            "last_off_at": _iso(self.last_off_at),
            "log": list(self.log),
            "holder": self.arbiter.holder if self.arbiter else None,
            "cost": {
                "day": cost.day,
                "month": cost.month,
                "seconds_today": cost.seconds_today,
                "seconds_month": cost.seconds_month,
                "cost_today": cost.cost_today,
                "cost_month": cost.cost_month,
                "history": {day: list(item) for day, item in cost.history.items()},
            },
        }

    async def async_restore(self) -> bool:
        """Load the saved state; return True when there was one."""
        data = await self._store.async_load()
        if not data:
            return False
        if saved := data.get("pause"):
            until = dt_util.parse_datetime(saved["until"]) if saved["until"] else None
            if saved["stop_everything"] or (until and until > dt_util.utcnow()):
                self.pause = Standdown(
                    saved["kind"],
                    until,
                    reason_from_parts(saved.get("reason_parts"), saved["reason"]),
                    saved["stop_everything"],
                )
        for guard, item in data.get("last_acted", {}).items():
            if (when := dt_util.parse_datetime(item["time"])) is not None:
                reason = reason_from_parts(item.get("parts"), item["reason"])
                self.last_acted[guard] = {
                    "time": when,
                    "reason": reason,
                    "parts": reason_parts(reason),
                }
        self._restore_history(data)
        self.log.extend(data.get("log", []))
        saved_cost = data.get("cost", {})
        cost = self.cost
        cost.day, cost.month = saved_cost.get("day"), saved_cost.get("month")
        cost.seconds_today = saved_cost.get("seconds_today", 0.0)
        cost.seconds_month = saved_cost.get("seconds_month", 0.0)
        cost.cost_today = saved_cost.get("cost_today", 0.0)
        cost.cost_month = saved_cost.get("cost_month", 0.0)
        cost.history = {
            day: (float(item[0]), float(item[1]))
            for day, item in saved_cost.get("history", {}).items()
        }
        self.restored_holder = data.get("holder")
        return True

    def _restore_history(self, data: dict[str, Any]) -> None:
        """Bring back touches, commands and off times, pruned as when they were kept.

        The original keeps these across a restart, so pacing guards do not
        forget a touch or a command just because Home Assistant restarted.
        """
        for item in data.get("touches", []):
            try:
                when = dt_util.parse_datetime(item[0])
                if when is not None:
                    self.touches.append(Touch(when, item[1], item[2], item[3], item[4]))
            except IndexError, TypeError, ValueError:
                continue
        for item in data.get("commands", []):
            try:
                when = dt_util.parse_datetime(item[0])
                if when is not None:
                    self.commands.append(Command(when, item[1]))
            except IndexError, TypeError, ValueError:
                continue
        self.off_command_at = _parse(data.get("off_command_at"))
        self.last_off_at = _parse(data.get("last_off_at"))
        self._prune(dt_util.utcnow())

    async def async_save(self) -> None:
        """Write the state now."""
        await self._store.async_save(self._data_to_save())

    async def async_remove_saved(self) -> None:
        """Delete the saved state of a removed entry."""
        await self._store.async_remove()

    async def async_start(self) -> None:
        """Restore, listen and evaluate once."""
        self._started_at = dt_util.utcnow()
        self._waiting_fresh = await self.async_restore()
        if self.arbiter is not None and self.restored_holder:
            if self.arbiter.holder == "neither":
                self.arbiter.holder = self.restored_holder
        self._unsubs.append(
            async_track_state_change_event(
                self.hass, self.tracked_entities(), self._handle_state_change
            )
        )
        self._unsubs.append(
            async_track_time_interval(
                self.hass,
                self._handle_timer,
                timedelta(seconds=EVALUATE_INTERVAL_SECONDS),
            )
        )
        await self.async_evaluate()

    @callback
    def async_stop(self) -> None:
        """Stop listening."""
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()

    async def _handle_timer(self, now: datetime) -> None:
        await self.async_evaluate()

    async def _handle_state_change(self, event: Event[EventStateChangedData]) -> None:
        data = event.data
        if data["entity_id"] == self.climate_id:
            self._note_touch(event)
        await self.async_evaluate()

    def _note_touch(self, event: Event[EventStateChangedData]) -> None:
        """Record an outside change of the set point as a touch."""
        old, new = event.data["old_state"], event.data["new_state"]
        if old is None or new is None:
            return
        old_t, new_t = _number(old, ATTR_TEMPERATURE), _number(new, ATTR_TEMPERATURE)
        if old_t == new_t or event.context.id in self._own_contexts:
            return
        if event.context.user_id:
            source = "user"
        elif event.context.parent_id:
            source = "automation"
        else:
            source = "wall"
        self.touches.append(
            Touch(dt_util.utcnow(), old_t, new_t, source, event.context.user_id)
        )

    def unit_available(self) -> bool:
        """Return True while the defended climate entity reports a state."""
        return self._read_available()

    def _read_available(self) -> bool:
        state = self.hass.states.get(self.climate_id)
        return state is not None and state.state not in (
            STATE_UNAVAILABLE,
            STATE_UNKNOWN,
        )

    def build_ctx(self, now: datetime) -> Ctx:
        """Build the context the guards look at from the current states."""
        hass = self.hass
        climate = hass.states.get(self.climate_id)
        attrs = climate.attributes if climate else {}
        room_id = option(self.entry, CONF_ROOM_SENSOR)
        room_state = hass.states.get(room_id) if room_id else climate
        room = (
            _number(room_state) if room_id else _number(climate, "current_temperature")
        )
        outdoor_id = option(self.entry, CONF_OUTDOOR)
        outdoor = None
        if outdoor_id and (outdoor_state := hass.states.get(outdoor_id)):
            outdoor = _number(outdoor_state) or _number(outdoor_state, "temperature")
        door_id = option(self.entry, CONF_DOOR_SENSOR)
        door = hass.states.get(door_id) if door_id else None
        presence_id = option(self.entry, CONF_PRESENCE)
        presence = hass.states.get(presence_id) if presence_id else None

        if room is not None and room != self._last_room:
            self._last_room = room
            self.reading_times.append(now)
            self.room_samples.append((now, room))
        if outdoor is not None:
            self.outdoor_samples.append((now, outdoor))
        mode = climate.state if climate else None
        if climate is not None and mode == "off" and self._last_mode != "off":
            self._note_off(climate.last_changed)
        self._last_mode = mode
        action = attrs.get(ATTR_HVAC_ACTION)
        if action != self._last_action:
            self._last_action = action
            self.action_changes.append((now, action))
        active = "cooling" if self.run_mode == "cool" else "heating"
        if action == active and self.cooling_started is None:
            self.cooling_started = now
        elif action != active:
            self.cooling_started = None
        self._prune(now)

        reported = room_state.last_reported if room_state else None
        reading_age = (now - reported).total_seconds() if reported else 1e9
        preset = attrs.get(ATTR_PRESET_MODE)
        step = _number(climate, ATTR_TARGET_TEMP_STEP) or 0.5
        desired = "heat" if self.run_mode == "heat" else "cool"
        if self.run_mode == "heat" and self.heat_mode == HEAT_MODE_OFF:
            desired = "off"
        return Ctx(
            now=now,
            rng=self.rng,
            room=room,
            setpoint=_number(climate, ATTR_TEMPERATURE),
            hvac_mode=climate.state if climate else None,
            hvac_action=action,
            fan_mode=attrs.get(ATTR_FAN_MODE),
            fan_modes=list(attrs.get(ATTR_FAN_MODES) or []),
            min_temp=_number(climate, ATTR_MIN_TEMP) or 7.0,
            max_temp=_number(climate, ATTR_MAX_TEMP) or 35.0,
            step=step,
            my_temp=self.my_temp,
            safety_temp=self.safety_temp,
            cfg=self.cfg,
            enabled=self.enabled,
            state=self.guard_state,
            touches=list(self.touches),
            commands=list(self.commands),
            room_samples=list(self.room_samples),
            outdoor_samples=list(self.outdoor_samples),
            reading_times=list(self.reading_times),
            action_changes=list(self.action_changes),
            cooling_started=self.cooling_started,
            outdoor=outdoor,
            presence_home=(presence.state in (STATE_ON, "home"))
            if presence and presence.state not in (STATE_UNAVAILABLE, STATE_UNKNOWN)
            else None,
            door_opened_at=door.last_changed
            if door and door.state == STATE_ON
            else None,
            power_kw=self.cost.power_kw,
            available=self._read_available(),
            run_mode=self.run_mode,
            desired_mode=desired,
            active_action=active,
            floor=self.floor,
            freeze_guard=self.freeze_guard,
            courtesy_wait_seconds=self.courtesy_wait * 60.0,
            reading_age=reading_age,
            preset_mode=preset,
            protective_preset=preset in PROTECTIVE_PRESETS,
            last_command_time=self._last_command_time,
            off_command_at=self.off_command_at,
            last_off_at=self.last_off_at,
        )

    def _note_off(self, when: datetime) -> None:
        """Keep the latest moment the unit was turned off or seen off."""
        if self.last_off_at is None or when > self.last_off_at:
            self.last_off_at = when

    def _prune(self, now: datetime) -> None:
        self.room_samples = [s for s in self.room_samples if now - s[0] < KEEP_SAMPLES]
        self.outdoor_samples = [
            s for s in self.outdoor_samples if now - s[0] < KEEP_SAMPLES
        ]
        self.reading_times = [t for t in self.reading_times if now - t < KEEP_SAMPLES]
        self.action_changes = self.action_changes[-50:]
        self.touches = [t for t in self.touches if now - t.time < KEEP_TOUCHES][
            -MAX_TOUCHES:
        ]
        self.commands = [c for c in self.commands if now - c.time < KEEP_TOUCHES][
            -MAX_COMMANDS:
        ]

    async def async_evaluate(self) -> Decision:
        """Run the engine once and send what it decides."""
        now = dt_util.utcnow()
        if self.pause and self.pause.until and now >= self.pause.until:
            self.pause = None
        ctx = self.build_ctx(now)
        if self._waiting_fresh and not self._reading_is_fresh(now):
            self.decision = Decision(
                state="waiting",
                reason=Reason("waiting_fresh_reading"),
            )
            if self.pause is not None:
                held = decide(ctx, self.guards, self.pause)
                self.decision = Decision(
                    state=held.state, reason=held.reason, guard=held.guard
                )
            self._store.async_delay_save(self._data_to_save, SAVE_DELAY_SECONDS)
            async_dispatcher_send(self.hass, self.signal)
            return self.decision
        self._waiting_fresh = False
        self._report_missing_entities()
        decision = decide(ctx, self.guards, self.pause)
        self.decision = decision
        sent = True
        if decision.action:
            self.arbiter_update(ctx, decision, now)
            sent = self._may_send(now)
            self.gated = not sent
            if sent:
                await self._send(decision, now)
            else:
                decision.reason = Reason(
                    "ac_has_room" if self.role == "heat" else "heat_has_room"
                )
                decision.state = "waiting"
        else:
            self.arbiter_update(ctx, decision, now)
            self.gated = False
        if sent:
            for guard, reason in decision.acted:
                self._record_acted(guard, reason, now)
        await self._keep_dual_setpoint_consistent(ctx, now)
        self.cost.update(now, ctx.hvac_action == ctx.active_action)
        self._store.async_delay_save(self._data_to_save, SAVE_DELAY_SECONDS)
        async_dispatcher_send(self.hass, self.signal)
        return decision

    def _report_missing_entities(self) -> None:
        """Raise a repair issue for each chosen sensor that no longer exists."""
        for key in MISSING_KEYS:
            entity_id = option(self.entry, key)
            missing = bool(entity_id) and self.hass.states.get(entity_id) is None
            if missing == (key in self._missing):
                continue
            issue_id = f"missing_{key}_{self.entry.entry_id}"
            if missing:
                self._missing.add(key)
                ir.async_create_issue(
                    self.hass,
                    self.entry.domain,
                    issue_id,
                    is_fixable=False,
                    severity=ir.IssueSeverity.WARNING,
                    translation_key="missing_entity",
                    translation_placeholders={
                        "entity_id": entity_id,
                        "title": self.entry.title,
                    },
                )
            else:
                self._missing.discard(key)
                ir.async_delete_issue(self.hass, self.entry.domain, issue_id)

    def _reading_is_fresh(self, now: datetime) -> bool:
        """Return True once the device has reported since the start, or after the cap."""
        if now - self._started_at >= timedelta(minutes=RESTART_FRESH_WAIT_MINUTES):
            return True
        room_id = option(self.entry, CONF_ROOM_SENSOR)
        state = self.hass.states.get(room_id or self.climate_id)
        return state is not None and state.last_reported > self._started_at

    def _may_send(self, now: datetime) -> bool:
        if self.arbiter is None:
            return True
        return self.arbiter.may_command(self.role, now)

    def arbiter_update(self, ctx: Ctx, decision: Decision, now: datetime) -> None:
        """Tell the arbiter what this sibling is doing and pass on new handovers."""
        if self.arbiter is None:
            return
        member = self.arbiter.register(self.role)
        member.paused = self.pause is not None
        if self.role == AC:
            member.safety_active = (
                decision.guard == "hot_room_override" and decision.action is not None
            )
        else:
            member.safety_active = decision.state == "heating_allowed"
        member.running = ctx.hvac_action == ctx.active_action
        member.off_confirmed = ctx.hvac_mode == "off" or not member.running
        if ctx.room is not None:
            self.arbiter.evaluate(now, ctx.room)
        for event in self.arbiter.events:
            if event.seq <= self._last_seq:
                continue
            self._last_seq = event.seq
            data = event.to_dict()
            extra = {k: v for k, v in data.items() if k not in ("kind", "time")}
            self.add_log("handover", event.who, event.text(), event.time, **extra)
            async_dispatcher_send(
                self.hass, SIGNAL_HANDOVER.format(self.entry.entry_id), event.kind, data
            )

    async def _keep_dual_setpoint_consistent(self, ctx: Ctx, now: datetime) -> None:
        """A device with a low and a high set point is held to the shared band."""
        arbiter = self.arbiter
        if arbiter is None or arbiter.alone() or self.role != AC or self.pause:
            return
        state = self.hass.states.get(self.climate_id)
        if state is None or state.state != "heat_cool":
            return
        low = _number(state, "target_temp_low")
        high = _number(state, "target_temp_high")
        if low is None or high is None:
            return
        if abs(low - arbiter.low) < 0.05 and abs(high - arbiter.high) < 0.05:
            return
        if not self._may_send(now) and arbiter.holder not in ("neither", AC):
            return
        context = Context()
        self._own_contexts.append(context.id)
        await self.hass.services.async_call(
            CLIMATE_DOMAIN,
            SERVICE_SET_TEMPERATURE,
            {
                ATTR_ENTITY_ID: self.climate_id,
                "target_temp_low": arbiter.low,
                "target_temp_high": arbiter.high,
            },
            blocking=False,
            context=context,
        )
        reason = Reason("shared_band", low=arbiter.low, high=arbiter.high)
        message = f"band: low {arbiter.low}, high {arbiter.high} ({reason})"
        self.add_log(
            "command",
            "band",
            message,
            now,
            low=arbiter.low,
            high=arbiter.high,
            reason_parts=reason_parts(reason),
        )

    async def _send(self, decision: Decision, now: datetime) -> None:
        """Call the climate service the decision asks for and log it."""
        context = Context()
        self._own_contexts.append(context.id)
        data: dict[str, Any] = {ATTR_ENTITY_ID: self.climate_id}
        action = decision.action
        if action == "set_temperature":
            service, data[ATTR_TEMPERATURE] = SERVICE_SET_TEMPERATURE, decision.value
        elif action == "set_hvac_mode":
            service, data["hvac_mode"] = SERVICE_SET_HVAC_MODE, decision.value
        elif action == "set_fan_mode":
            service, data[ATTR_FAN_MODE] = SERVICE_SET_FAN_MODE, decision.value
        else:
            service, data["hvac_mode"] = SERVICE_SET_HVAC_MODE, HVACMode.OFF
        await self.hass.services.async_call(
            CLIMATE_DOMAIN, service, data, blocking=False, context=context
        )
        value = decision.value if decision.value is not None else "off"
        self.commands.append(
            Command(now, decision.value if action == "set_temperature" else None)
        )
        self._last_command_time = now
        if data.get("hvac_mode") == HVACMode.OFF:
            self.off_command_at = now
            self._note_off(now)
        if self.arbiter is not None:
            self.arbiter.note_command(self.role, now)
        guard = decision.guard or "defender"
        message = f"{guard}: {action} {value} ({decision.reason})"
        self.add_log(
            "command",
            guard,
            message,
            now,
            value=value,
            action=action,
            reason_parts=reason_parts(decision.reason),
        )
        self.hass.bus.async_fire(
            EVENT_LOGBOOK_ENTRY,
            {
                "name": self.entry.title,
                "message": message,
                "domain": DOMAIN,
                "entity_id": self.climate_id,
            },
        )

    def add_log(
        self, kind: str, guard: str, message: str, now: datetime, **values: Any
    ) -> None:
        """Add a structured line to the log."""
        self.log.appendleft(
            {
                "time": now.isoformat(),
                "kind": kind,
                "guard": guard,
                "message": message,
                "values": values,
            }
        )

    def _record_acted(self, guard: str, reason: str, now: datetime) -> None:
        self.last_acted[guard] = {
            "time": now,
            "reason": reason,
            "parts": reason_parts(reason),
        }
        async_dispatcher_send(
            self.hass, SIGNAL_GUARD_ACTED.format(self.entry.entry_id), guard, reason
        )

    def sibling(self) -> DefenderCoordinator | None:
        """Return the other defender of this climate entity, if any."""
        return sibling_of(self.hass, self)

    def start_pause(
        self, hours: float, reason: str = Reason("paused_by_owner")
    ) -> None:
        """Stand down for a number of hours."""
        now = dt_util.utcnow()
        self.pause = Standdown("paused", now + timedelta(hours=hours), reason)
        self.add_log("paused", "defender", reason, now, hours=hours)
        self._store.async_delay_save(self._data_to_save, 1)
        self._tell_sibling(True)

    def stop_everything(self) -> None:
        """Send nothing at all until told to defend again."""
        now = dt_util.utcnow()
        self.pause = Standdown(STATE_STOPPED, None, Reason("stopped_by_owner"), True)
        self.add_log("stopped", "defender", self.pause.reason, now)
        self._store.async_delay_save(self._data_to_save, 1)
        self._tell_sibling(True)

    def defend_again(self) -> None:
        """Clear a pause or a stop."""
        self.pause = None
        self.add_log("resumed", "defender", "defending again", dt_util.utcnow())
        self._store.async_delay_save(self._data_to_save, 1)
        self._tell_sibling(False)

    def _tell_sibling(self, paused: bool) -> None:
        if self.arbiter is not None:
            room = self._last_room if self._last_room is not None else 0.0
            self.arbiter.set_paused(self.role, paused, dt_util.utcnow(), room)
            async_dispatcher_send(self.hass, self.signal)

    def set_guard_enabled(self, key: str, enabled: bool) -> None:
        """Switch one guard on or off and store the choice."""
        guards = {
            k: dict(v) for k, v in self.entry.options.get(CONF_GUARDS, {}).items()
        }
        guards.setdefault(key, {})["enabled"] = enabled
        self.hass.config_entries.async_update_entry(
            self.entry, options={**self.entry.options, CONF_GUARDS: guards}
        )

    def set_my_temperature(self, value: float) -> None:
        """Store a new temperature to hold."""
        key = CONF_HEAT_CAP if self.run_mode == "heat" else CONF_MY_TEMPERATURE
        self.hass.config_entries.async_update_entry(
            self.entry, options={**self.entry.options, key: value}
        )

    def _check_band(
        self, my_temp: float, floor: float | None, heat_mode: str | None = None
    ) -> None:
        """Raise ValueError when the new value would cross the sibling."""
        sibling = self.sibling()
        if sibling is None:
            return
        ac, heat = (self, sibling) if self.role == AC else (sibling, self)
        ac_temp = my_temp if self.role == AC else ac.my_temp
        heat_cap = my_temp if self.role != AC else heat.my_temp
        mode = heat_mode or heat.heat_mode
        use_floor = floor if floor is not None else (heat.floor or HARD_FLOOR)
        try:
            check_band(ac_temp, mode, heat_cap, use_floor)
        except BandError as err:
            raise InvalidValue(str(err), str(err)) from err

    def validate_floor(self, value: float) -> float:
        """Return a valid floor or raise ValueError; it can never be under the hard minimum."""
        if value < HARD_FLOOR:
            raise InvalidValue(
                "floor_below_minimum",
                f"The floor cannot be lower than {HARD_FLOOR}",
                minimum=HARD_FLOOR,
            )
        if self.heat_mode == HEAT_MODE_CAP and value >= self.my_temp:
            raise InvalidValue(
                "floor_not_below_cap", "The floor must be below the temperature cap"
            )
        self._check_band(self.my_temp, value)
        return value

    def set_floor(self, value: float) -> None:
        """Store a new floor after validating it."""
        value = self.validate_floor(value)
        self.hass.config_entries.async_update_entry(
            self.entry, options={**self.entry.options, CONF_FLOOR: value}
        )

    def set_heat_mode(self, mode: str) -> None:
        """Store the heat mode."""
        self.hass.config_entries.async_update_entry(
            self.entry, options={**self.entry.options, CONF_HEAT_MODE: mode}
        )

    def validate_temperature(self, value: float) -> float:
        """Return a valid temperature to hold or raise ValueError with the reason."""
        state = self.hass.states.get(self.climate_id)
        low = _number(state, ATTR_MIN_TEMP)
        high = _number(state, ATTR_MAX_TEMP)
        if low is not None and value < low:
            raise InvalidValue(
                "below_device_minimum",
                f"{value} is below the device minimum of {low}",
                value=value,
                minimum=low,
            )
        if high is not None and value > high:
            raise InvalidValue(
                "above_device_maximum",
                f"{value} is above the device maximum of {high}",
                value=value,
                maximum=high,
            )
        if self.floor is not None and value <= self.floor:
            raise InvalidValue(
                "not_above_floor",
                f"{value} must be above the floor of {self.floor}",
                value=value,
                floor=self.floor,
            )
        self._check_band(value, self.floor)
        return value

    def _sibling_info(self) -> dict[str, Any] | None:
        """Return a compact view of the sibling; None when there is none."""
        other = self.sibling()
        if other is None:
            return None
        return {
            "role": other.role,
            "entry_id": other.entry.entry_id,
            "domain": other.entry.domain,
            "state": other.decision.state,
            "reason": other.decision.reason,
            "reason_parts": reason_parts(other.decision.reason),
            "paused": other.pause is not None,
            "my_temperature": other.my_temp,
            "floor": other.floor,
            "heat_mode": other.heat_mode,
            "safety_temperature": other.safety_temp,
        }

    def info(self) -> dict[str, Any]:
        """Return the data the page shows."""
        guards = []
        for guard in self.guards:
            spec = guard.spec
            acted = self.last_acted.get(spec.key)
            guards.append(
                {
                    "id": spec.key,
                    "family": spec.family,
                    "group": spec.group,
                    "safety": spec.safety,
                    "enabled": self.enabled.get(spec.key, False),
                    "settings": vars(self.cfg[spec.key]),
                    "last_acted": acted["time"].isoformat() if acted else None,
                    "reason": acted["reason"] if acted else None,
                    "reason_parts": acted.get("parts") if acted else None,
                }
            )
        return {
            "run_mode": self.run_mode,
            "climate_entity_id": self.climate_id,
            "paused_until": self.pause.until.isoformat()
            if self.pause and self.pause.until
            else None,
            "state": self.decision.state,
            "reason": self.decision.reason,
            "reason_parts": reason_parts(self.decision.reason),
            "next_check": self.decision.next_check.isoformat()
            if self.decision.next_check
            else None,
            "my_temperature": self.my_temp,
            "floor": self.floor,
            "safety_temperature": self.safety_temp if self.run_mode == "cool" else None,
            "heat_mode": self.heat_mode,
            "effective_floor": self.guard_state.get("_floor", {}).get("effective"),
            "holder": self.arbiter.holder if self.arbiter else "neither",
            "gated": self.gated,
            "sibling": self._sibling_info(),
            "band": {"low": self.arbiter.low, "high": self.arbiter.high}
            if self.arbiter and not self.arbiter.alone()
            else None,
            "plain_log": bool(self.entry.options.get(CONF_PLAIN_LOG, False)),
            "guards": guards,
            "log": list(self.log),
            "cost": {
                "seconds_today": self.cost.seconds_today,
                "seconds_month": self.cost.seconds_month,
                "cost_today": self.cost.estimate(),
                "cost_month": self.cost.estimate(month=True),
                "days": self.cost.days(),
            },
        }
