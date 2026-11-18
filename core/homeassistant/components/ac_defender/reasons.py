"""Reason codes of the decision engine, each with its plain English wording."""

from typing import Any, Self

TEMPLATES: dict[str, str] = {
    "starting_up": "starting up",
    "waiting_fresh_reading": "waiting for a fresh reading after the restart",
    "ac_has_room": "waiting, AC Defender has the room right now",
    "heat_has_room": "waiting, Heat Defender has the room right now",
    "device_unavailable": "the device is unavailable",
    "paused_by_owner": "paused by the owner",
    "stopped_by_owner": "everything is stopped by the owner",
    "protective_preset": "the device is in a frost protection or away mode, leaving it alone",
    "no_fresh_room_reading": "no fresh room temperature for 30 minutes, leaving the heating to whatever controls it",
    "below_floor": "the room is at {room:.1f} degrees, below the floor of {floor:.1f}: heating is allowed",
    "below_floor_stays": "below the floor, heating stays allowed",
    "courtesy_wait": "the heating was turned on, giving it a courtesy wait before turning it off",
    "heating_kept_off": "heating is kept off, the room is above its floor",
    "holding": "holding",
    "heat_idle_comfortable": "heating is off and the room is comfortable, nothing to do",
    "unit_off_on_purpose": "the unit is off on purpose",
    "at_my_temperature": "at my temperature, nothing to do",
    "already_cooling": "already cooling toward my temperature",
    "step_rounds_to_nothing": "the step rounds to no change",
    "holding_target_stepping": "holding {target:.1f}: stepping back to my temperature",
    "holding_target_because": "holding {target:.1f}: {because}",
    "waiting_generic": "waiting",
    "peak_price_hold": "peak price or high power use, holding extra cooling",
    "peak_fan_saver": "peak hours, using the saver fan mode",
    "fan_near_target": "the room is near my temperature, saving fan energy",
    "outdoor_room_warming": "the room is warming, restoring cool mode",
    "outdoor_warm_again": "it is warm outside again, restoring cool mode",
    "outdoor_cool_off": "it is cool outside and stays cool, turning the unit off",
    "siesta_resting": "siesta: the unit is resting until the timer ends",
    "siesta_started": "siesta started",
    "time_of_day_rule": "a time-of-day rule sets this target",
    "weather_rule_blocks": "the weather rule does not allow a correction now",
    "touch_after_command": "a touch followed the last command, so the next step waits",
    "next_routine_slot": "lining the correction up with the next routine time slot",
    "budget_used": "the correction budget for this window is used",
    "command_gap": "giving the last command room before the next one",
    "low_profile": "too much back and forth, holding a low profile",
    "next_nudge_slot": "waiting for the next nudge slot",
    "calm_moment": "waiting for a calm moment to answer",
    "small_wall_preference": "the wall setting is only slightly above my temperature, letting it rest",
    "tug_of_war_quiet": "an obvious tug of war, standing down for a while",
    "tug_of_war_truce": "the setting keeps bouncing up and down, calling a truce",
    "wall_settling": "waiting for the wall setting to settle",
    "easing_to_wall": "easing toward the wall choice for a while",
    "learned_hour": "using what was learned about this hour",
    "someone_keeps_asking": "someone keeps asking for this number, so it is theirs for now",
    "good_morning": "good morning: the door opened, agreeing on a warmer number",
    "asking_cooler": "people keep asking for cooler air, skipping the quiet waits",
    "remote_changes_answer": "repeated phone or automation changes, answering without waiting",
    "rival_schedule": "the air conditioner app's schedule pushed it warmer, answering back",
    "restoring_cool_mode": "restoring cool mode",
    "restoring_cool_mode_firmly": "restoring cool mode firmly",
    "restoring_my_temperature": "restoring my temperature",
    "restoring_my_temperature_firmly": "restoring my temperature firmly",
    "calm_pause_after_change": "taking a calm pause after a change on the thermostat",
    "minimum_gap": "keeping a minimum gap between commands",
    "softened_step": "softened to a {step:.1f} degree step",
    "restore_mode_room_warm": "the room is warm, restoring the mode now",
    "restore_mode_changed": "someone changed the mode, putting it back",
    "restore_mode_soon": "waiting a moment before restoring the mode",
    "restore_mode_wait": "waiting before restoring the mode",
    "quiet_after_manual": "quiet period after a manual change",
    "comfortable_leave_change": "the room is still comfortable, leaving the change alone",
    "room_reached_hot": "the room reached {room:.1f} degrees, cooling now",
    "upstairs_hot": "upstairs is hot, cooling first",
    "upstairs_very_hot": "upstairs is very hot, skipping the waits",
    "emergency_too_cold": "emergency protocol too_cold",
    "emergency_someone_upset": "emergency protocol someone_upset",
    "emergency_suspicion_quiet": "emergency protocol suspicion_quiet",
    "too_cold_off": "too cold, turning the air conditioner off",
    "room_warmed_restore": "the room warmed up, restoring cool mode",
    "cooling_failure_off": "cooling failure confirmed by a rising room, turning the unit off",
    "tamper_truce": "tamper truce: the thermostat disappeared right after an exchange",
    "front_door_person": "a person was detected at the front door",
    "front_door_off": "a person at the front door, turning the unit off",
    "waiting_setpoint_echo": "waiting for the device to report the last setpoint",
    "repeat_same_number": "the same number was just sent, waiting before repeating it",
    "wall_hold_still": "waiting for the wall setting to hold still",
    "next_sensor_update": "waiting for the next sensor update",
    "device_activity_change": "waiting for the air conditioner to change what it is doing",
    "next_home_update": "waiting for the next normal update from the home",
    "cooling_just_started": "the air conditioner just started cooling, letting it work",
    "room_already_cooling": "the room is already cooling, watching it",
    "reaching_target_soon": "the room is cooling fast enough to reach the target soon",
    "outdoor_to_move": "waiting for the outdoor temperature to move",
    "remote_settle": "repeated changes from a phone or automation, letting them settle",
    "walking_back": "walking back {step:.1f} degrees",
    "matching_wall_step": "matching the wall step of {step:.1f} degrees",
    "snapped_to_step": "snapped to {step:.1f} degree steps",
}


class Reason(str):  # noqa: SLOT000
    """An English reason that also carries its code and values for other languages."""

    code: str
    params: dict[str, Any]

    def __new__(cls, code: str, **params: Any) -> Self:
        """Build the reason from its registered wording."""
        shown = {
            key: value.text() if isinstance(value, Reason) else value
            for key, value in params.items()
        }
        obj = super().__new__(cls, TEMPLATES[code].format(**shown))
        obj.code = code
        obj.params = params
        return obj

    def to_dict(self) -> dict[str, Any]:
        """Return the code and values, with nested reasons expanded."""
        return {
            "code": self.code,
            "params": {
                key: value.to_dict() if isinstance(value, Reason) else value
                for key, value in self.params.items()
            },
        }

    def text(self) -> str:
        """Return the plain English text."""
        return str(self)


def reason_parts(value: str | None) -> dict[str, Any] | None:
    """Return the code and values of a reason, or None for a plain text."""
    return value.to_dict() if isinstance(value, Reason) else None
