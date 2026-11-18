"""One arbiter per room: the brother (AC Defender) and the sister (Heat Defender) share a band."""

from dataclasses import dataclass, field
from datetime import datetime, timedelta

AC = "ac"
HEAT = "heat"
NEITHER = "neither"
SAFETY = "safety"
MIN_BAND = 1.0


class BandError(ValueError):
    """The comfort band is not acceptable; the message is a translation key."""


def validate_band(low: float, high: float, floor: float | None = None) -> None:
    """Raise when the band is crossed, too narrow, or does not clear the heat floor."""
    if low >= high:
        raise BandError("band_crossed")
    if high - low < MIN_BAND:
        raise BandError("band_too_narrow")
    if floor is not None and low <= floor:
        raise BandError("band_under_floor")


@dataclass(slots=True)
class Event:
    """A structured line of the shared log (rendered and localised elsewhere)."""

    kind: str  # handover, stop, paused, resumed, safety
    who: str
    to: str
    reason: str
    values: dict[str, float | str | None]
    time: datetime
    plain: bool = False
    code: str = ""
    seq: int = 0

    def to_dict(self) -> dict:
        """Return the structured event so a client can word it in its own language."""
        return {
            "seq": self.seq,
            "kind": self.kind,
            "code": self.code,
            "who": self.who,
            "to": self.to,
            "reason": self.reason,
            "values": self.values,
            "time": self.time.isoformat(),
            "plain": self.plain,
        }

    def text(self, sibling: bool = True) -> str:
        """Return an English line with the real numbers and action."""
        room = self.values.get("room")
        r = f"{room:.1f}°" if isinstance(room, float) else "?"
        names = {AC: "AC", HEAT: "Heat"}
        who, to = names.get(self.who, self.who), names.get(self.to, self.to)
        if self.plain or not sibling or self.kind == "safety":
            return f"{who} to {to}: {self.reason} (room {r})."
        voices = {AC: "brother", HEAT: "sis"}
        return (
            f"{who} to {to}: {voices.get(self.to, 'friend')}, {self.reason} (room {r})."
        )


@dataclass(slots=True)
class Member:
    """What one sibling reports to the arbiter."""

    paused: bool = False
    safety_active: bool = False
    running: bool = False  # heating on (heat) or cooling on (ac)
    off_confirmed: bool = False


@dataclass(slots=True)
class Arbiter:
    """Decides who acts in a room; safety outranks comfort in both directions."""

    low: float
    high: float
    min_interval: timedelta = timedelta(minutes=10)
    guard_time: timedelta = timedelta(minutes=2)
    members: dict[str, Member] = field(default_factory=dict)
    holder: str = NEITHER
    last_handover: datetime | None = None
    last_command: dict[str, datetime] = field(default_factory=dict)
    events: list[Event] = field(default_factory=list)
    plain: bool = False
    seq: int = 0

    def set_band(self, low: float, high: float, floor: float | None = None) -> None:
        """Move the shared band (validated)."""
        validate_band(low, high, floor)
        self.low, self.high = low, high

    def register(self, role: str) -> Member:
        """Register a sibling."""
        return self.members.setdefault(role, Member())

    def unregister(self, role: str) -> None:
        """Remove a sibling; the other one then behaves as if alone."""
        self.members.pop(role, None)
        self.holder = NEITHER

    def alone(self) -> bool:
        """Return True when only one sibling exists."""
        return len(self.members) < 2

    def _emit(
        self,
        now: datetime,
        kind: str,
        who: str,
        to: str,
        reason: str,
        room: float,
        code: str = "",
    ) -> None:
        self.seq += 1
        del self.events[:-200]
        self.events.append(
            Event(
                kind,
                who,
                to,
                reason,
                {"room": room, "low": self.low, "high": self.high},
                now,
                plain=self.plain or kind == "safety",
                code=code,
                seq=self.seq,
            )
        )

    def _target(self, room: float) -> str:
        ac, heat = self.members.get(AC), self.members.get(HEAT)
        if heat and heat.safety_active:
            return SAFETY + ":" + HEAT
        if ac and ac.safety_active:
            return SAFETY + ":" + AC
        if room > self.high:
            if heat and heat.running and not heat.off_confirmed and not heat.paused:
                return HEAT
            return AC if ac and not ac.paused else NEITHER
        if room < self.low:
            return HEAT if heat and not heat.paused else NEITHER
        return NEITHER

    def evaluate(self, now: datetime, room: float) -> str:
        """Return who holds the room now and record handovers."""
        if self.alone():
            return NEITHER
        wanted = self._target(room)
        if wanted == self.holder:
            return self.holder
        is_safety = wanted.startswith(SAFETY) or self.holder.startswith(SAFETY)
        recent = (
            self.last_handover is not None
            and now - self.last_handover < self.min_interval
        )
        finished = (
            self.holder == HEAT and wanted == AC and self.members[HEAT].off_confirmed
        )
        if (
            recent
            and not is_safety
            and not finished
            and NEITHER not in (self.holder, wanted)
        ):
            return self.holder
        previous = self.holder
        self.holder = wanted
        self.last_handover = now
        base = wanted.split(":")[-1]
        if wanted.startswith(SAFETY):
            reason = (
                "floor reached, heating is allowed"
                if base == HEAT
                else "room too hot, cooling now"
            )
            self._emit(
                now,
                "safety",
                base,
                AC if base == HEAT else HEAT,
                reason,
                room,
                "floor_reached" if base == HEAT else "too_hot",
            )
        elif wanted == AC:
            self._emit(
                now,
                "handover",
                HEAT,
                AC,
                f"heating is off and it is still above {self.high:.1f}°. Yours",
                room,
                "heat_off_still_hot",
            )
        elif wanted == HEAT and room < self.low:
            brother = self.members.get(AC)
            if previous == AC or (previous == NEITHER and brother and brother.running):
                self._emit(
                    now,
                    "stop",
                    AC,
                    HEAT,
                    f"room is falling toward {self.low:.1f}°. I am stopping. Your floor",
                    room,
                    "ac_stops_falling",
                )
        elif wanted == HEAT:
            self._emit(
                now,
                "handover",
                AC,
                HEAT,
                "room is hot and heating is on, turning it off first",
                room,
                "heat_off_first",
            )
        elif previous != NEITHER:
            self._emit(
                now,
                "handover",
                previous.split(":")[-1],
                NEITHER,
                "the room is inside the band",
                room,
                "inside_band",
            )
        return self.holder

    def may_command(self, role: str, now: datetime) -> bool:
        """Return True when a sibling may send a command now."""
        if self.alone():
            return True
        other = HEAT if role == AC else AC
        mine = self.members.get(role)
        if mine and mine.paused and self.holder != SAFETY + ":" + role:
            return False
        if self.holder == SAFETY + ":" + role:
            return True
        if self.holder.startswith(SAFETY):
            return False
        last_other = self.last_command.get(other)
        if last_other and now - last_other < self.guard_time:
            return False
        if role == AC:
            return self.holder == AC
        return self.holder in (HEAT, NEITHER)

    def note_command(self, role: str, now: datetime) -> None:
        """Record that a sibling sent a command."""
        self.last_command[role] = now

    def set_paused(self, role: str, paused: bool, now: datetime, room: float) -> None:
        """Tell the sibling that one of them was paused or resumed."""
        member = self.register(role)
        member.paused = paused
        other = HEAT if role == AC else AC
        if other in self.members:
            self._emit(
                now,
                "paused" if paused else "resumed",
                role,
                other,
                "paused by the owner, staying within the band"
                if paused
                else "back on duty",
                room,
                "paused" if paused else "resumed",
            )
