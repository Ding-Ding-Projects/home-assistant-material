"""Tests for sending the problem log to a private repository.

No real host is contacted: a pretend host stands in for GitHub. These protect
the owner's rules: off until turned on, admins only, private repositories only
(checked before every send), one send an hour across restarts, held problems
stay out, the preview is exactly what is sent, a failure loses nothing, and the
sign-in never appears in a command result, a log line or a sent file.
"""

from datetime import timedelta
import json
import logging
from pathlib import Path
from typing import Any

from freezegun.api import FrozenDateTimeFactory
import pytest
from pytest_homeassistant.typing import WebSocketGenerator

from homeassistant.components.problem_log import DOMAIN
from homeassistant.components.problem_log.problem_core import render_problem
from homeassistant.components.problem_log.send_host import (
    DEVICE_APPROVED,
    DEVICE_DENIED,
    DEVICE_EXPIRED,
    DEVICE_PENDING,
    DEVICE_SLOW_DOWN,
    DeviceCode,
    DevicePoll,
    HostError,
    RepositoryEntry,
    RepositoryInfo,
    RepositoryList,
)
from homeassistant.components.problem_log.send_manager import ProblemLogSender
from homeassistant.components.problem_log.send_websocket import DATA_SENDER
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util

TOKEN = "ghp_PRETENDtoken0123456789abcdefXYZ"
REPOSITORY = "https://github.com/your-account/home-problem-log"


class PretendHost:
    """Stands in for GitHub; records what it was asked."""

    def __init__(self) -> None:
        """Start private, writable, reachable."""
        self.private = True
        self.visibility = "private"
        self.can_push = True
        self.repository_error: HostError | None = None
        self.commit_error: HostError | None = None
        self.commits: list[dict[str, Any]] = []
        self.checks = 0
        self.polls: list[DevicePoll] = []
        self.folder = ""
        self.listing: list[RepositoryEntry] = []
        self.create_error: HostError | None = None
        self.created: list[dict[str, Any]] = []

    async def repository(self, owner: str, name: str, token: str) -> RepositoryInfo:
        """Answer the visibility check."""
        self.checks += 1
        assert token == TOKEN
        if self.repository_error:
            raise self.repository_error
        return RepositoryInfo(self.private, self.visibility, self.can_push, "main")

    async def commit(
        self,
        owner: str,
        name: str,
        token: str,
        branch: str,
        files: dict[str, str],
        message: str,
    ) -> str:
        """Accept one commit."""
        if self.commit_error:
            raise self.commit_error
        self.commits.append({"files": files, "message": message, "branch": branch})
        return f"c{len(self.commits)}"

    async def layout(self, owner: str, name: str, token: str, branch: str) -> str:
        """Say where the files go."""
        return self.folder

    async def list_repositories(self, token: str) -> RepositoryList:
        """Answer the list of repositories."""
        assert token == TOKEN
        return RepositoryList(list(self.listing), False, False)

    async def create_repository(
        self, token: str, name: str, description: str, organization: str | None
    ) -> str:
        """Make a repository, or refuse."""
        assert token == TOKEN
        if self.create_error:
            raise self.create_error
        self.created.append(
            {"name": name, "description": description, "organization": organization}
        )
        return organization or "your-account"

    async def device_code(self, client_id: str) -> DeviceCode:
        """Hand out a code."""
        return DeviceCode(
            "DEVICE-SECRET", "WDJB-MJHT", "https://github.com/login/device", 900, 5
        )

    async def device_poll(self, client_id: str, device_code: str) -> DevicePoll:
        """Answer from the prepared list."""
        assert device_code == "DEVICE-SECRET"
        return self.polls.pop(0)


def _write_problem(config: Path, name: str, message: str, count: int = 1) -> None:
    folder = config / "problem_log"
    folder.mkdir(exist_ok=True)
    seen = dt_util.utcnow().isoformat(timespec="seconds")
    (folder / name).write_text(
        render_problem(
            logger="homeassistant.components.camera_recording",
            level="ERROR",
            version="2026.11.1.525",
            message=message,
            traceback="",
            first_seen=seen,
            last_seen=seen,
            count=count,
        ),
        encoding="utf-8",
    )


