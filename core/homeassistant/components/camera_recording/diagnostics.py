"""Diagnostics for camera recording."""

from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.const import CONF_PASSWORD, CONF_USERNAME
from homeassistant.core import HomeAssistant

from . import CameraRecordingConfigEntry
from .const import CONF_PRIVATE_KEY_FILE
from .light import resolve_sources
from .problem_log import mask_secrets

TO_REDACT = {CONF_PASSWORD, CONF_USERNAME, CONF_PRIVATE_KEY_FILE, "host", "share"}


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: CameraRecordingConfigEntry
) -> dict[str, Any]:
    """Return what is known about every camera, with credentials removed."""
    manager = entry.runtime_data
    cameras: dict[str, Any] = {}
    for cam in manager.cameras:
        recorder = manager.recorders.get(cam)
        mode = manager.modes.get(cam)
        effective, reason = manager.effective_mode(cam) if mode else (None, None)
        segments = manager.segments.get(cam, {})
        camera_state = hass.states.get(cam)
        cameras[cam] = {
            "camera_state": camera_state.state if camera_state else "missing",
            "paused": cam in manager.paused,
            "chosen_mode": mode.mode if mode else None,
            "effective_mode": effective,
            "mode_reason": reason,
            "event_sources": (
                resolve_sources(hass, cam, mode.sources) if mode else []
            ),
            "recorder": {
                "state": str(recorder.state) if recorder else None,
                "running": recorder.running if recorder else False,
                "last_error": mask_secrets(recorder.last_error or "")
                if recorder and recorder.last_error
                else None,
                "retry_at": recorder.retry_at if recorder else None,
                "started_at": recorder.started_at if recorder else None,
                "source": recorder.source_text if recorder else None,
                "no_source": recorder.no_source if recorder else None,
                "attempts_in_current_problem": recorder.problems.attempts
                if recorder
                else 0,
                "last_exit_code": recorder.last_exit_code if recorder else None,
                "last_ffmpeg_output": [
                    mask_secrets(line) for line in (recorder.stderr_tail if recorder else [])
                ],
            },
            "segments": len(segments),
            "bytes": sum(segment.size for segment in segments.values()),
            "events_remembered": len(manager.ledger.get(cam, [])),
            "last_problem": (
                {
                    "at": manager.last_problem[cam][0],
                    "reason": manager.last_problem[cam][1].value,
                }
                if cam in manager.last_problem
                else None
            ),
            "failures": dict(manager.failures.get(cam, {})),
        }
    return {
        "entry": {
            "title": entry.title,
            "data": async_redact_data(dict(entry.data), TO_REDACT),
            "options": async_redact_data(dict(entry.options), TO_REDACT),
        },
        "destination": manager.destination.kind,
        "last_copy": manager.last_copy.isoformat() if manager.last_copy else None,
        "last_error": mask_secrets(manager.last_error) if manager.last_error else None,
        "cameras": cameras,
    }
