"""One-line English descriptions of every guard, shown by the entities."""

GUARD_DESCRIPTIONS: dict[str, str] = {
    "hot_room_override": (
        "At the too-hot temperature every wait is skipped and cooling starts at once."
    ),
    "upstairs_comfort_guard": (
        "Cools first when the upstairs rooms are hot and someone is home."
    ),
    "emergency_protocols": (
        "One-tap stand-down modes for when the room needs to be left alone."
    ),
    "cooling_failure_watch": (
        "Warns when cooling is wanted but not happening, and turns the unit off only when the room keeps rising."
    ),
    "tamper_truce": (
        "Calls a truce when the thermostat vanishes right after an exchange, as if it was detached."
    ),
    "front_door_guard_post": (
        "Pauses, and can turn the unit off, while a person is detected at the front door."
    ),
    "peak_power_saver": (
        "Holds extra corrections during peak price or high power use."
    ),
    "fan_energy_saver": (
        "Moves the fan to a saver mode when the room is near the target."
    ),
    "cool_outdoor_shutdown": (
        "Turns the unit off when it is genuinely cool outside, and back on later."
    ),
    "siesta_watch": (
        "A timed nap: the unit is parked or turned off until the timer ends."
    ),
    "savings_pantry": (
        "Keeps a small balance of saved cooling time for very hot days."
    ),
    "schedule_weather_rules": (
        "Time-of-day target rules that apply only when the weather allows them."
    ),
    "website_debounce": (
        "Ignores a repeated press of the same control for two minutes."
    ),
    "visibility_guard": ("Slows down after a touch lands right after a command."),
    "routine_timing": ("Waits for the next tidy clock slot before correcting."),
    "comfort_budget": ("Caps how many corrections may be sent in a rolling window."),
    "command_spacing": (
        "Keeps a minimum gap after each command, longer under pressure."
    ),
    "low_profile_governor": (
        "Holds safe corrections when the whole exchange has become busy."
    ),
    "natural_cadence": ("Picks a varied future moment for the next correction."),
    "comfort_pace": (
        "Plans a calm moment to answer when people go back and forth a lot."
    ),
    "comfort_envelope": (
        "Lets a small wall preference rest while it stays inside a narrow margin."
    ),
    "conflict_quiet": ("Stands down during an obvious tug of war."),
    "tug_of_war_truce": ("Calls a truce when the setting flips up and down."),
    "wall_settling": ("Waits for someone who is still tapping the wall to stop."),
    "comfort_compromise": ("Blends a repeated wall choice into a temporary target."),
    "comfort_memory": (
        "Learns a small time-of-day bias from repeated safe wall choices."
    ),
    "repeated_raise_surrender": (
        "When someone keeps asking for the same number, their number wins for a while."
    ),
    "wake_up_truce": (
        "A bedroom door opening at dawn means someone is awake, so it agrees on an early number."
    ),
    "cooler_intent_fast_lane": (
        "When people keep dialing cooler it stops being quiet and cools the room."
    ),
    "super_defender": ("Answers repeated phone or automation changes without waiting."),
    "rival_schedule_watch": (
        "Answers the thermostat app's own schedule as a machine, not a person."
    ),
    "desired_state_enforcer": (
        "Restores the chosen state when someone other than the owner changes it."
    ),
    "comfort_sync": ("Spaces out and softens corrections after a manual change."),
    "cool_mode_restore": ("Puts the mode back to cool after a short pause."),
    "dynamic_cooldown": (
        "A quiet period after a manual change that grows with touch frequency."
    ),
    "manual_comfort_grace": (
        "Leaves a manual change alone while the room is comfortable."
    ),
    "touch_intent": (
        "Extends the grace when recent changes clearly ask for warmer air."
    ),
    "setpoint_echo": (
        "Waits for the device to report the last setpoint before sending another."
    ),
    "repeat_quiet": ("Waits before sending the same number again."),
    "setpoint_stillness": ("Waits until the wall setting stops moving."),
    "sensor_rhythm": ("Times a correction for just after the usual sensor reading."),
    "hvac_alibi": ("Waits for a real change in what the unit is doing."),
    "telemetry_alibi": ("Waits for the next real update from the home."),
    "cooling_runway": ("Lets a new cooling cycle run before correcting again."),
    "room_trend_guard": (
        "Keeps watching while the room is already cooling on its own."
    ),
    "thermal_momentum": ("Waits when the room will reach the target soon by itself."),
    "weather_drift_timing": (
        "Holds while the outdoor temperature is stable or falling."
    ),
    "remote_settling_guard": (
        "Gives repeated phone or automation changes a quiet window."
    ),
    "natural_walkback": ("Walks the setpoint back in small, slightly varied steps."),
    "touch_signature": ("Matches nudges to the step size people use on the wall."),
    "human_nudge": ("Snaps follow-up commands to a normal thermostat step."),
}

HEAT_GUARD_DESCRIPTIONS: dict[str, str] = {
    "hot_room_override": (
        "At the too-warm temperature the heating is turned off at once."
    ),
    "cool_mode_restore": ("Puts the mode back as chosen after a short pause."),
    "cooler_intent_fast_lane": (
        "When people keep asking for less heat it stops being quiet and turns the heating down."
    ),
    "cooling_runway": ("Lets a new heating cycle run before correcting again."),
}