@pytest.fixture
def host() -> PretendHost:
    """The pretend host."""
    return PretendHost()


@pytest.fixture
async def sender(
    hass: HomeAssistant, tmp_path: Path, host: PretendHost
) -> ProblemLogSender:
    """Set the problem log up with the pretend host and two problems."""
    hass.config.config_dir = str(tmp_path)
    _write_problem(tmp_path, "camera-a.md", "Front door clip lost at 192.0.2.10", 4)
    _write_problem(tmp_path, "update-b.md", "An update was refused")
    hass.states.async_set("camera.front_door", "idle", {"friendly_name": "Front door"})
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    # Warnings logged by the test run itself would become new problems.
    logging.root.removeHandler(hass.data[DOMAIN].handler)
    await hass.async_block_till_done()
    hass.data[DOMAIN]._pending.clear()
    result = hass.data[DATA_SENDER]
    result._host_factory = lambda: host
    return result


async def _ready(sender: ProblemLogSender) -> None:
    await sender.async_update_settings({"repository": REPOSITORY})
    await sender.async_set_token(TOKEN)
    await sender.async_update_settings({"enabled": True})


async def _call(client: Any, **msg: Any) -> dict[str, Any]:
    await client.send_json_auto_id(msg)
    return await client.receive_json()


async def test_off_by_default(sender: ProblemLogSender, host: PretendHost) -> None:
    """Nothing is sent until the owner turns it on."""
    state = await sender.async_state()
    assert state["enabled"] is False
    assert state["signed_in"] is False
    assert state["mode"] == "by_hand"
    await sender.async_update_settings({"repository": REPOSITORY})
    await sender.async_set_token(TOKEN)
    with pytest.raises(Exception, match="off"):
        await sender.async_send()
    assert host.commits == []


async def test_commands_are_for_admins_only(
    hass: HomeAssistant,
    sender: ProblemLogSender,
    hass_ws_client: WebSocketGenerator,
    hass_read_only_access_token: str,
) -> None:
    """A user who is not an admin cannot use any command."""
    client = await hass_ws_client(hass, hass_read_only_access_token)
    for kind in (
        "state",
        "preview",
        "send_now",
        "test",
        "sign_out",
        "device_start",
        "device_cancel",
    ):
        reply = await _call(client, type=f"problem_log/send/{kind}")
        assert reply["success"] is False
        assert reply["error"]["code"] == "unauthorized"


