"""Reusable building blocks for guards that make the defender wait."""

from datetime import datetime, timedelta

from ..model import Ctx, Hold
from ..spec import Guard


class EpochHold(Guard):
    """Hold until an anchor time plus a duration, computed once per anchor."""

    reason_text = "waiting"

    def trigger(self, ctx: Ctx) -> bool:
        """Return True when the guard applies."""
        return True

    def anchor(self, ctx: Ctx) -> datetime | None:
        """Return the moment the wait counts from."""
        return None

    def duration(self, ctx: Ctx) -> float:
        """Return the wait in seconds."""
        return 0.0

    def clear(self, ctx: Ctx) -> bool:
        """Return True when the room is too warm to wait."""
        band = getattr(self.cfg(ctx), "band", None)
        return band is not None and ctx.over_band(band)

    def reason(self, ctx: Ctx) -> str:
        """Return the plain-language reason."""
        return self.reason_text

    def hold(self, ctx: Ctx) -> Hold | None:
        """Return the hold, if any."""
        state = self.st(ctx)
        if self.clear(ctx) or not self.trigger(ctx):
            state.clear()
            return None
        anchor = self.anchor(ctx)
        if anchor is None:
            return None
        key = anchor.isoformat()
        if state.get("anchor") != key:
            state["anchor"] = key
            state["until"] = anchor + timedelta(seconds=self.duration(ctx))
        until: datetime = state["until"]
        if ctx.now < until:
            return self.hold_for(ctx, until, self.reason(ctx))
        return None

    def latest_touch(self, ctx: Ctx, minutes: float = 30) -> datetime | None:
        """Return the time of the newest human touch inside the window."""
        touches = ctx.touches_in(minutes)
        return touches[-1].time if touches else None

    def last_command(self, ctx: Ctx) -> datetime | None:
        """Return the time of the defender's newest command."""
        return ctx.commands[-1].time if ctx.commands else None