async def test_secret_never_leaves(
    hass: HomeAssistant,
    sender: ProblemLogSender,
    host: PretendHost,
    hass_ws_client: WebSocketGenerator,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """The sign-in is in no command result, log line, preview or sent file."""
    client = await hass_ws_client(hass)
    replies = [
        await _call(client, type="problem_log/send/update", repository=REPOSITORY),
        await _call(client, type="problem_log/send/set_token", token=TOKEN),
        await _call(client, type="problem_log/send/update", enabled=True),
        await _call(client, type="problem_log/send/state"),
        await _call(client, type="problem_log/send/test"),
        await _call(client, type="problem_log/send/preview"),
        await _call(client, type="problem_log/send/send_now"),
    ]
    assert all(reply["success"] for reply in replies), replies
    # A refusal carries a plain code only.
    replies.append(await _call(client, type="problem_log/send/send_now"))
    assert replies[-1]["error"]["code"] == "too_soon"
    assert TOKEN not in json.dumps(replies)
    assert TOKEN not in caplog.text
    assert TOKEN not in json.dumps(host.commits)
    assert replies[3]["result"]["sign_in_method"] == "token"


async def test_preview_is_what_is_sent(
    sender: ProblemLogSender, host: PretendHost
) -> None:
    """The preview and the commit come from the same code and match exactly."""
    await _ready(sender)
    preview = await sender.async_preview()
    await sender.async_send()
    assert host.commits[0]["files"] == preview
    latest = preview["latest.md"]
    assert "[camera 1] clip lost at [hidden]" in latest
    assert "192.0.2.10" not in json.dumps(preview)
    assert "Front door" not in json.dumps(preview)
    assert set(preview) >= {
        "README.md",
        "latest.md",
        "problems/index.json",
        "system.md",
    }


async def test_keep_names_readable(sender: ProblemLogSender) -> None:
    """The switch keeps names of things, never addresses."""
    await sender.async_update_settings({"keep_names": True})
    latest = (await sender.async_preview())["latest.md"]
    assert "Front door clip lost at [hidden]" in latest


@pytest.mark.parametrize(
    ("private", "visibility", "error", "code"),
    [
        pytest.param(False, "public", None, "repository_public", id="public"),
        pytest.param(True, "internal", None, "visibility_unknown", id="internal"),
        pytest.param(
            True, "private", HostError("unreachable"), "unreachable", id="check_fails"
        ),
        pytest.param(
            True,
            "private",
            HostError("repository_missing"),
            "repository_missing",
            id="gone",
        ),
    ],
)
async def test_only_private_repositories(
    sender: ProblemLogSender,
    host: PretendHost,
    private: bool,
    visibility: str,
    error: HostError | None,
    code: str,
) -> None:
    """Turning on is refused unless the host reports the repository private."""
    host.private = private
    host.visibility = visibility
    host.repository_error = error
    await sender.async_update_settings({"repository": REPOSITORY})
    await sender.async_set_token(TOKEN)
    with pytest.raises(Exception, match=code):
        await sender.async_update_settings({"enabled": True})
    assert sender.enabled is False


async def test_visibility_is_checked_before_every_send(
    sender: ProblemLogSender, host: PretendHost
) -> None:
    """A repository that became public gets nothing, and the page is told why."""
    await _ready(sender)
    host.private = False
    host.visibility = "public"
    with pytest.raises(Exception, match="repository_public"):
        await sender.async_send()
    assert host.commits == []
    state = await sender.async_state()
    assert state["last_error"]["code"] == "repository_public"
    assert state["last_error"]["waiting"] == 2


async def test_one_send_an_hour_by_hand_scheduled_and_after_restart(
    hass: HomeAssistant,
    sender: ProblemLogSender,
    host: PretendHost,
    tmp_path: Path,
    freezer: FrozenDateTimeFactory,
) -> None:
    """Never more than one send an hour, whoever asks, even after a restart."""
    await _ready(sender)
    await sender.async_update_settings({"mode": "hourly"})
    await sender.async_send()
    assert len(host.commits) == 1
    _write_problem(tmp_path, "new-c.md", "Another problem")
    with pytest.raises(Exception, match="too_soon"):
        await sender.async_send()
    await sender._async_tick(dt_util.utcnow())
    assert len(host.commits) == 1

    restarted = ProblemLogSender(hass, hass.data[DOMAIN], lambda: host)
    await restarted.async_load()
    restarted.async_stop()
    state = await restarted.async_state()
    assert state["next_allowed"] == (sender.last_sent + timedelta(hours=1)).isoformat()
    with pytest.raises(Exception, match="too_soon"):
        await restarted.async_send()
    assert len(host.commits) == 1

    freezer.tick(timedelta(minutes=61))
    await sender._async_tick(dt_util.utcnow())
    assert len(host.commits) == 2
    assert "Another problem" in host.commits[1]["files"]["latest.md"]


async def test_hourly_waits_for_something_new(
    sender: ProblemLogSender, host: PretendHost, freezer: FrozenDateTimeFactory
) -> None:
    """The schedule sends nothing when every problem was already sent."""
    await _ready(sender)
    await sender.async_update_settings({"mode": "hourly"})
    await sender._async_tick(dt_util.utcnow())
    assert len(host.commits) == 1
    freezer.tick(timedelta(hours=2))
    await sender._async_tick(dt_util.utcnow())
    assert len(host.commits) == 1


async def test_hold_back(sender: ProblemLogSender, host: PretendHost) -> None:
    """A held problem is left out of every send and stays held."""
    await _ready(sender)
    await sender.async_hold("update-b.md", True)
    state = await sender.async_state()
    assert state["statuses"]["update-b.md"] == "held"
    assert state["counts"] == {"all": 2, "sent": 0, "not_sent": 1, "held": 1}
    await sender.async_send()
    assert "An update was refused" not in json.dumps(host.commits[0]["files"])
    state = await sender.async_state()
    assert state["statuses"] == {"camera-a.md": "sent", "update-b.md": "held"}


async def test_failure_loses_nothing(
    sender: ProblemLogSender, host: PretendHost
) -> None:
    """A refused send keeps every problem waiting and says why."""
    await _ready(sender)
    host.commit_error = HostError("token_refused")
    with pytest.raises(Exception, match="token_refused"):
        await sender.async_send()
    state = await sender.async_state()
    assert state["counts"]["not_sent"] == 2
    assert state["last_error"]["code"] == "token_refused"
    assert state["last_sent"] is None
    host.commit_error = None
    await sender.async_send()
    assert len(host.commits) == 1


async def test_host_limit_backs_off(
    sender: ProblemLogSender, host: PretendHost, freezer: FrozenDateTimeFactory
) -> None:
    """When the host limits requests, the next send waits as long as it asks."""
    await _ready(sender)
    host.commit_error = HostError("rate_limited", 7200)
    with pytest.raises(Exception, match="rate_limited"):
        await sender.async_send()
    host.commit_error = None
    freezer.tick(timedelta(hours=1))
    with pytest.raises(Exception, match="too_soon"):
        await sender.async_send()
    freezer.tick(timedelta(hours=1, seconds=1))
    await sender.async_send()
    assert len(host.commits) == 1


async def test_redaction_failure_sends_nothing(
    sender: ProblemLogSender, host: PretendHost, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If redaction breaks, nothing leaves."""
    await _ready(sender)

    def boom(*_args: object, **_kwargs: object) -> dict[str, str]:
        raise RuntimeError("broken")

    monkeypatch.setattr(
        "homeassistant.components.problem_log.send_manager.redact_for_sending", boom
    )
    with pytest.raises(Exception, match="redaction_failed"):
        await sender.async_send()
    assert host.commits == []


async def test_device_sign_in_needs_a_client_id(sender: ProblemLogSender) -> None:
    """Without a configured client id the guided sign-in is not offered."""
    state = await sender.async_state()
    assert state["device_sign_in_available"] is False
    with pytest.raises(Exception, match="no_client_id"):
        await sender.async_device_start()


async def test_device_sign_in_approved_after_slow_down(
    sender: ProblemLogSender, host: PretendHost
) -> None:
    """Pending, slow down, then approved: the token is kept and checked."""
    await sender.async_update_settings(
        {"client_id": "Iv1.pretend", "repository": REPOSITORY}
    )
    device = await sender.async_device_start()
    assert device["user_code"] == "WDJB-MJHT"
    assert device["state"] == DEVICE_PENDING
    assert "DEVICE-SECRET" not in json.dumps(await sender.async_state())
    host.polls = [
        DevicePoll(DEVICE_PENDING),
        DevicePoll(DEVICE_SLOW_DOWN, interval=10),
        DevicePoll(DEVICE_APPROVED, token=TOKEN),
    ]
    now = dt_util.utcnow()
    await sender._async_device_poll(now)
    await sender._async_device_poll(now)
    assert (await sender.async_state())["device"]["interval"] == 10
    await sender._async_device_poll(now)
    state = await sender.async_state()
    sender.async_stop()
    assert state["device"]["state"] == DEVICE_APPROVED
    assert state["signed_in"] is True
    assert state["sign_in_method"] == "device"
    assert state["last_check"]["ok"] is True
    assert TOKEN not in json.dumps(state)


@pytest.mark.parametrize(
    ("answer", "expected"),
    [
        pytest.param(DevicePoll(DEVICE_EXPIRED), DEVICE_EXPIRED, id="expired"),
        pytest.param(DevicePoll(DEVICE_DENIED), DEVICE_DENIED, id="denied"),
    ],
)
async def test_device_sign_in_ends(
    sender: ProblemLogSender, host: PretendHost, answer: DevicePoll, expected: str
) -> None:
    """An expired or refused code ends the wait without a sign-in."""
    await sender.async_update_settings({"client_id": "Iv1.pretend"})
    await sender.async_device_start()
    sender.async_stop()
    host.polls = [answer]
    await sender._async_device_poll(dt_util.utcnow())
    state = await sender.async_state()
    assert state["device"]["state"] == expected
    assert state["signed_in"] is False


async def test_device_sign_in_expires_by_time(
    sender: ProblemLogSender, freezer: FrozenDateTimeFactory
) -> None:
    """When the code's life is over, polling stops without asking the host."""
    await sender.async_update_settings({"client_id": "Iv1.pretend"})
    await sender.async_device_start()
    sender.async_stop()
    freezer.tick(timedelta(minutes=16))
    await sender._async_device_poll(dt_util.utcnow())
    assert (await sender.async_state())["device"]["state"] == DEVICE_EXPIRED


async def test_device_sign_in_cancelled(
    sender: ProblemLogSender, host: PretendHost
) -> None:
    """Cancelling stops the wait; a late approval is ignored."""
    await sender.async_update_settings({"client_id": "Iv1.pretend"})
    await sender.async_device_start()
    await sender.async_device_cancel()
    host.polls = [DevicePoll(DEVICE_APPROVED, token=TOKEN)]
    await sender._async_device_poll(dt_util.utcnow())
    state = await sender.async_state()
    assert state["device"]["state"] == "cancelled"
    assert state["signed_in"] is False
    assert host.polls  # the host was not asked


async def test_sign_out_turns_off(sender: ProblemLogSender) -> None:
    """Signing out forgets the sign-in and stops sending."""
    await _ready(sender)
    await sender.async_sign_out()
    state = await sender.async_state()
    assert state["signed_in"] is False
    assert state["enabled"] is False

def _entry(owner: str, name: str, private: bool, *, org: bool = False) -> RepositoryEntry:
    return RepositoryEntry(
        owner=owner,
        name=name,
        private=private,
        visibility="private" if private else "public",
        can_push=True,
        has_files=name != "home-problem-log",
        owner_is_organization=org,
        pushed_at="2026-11-19T20:58:00Z",
    )


LISTING = [
    _entry("your-account", "home-problem-log", True),
    _entry("your-account", "home-notes", True),
    _entry("your-account", "home-site", False),
    _entry("maple-lane", "household", True, org=True),
]


async def test_repository_list_marks_public_as_unusable(
    sender: ProblemLogSender, host: PretendHost
) -> None:
    """The list is filtered on the server and says which ones cannot be used."""
    host.listing = LISTING
    await sender.async_set_token(TOKEN)
    result = await sender.async_list_repositories("home")
    names = {r["full_name"]: r for r in result["repositories"]}
    assert set(names) == {
        "your-account/home-problem-log",
        "your-account/home-notes",
        "your-account/home-site",
    }
    assert names["your-account/home-site"]["private"] is False
    assert names["your-account/home-notes"]["has_files"] is True
    assert result["organizations"] == ["maple-lane"]
    assert TOKEN not in json.dumps(result)


async def test_choosing_a_public_repository_is_refused(
    sender: ProblemLogSender, host: PretendHost
) -> None:
    """A public repository can never become the target, whatever the page sends."""
    await sender.async_set_token(TOKEN)
    host.private = False
    host.visibility = "public"
    with pytest.raises(Exception, match="repository_public"):
        await sender.async_choose("your-account/home-site")
    assert sender.repository == ""
    host.private = True
    host.visibility = "private"
    host.folder = "problem-log/"
    await sender.async_choose("your-account/home-notes")
    assert sender.repository == "your-account/home-notes"
    assert (await sender.async_state())["folder"] == "problem-log/"


async def test_files_go_in_their_own_folder(
    sender: ProblemLogSender, host: PretendHost
) -> None:
    """A repository with other files gets the problem log in a folder."""
    host.folder = "problem-log/"
    await _ready(sender)
    await sender.async_send()
    files = host.commits[0]["files"]
    assert all(path.startswith("problem-log/") for path in files)
    assert "problem-log/README.md" in files


async def test_create_private_repository(
    sender: ProblemLogSender, host: PretendHost
) -> None:
    """A new repository is made private, read back, and chosen."""
    host.listing = LISTING
    await sender.async_set_token(TOKEN)
    await sender.async_create("home-problem-log", None)
    assert host.created[0]["name"] == "home-problem-log"
    assert "Home Assistant Material" in host.created[0]["description"]
    assert sender.repository == "your-account/home-problem-log"
    await sender.async_create("household-log", "maple-lane")
    assert sender.repository == "maple-lane/household-log"
    with pytest.raises(Exception, match="unknown_organization"):
        await sender.async_create("x", "someone-else")
    with pytest.raises(Exception, match="bad_name"):
        await sender.async_create("has space", None)


@pytest.mark.parametrize(
    ("error", "code"),
    [
        pytest.param(HostError("name_taken"), "name_taken", id="taken"),
        pytest.param(HostError("missing_scope"), "missing_scope", id="scope"),
    ],
)
async def test_create_refused(
    sender: ProblemLogSender, host: PretendHost, error: HostError, code: str
) -> None:
    """A name in use or a missing permission comes back as a plain code."""
    await sender.async_set_token(TOKEN)
    host.create_error = error
    with pytest.raises(Exception, match=code):
        await sender.async_create("home-problem-log", None)
    assert sender.repository == ""


async def test_created_repository_that_is_not_private_is_not_used(
    sender: ProblemLogSender, host: PretendHost
) -> None:
    """If the host reports the new repository as public, it is not chosen."""
    await sender.async_set_token(TOKEN)
    host.private = False
    host.visibility = "public"
    with pytest.raises(Exception, match="created_not_private"):
        await sender.async_create("home-problem-log", None)
    assert sender.repository == ""


async def test_wording_used_only_when_on(
    hass: HomeAssistant,
    sender: ProblemLogSender,
    host: PretendHost,
    hass_ws_client: WebSocketGenerator,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """The kept wording changes headings only, and is deleted when turned off."""
    client = await hass_ws_client(hass)
    entries = {"problems": "troubles", "Latest": "Newest"}
    reply = await _call(
        client, type="problem_log/send/wording", wording_entries=entries
    )
    assert reply["success"], reply
    assert reply["result"]["wording_in_use"] is True
    assert "troubles" not in json.dumps(reply)
    await _ready(sender)
    preview = await sender.async_preview()
    assert preview["latest.md"].startswith("# Newest troubles\n")
    assert "An update was refused" in preview["latest.md"]
    assert "troubles" not in caplog.text
    reply = await _call(client, type="problem_log/send/wording", wording_entries=None)
    assert reply["result"]["wording_in_use"] is False
    assert (await sender.async_preview())["latest.md"].startswith("# Latest problems")
    bad = await _call(
        client, type="problem_log/send/wording", wording_entries={"a": "line\nbreak"}
    )
    assert bad["error"]["code"] == "bad_wording"


async def test_system_file_keeps_program_names(
    hass: HomeAssistant, sender: ProblemLogSender
) -> None:
    """A thing named like the product does not rewrite system.md."""
    hass.states.async_set(
        "conversation.home_assistant", "idle", {"friendly_name": "Home Assistant"}
    )
    hass.states.async_set("sun.sun", "above_horizon", {"friendly_name": "Sun"})
    hass.config.components.add("sun")
    system = (await sender.async_preview())["system.md"]
    assert "[conversation" not in system
    assert "- sun" in system


async def test_client_id_shape_is_checked(sender: ProblemLogSender) -> None:
    """A client ID that cannot be one is refused; none is shipped by default."""
    assert (await sender.async_state())["client_id"] == ""
    with pytest.raises(Exception, match="bad_client_id"):
        await sender.async_update_settings({"client_id": "not an id"})
    await sender.async_update_settings({"client_id": "Ov23liPRETENDid0123"})
    assert (await sender.async_state())["device_sign_in_available"] is True
