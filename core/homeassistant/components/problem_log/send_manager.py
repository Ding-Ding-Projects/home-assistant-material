"""Send the problem log to a private repository on GitHub.

Off until the owner turns it on. Sends at most once an hour, by hand or on
the hourly schedule, and only to a repository the host reports as private,
checked before every send. Everything that leaves is redacted first, and the
preview is made by the same code as the real send. Nothing is read back from
the repository except the revision ids needed to add one commit.
"""

import asyncio
from collections.abc import Callable
import contextlib
from dataclasses import dataclass
from datetime import datetime, timedelta
import json
import logging
import pkgutil
import platform
import re
import socket
import time
from typing import Any
from urllib.parse import urlsplit

from homeassistant.const import __version__
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers import (
    area_registry as ar,
    device_registry as dr,
    entity_registry as er,
)
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_call_later, async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.loader import (
    Integration,
    async_get_custom_components,
    async_get_integrations,
)
from homeassistant.util import dt as dt_util

from .problem_core import redact as redact_confidential
from .send_files import (
    STATUS_NOT_SENT,
    Problem,
    SystemInfo,
    build_files,
    commit_message,
    counts,
    may_send,
    next_allowed,
    parse_repository,
    status_of,
    valid_owner_name,
    valid_repository_name,
)
from .send_host import (
    DEVICE_APPROVED,
    DEVICE_DENIED,
    DEVICE_EXPIRED,
    DEVICE_PENDING,
    DEVICE_SLOW_DOWN,
    ERROR_NO_WRITE,
    ERROR_RATE_LIMITED,
    GitHubHost,
    HostError,
    RepositoryList,
)
from .send_redact import (
    ENTITY_DOMAINS,
    KIND_AREA,
    KIND_DEVICE,
    KIND_PERSON,
    KIND_PLACE,
    LabelBook,
    NamedThing,
    RedactContext,
    RedactionError,
    entity_names,
    kind_of_domain,
    leaked,
    redact_for_sending,
)
from .send_wording import WordingRefused, build_replacer, check_entries

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY = "problem_log.send"
AUTH_STORAGE_KEY = "problem_log.send_auth"
# The owner's wording, kept apart so that it is easy to leave out of backups.
WORDING_STORAGE_KEY = "problem_log.send_wording"
STORAGE_VERSION = 1

MODE_BY_HAND = "by_hand"
MODE_HOURLY = "hourly"
MODES = (MODE_BY_HAND, MODE_HOURLY)

METHOD_DEVICE = "device"
METHOD_TOKEN = "token"

ERROR_OFF = "off"
ERROR_NO_REPOSITORY = "no_repository"
ERROR_NOT_SIGNED_IN = "not_signed_in"
ERROR_PUBLIC = "repository_public"
ERROR_VISIBILITY_UNKNOWN = "visibility_unknown"
ERROR_REDACTION = "redaction_failed"
ERROR_TOO_SOON = "too_soon"
ERROR_NOTHING_NEW = "nothing_new"
ERROR_NO_CLIENT_ID = "no_client_id"
ERROR_BUSY = "busy"
ERROR_BAD_NAME = "bad_name"
ERROR_UNKNOWN_ORGANIZATION = "unknown_organization"
ERROR_CREATED_NOT_PRIVATE = "created_not_private"
ERROR_BAD_WORDING = "bad_wording"
ERROR_BAD_CLIENT_ID = "bad_client_id"

REPOSITORY_DESCRIPTION = (
    "Problem log of one home, written by Home Assistant Material. "
    "Only ever written to; nothing here is read back."
)
# How long the list of repositories is reused before it is read again.
LIST_CACHE_SECONDS = 300

DEVICE_CANCELLED = "cancelled"
DEVICE_FAILED = "failed"

SCHEDULE_CHECK = timedelta(minutes=5)
RATE_LIMIT_FALLBACK = timedelta(minutes=15)

# The files that are written as they are, without passing names through
# redaction: they hold only this feature's own text and the names of
# programs, never anything about this home. They are still checked for the
# sign-in and the secrets.
_FIXED_FILES = {"README.md", "system.md"}


class SendRefused(Exception):
    """A send or check did not happen. Carries a plain code."""

    def __init__(self, code: str) -> None:
        """Initialize."""
        super().__init__(code)
        self.code = code


@dataclass
class _DeviceSignIn:
    state: str
    user_code: str = ""
    verification_uri: str = ""
    expires_at: datetime | None = None
    interval: int = 5
    device_code: str = ""


_CLIENT_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{9,39}")


def valid_client_id(text: str) -> bool:
    """Return True if the text has the shape of a GitHub app's client ID."""
    return _CLIENT_ID.fullmatch(text) is not None


_BUILTIN_DOMAINS: list[str] = []


def _builtin_domains() -> list[str]:
    """Return every built-in integration domain (read once, from the files)."""
    if not _BUILTIN_DOMAINS:
        import homeassistant.components as components  # noqa: PLC0415

        _BUILTIN_DOMAINS.extend(
            module.name for module in pkgutil.iter_modules(components.__path__)
        )
    return _BUILTIN_DOMAINS


def _iso(moment: datetime | None) -> str | None:
    return moment.isoformat() if moment else None


def _parse(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    return dt_util.parse_datetime(value)


class ProblemLogSender:
    """The owner's settings and the sending of the problem log."""

    def __init__(
        self,
        hass: HomeAssistant,
        log: Any,
        host_factory: Callable[[], Any] | None = None,
    ) -> None:
        """Initialize."""
        self.hass = hass
        self._log = log
        self._host_factory = host_factory or (
            lambda: GitHubHost(async_get_clientsession(hass))
        )
        self._store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION, STORAGE_KEY, private=True
        )
        self._auth_store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION, AUTH_STORAGE_KEY, private=True
        )
        self._wording_store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION, WORDING_STORAGE_KEY, private=True
        )
        self._wording: dict[str, str] | None = None
        # The owner's repositories as last read, and when; never stored.
        self._listing: RepositoryList | None = None
        self._listing_at = 0.0
        self.enabled = False
        self.mode = MODE_BY_HAND
        self.repository = ""
        self.keep_names = False
        self.client_id = ""
        # "" for the root of the repository, or "problem-log/" when the
        # repository also holds other files.
        self.folder = ""
        self._token: str | None = None
        self._method: str | None = None
        self.last_sent: datetime | None = None
        self.backoff_until: datetime | None = None
        self.sent: dict[str, int] = {}
        self.held: set[str] = set()
        self.book = LabelBook()
        self.last_error: dict[str, Any] | None = None
        self.last_check: dict[str, Any] | None = None
        self.last_commit: str | None = None
        self._device: _DeviceSignIn | None = None
        self._device_timer: CALLBACK_TYPE | None = None
        self._schedule: CALLBACK_TYPE | None = None
        self._lock = asyncio.Lock()
        self._statuses: dict[str, str] = {}

    async def async_load(self) -> None:
        """Read the stored settings and start the schedule."""
        data = await self._store.async_load() or {}
        settings = data.get("settings", {})
        self.enabled = bool(settings.get("enabled", False))
        self.mode = (
            settings.get("mode") if settings.get("mode") in MODES else MODE_BY_HAND
        )
        self.repository = str(settings.get("repository", ""))
        self.keep_names = bool(settings.get("keep_names", False))
        self.client_id = str(settings.get("client_id", ""))
        self.folder = "problem-log/" if settings.get("folder") == "problem-log/" else ""
        self.last_sent = _parse(data.get("last_sent"))
        self.backoff_until = _parse(data.get("backoff_until"))
        sent = data.get("sent", {})
        self.sent = (
            {str(k): int(v) for k, v in sent.items() if isinstance(v, int)}
            if isinstance(sent, dict)
            else {}
        )
        self.held = {str(item) for item in data.get("held", [])}
        self.book = LabelBook.from_dict(data.get("labels"))
        self.last_error = data.get("last_error")
        self.last_check = data.get("last_check")
        self.last_commit = data.get("last_commit")
        auth = await self._auth_store.async_load() or {}
        if isinstance(auth.get("token"), str) and auth["token"]:
            self._token = auth["token"]
            self._method = str(auth.get("method", METHOD_TOKEN))
        wording = await self._wording_store.async_load() or {}
        try:
            self._wording = check_entries(wording.get("entries"))
        except WordingRefused:
            self._wording = None
        self._schedule = async_track_time_interval(
            self.hass, self._async_tick, SCHEDULE_CHECK
        )

    @callback
    def async_stop(self) -> None:
        """Stop the schedule and any waiting sign-in."""
        if self._schedule is not None:
            self._schedule()
            self._schedule = None
        self._cancel_device_timer()

    def _data(self) -> dict[str, Any]:
        return {
            "settings": {
                "enabled": self.enabled,
                "mode": self.mode,
                "repository": self.repository,
                "keep_names": self.keep_names,
                "client_id": self.client_id,
                "folder": self.folder,
            },
            "last_sent": _iso(self.last_sent),
            "backoff_until": _iso(self.backoff_until),
            "sent": self.sent,
            "held": sorted(self.held),
            "labels": self.book.as_dict(),
            "last_error": self.last_error,
            "last_check": self.last_check,
            "last_commit": self.last_commit,
        }

    async def _async_save(self) -> None:
        await self._store.async_save(self._data())

    async def _async_save_auth(self) -> None:
        await self._auth_store.async_save(
            {"token": self._token, "method": self._method} if self._token else {}
        )

    @property
    def signed_in(self) -> bool:
        """Return True if a sign-in is stored."""
        return bool(self._token)

    async def _async_problems(self) -> list[Problem]:
        await self._log.async_flush()
        overview = await self.hass.async_add_executor_job(self._log.list_problems)
        return [Problem.from_record(item) for item in overview.get("problems", [])]

    async def async_state(self) -> dict[str, Any]:
        """Return everything the page shows. Never includes the sign-in."""
        problems = await self._async_problems()
        self._statuses = {p.file: status_of(p, self.sent, self.held) for p in problems}
        device = None
        if self._device is not None:
            device = {
                "state": self._device.state,
                "user_code": self._device.user_code,
                "verification_uri": self._device.verification_uri,
                "expires_at": _iso(self._device.expires_at),
                "interval": self._device.interval,
            }
        return {
            "enabled": self.enabled,
            "mode": self.mode,
            "repository": self.repository,
            "keep_names": self.keep_names,
            "client_id": self.client_id,
            "device_sign_in_available": bool(self.client_id),
            "folder": self.folder,
            "wording_in_use": self._wording is not None,
            "signed_in": self.signed_in,
            "sign_in_method": self._method if self.signed_in else None,
            "last_sent": _iso(self.last_sent),
            "next_allowed": _iso(next_allowed(self.last_sent, self.backoff_until)),
            "backoff_until": _iso(self.backoff_until),
            "last_error": self.last_error,
            "last_check": self.last_check,
            "last_commit": self.last_commit,
            "device": device,
            "statuses": self._statuses,
            "counts": counts(problems, self.sent, self.held),
        }

    async def async_update_settings(self, changes: dict[str, Any]) -> None:
        """Change settings. Turning on checks the repository first."""
        if "repository" in changes:
            address = str(changes["repository"]).strip()
            if address and parse_repository(address) is None:
                raise SendRefused(ERROR_NO_REPOSITORY)
            if address != self.repository:
                self.last_check = None
                self.enabled = False
                self.folder = ""
            self.repository = address
        if "mode" in changes and changes["mode"] in MODES:
            self.mode = changes["mode"]
        if "keep_names" in changes:
            self.keep_names = bool(changes["keep_names"])
        if "client_id" in changes:
            client_id = str(changes["client_id"]).strip()
            if client_id and not valid_client_id(client_id):
                raise SendRefused(ERROR_BAD_CLIENT_ID)
            self.client_id = client_id
        if "enabled" in changes:
            if changes["enabled"]:
                await self._async_check_repository()
                self.enabled = True
            else:
                self.enabled = False
        await self._async_save()

    async def async_set_token(self, token: str) -> dict[str, Any] | None:
        """Store a token from the owner, then check the repository with it."""
        token = token.strip()
        if not token:
            raise SendRefused(ERROR_NOT_SIGNED_IN)
        self._token = token
        self._method = METHOD_TOKEN
        await self._async_save_auth()
        return await self._async_check_quietly()

    async def async_sign_out(self) -> None:
        """Forget the sign-in and turn sending off."""
        self._token = None
        self._method = None
        self.enabled = False
        self.last_check = None
        self._cancel_device_timer()
        self._device = None
        self._listing = None
        await self._async_save_auth()
        await self._async_save()

    async def _async_check_quietly(self) -> dict[str, Any] | None:
        if not self.repository:
            return None
        with contextlib.suppress(SendRefused):
            await self._async_check_repository()
        await self._async_save()
        return self.last_check

    async def async_test(self) -> dict[str, Any]:
        """Check the repository without sending anything."""
        try:
            await self._async_check_repository()
        finally:
            await self._async_save()
        return self.last_check or {}

    async def _async_check_repository(self) -> tuple[Any, str, str, str]:
        """Read visibility and permission from the host; refuse unless private."""
        target = parse_repository(self.repository) if self.repository else None
        if target is None:
            raise SendRefused(ERROR_NO_REPOSITORY)
        if not self._token:
            raise SendRefused(ERROR_NOT_SIGNED_IN)
        owner, name = target
        host = self._host_factory()
        now = dt_util.utcnow()
        try:
            info = await host.repository(owner, name, self._token)
        except HostError as err:
            self.last_check = {"ok": False, "error": err.code, "at": _iso(now)}
            self._note_rate_limit(err, now)
            raise SendRefused(err.code) from None
        is_private = info.private and info.visibility in ("private", "")
        if not info.private or info.visibility == "public":
            code: str | None = ERROR_PUBLIC
        elif not is_private:
            # "internal" and anything new: readable beyond the owner, or unknown.
            code = ERROR_VISIBILITY_UNKNOWN
        elif not info.can_push:
            code = ERROR_NO_WRITE
        else:
            code = None
        if code is None:
            try:
                self.folder = await host.layout(
                    owner, name, self._token, info.default_branch
                )
            except HostError as err:
                self.last_check = {"ok": False, "error": err.code, "at": _iso(now)}
                self._note_rate_limit(err, now)
                raise SendRefused(err.code) from None
        self.last_check = {
            "ok": code is None,
            "error": code,
            "private": is_private,
            "can_push": info.can_push,
            "at": _iso(now),
        }
        if code is not None:
            raise SendRefused(code)
        return host, owner, name, info.default_branch

    def _note_rate_limit(self, err: HostError, now: datetime) -> None:
        if err.code != ERROR_RATE_LIMITED:
            return
        wait = (
            timedelta(seconds=err.retry_after)
            if err.retry_after
            else RATE_LIMIT_FALLBACK
        )
        self.backoff_until = now + wait

    def _words(self) -> Callable[[str], str]:
        """Return the owner's wording for this feature's own text, or no change."""
        if self._wording is None:
            return lambda text: text
        return build_replacer(self._wording)

    async def async_set_wording(self, entries: object | None) -> None:
        """Keep the owner's wording on this system, or delete the kept copy."""
        if entries is None:
            self._wording = None
            await self._wording_store.async_remove()
            return
        try:
            checked = check_entries(entries)
        except WordingRefused:
            raise SendRefused(ERROR_BAD_WORDING) from None
        self._wording = checked
        await self._wording_store.async_save({"entries": checked})

    async def _async_listing(self, refresh: bool) -> RepositoryList:
        if not self._token:
            raise SendRefused(ERROR_NOT_SIGNED_IN)
        if (
            refresh
            or self._listing is None
            or time.monotonic() - self._listing_at > LIST_CACHE_SECONDS
        ):
            host = self._host_factory()
            try:
                self._listing = await host.list_repositories(self._token)
            except HostError as err:
                self._note_rate_limit(err, dt_util.utcnow())
                raise SendRefused(err.code) from None
            self._listing_at = time.monotonic()
        return self._listing

    async def async_list_repositories(
        self, query: str = "", *, refresh: bool = False
    ) -> dict[str, Any]:
        """Return the owner's repositories that match the typed text.

        Public ones are listed so the owner sees why they are missing from
        the choice, marked as unusable; they can never be chosen.
        """
        listing = await self._async_listing(refresh)
        needle = query.strip().lower()
        matches = [
            entry
            for entry in listing.entries
            if not needle or needle in entry.full_name.lower()
        ]
        organizations = sorted(
            {entry.owner for entry in listing.entries if entry.owner_is_organization},
            key=str.lower,
        )
        return {
            "repositories": [
                {
                    "full_name": entry.full_name,
                    "owner": entry.owner,
                    "name": entry.name,
                    "private": entry.private and entry.visibility in ("private", ""),
                    "visibility": entry.visibility,
                    "can_push": entry.can_push,
                    "has_files": entry.has_files,
                    "pushed_at": entry.pushed_at,
                    "selected": entry.full_name.lower() == self.repository.lower(),
                }
                for entry in matches
            ],
            "total": len(listing.entries),
            "organizations": organizations,
            "truncated": listing.truncated,
            "missing_scope": "repo" if listing.missing_scope else None,
        }

    async def async_choose(self, full_name: str) -> None:
        """Make a private repository from the list the target, after asking the host."""
        target = parse_repository(full_name)
        if target is None:
            raise SendRefused(ERROR_NO_REPOSITORY)
        previous = (self.repository, self.enabled, self.folder, self.last_check)
        self.repository = f"{target[0]}/{target[1]}"
        if previous[0].lower() != self.repository.lower():
            self.enabled = False
            self.folder = ""
        try:
            await self._async_check_repository()
        except SendRefused as err:
            if err.code in (ERROR_PUBLIC, ERROR_VISIBILITY_UNKNOWN):
                # A public repository is never kept as the target.
                (self.repository, self.enabled, self.folder, self.last_check) = previous
            await self._async_save()
            raise
        await self._async_save()

    async def async_create(self, name: str, organization: str | None) -> None:
        """Make a new private repository, check it is private, and choose it."""
        name = name.strip()
        if not valid_repository_name(name):
            raise SendRefused(ERROR_BAD_NAME)
        if not self._token:
            raise SendRefused(ERROR_NOT_SIGNED_IN)
        if organization:
            if not valid_owner_name(organization):
                raise SendRefused(ERROR_UNKNOWN_ORGANIZATION)
            listing = await self._async_listing(False)
            known = {e.owner for e in listing.entries if e.owner_is_organization}
            if organization not in known:
                raise SendRefused(ERROR_UNKNOWN_ORGANIZATION)
        host = self._host_factory()
        try:
            owner = await host.create_repository(
                self._token, name, REPOSITORY_DESCRIPTION, organization or None
            )
        except HostError as err:
            self._note_rate_limit(err, dt_util.utcnow())
            raise SendRefused(err.code) from None
        self._listing = None
        try:
            info = await host.repository(owner, name, self._token)
        except HostError as err:
            raise SendRefused(err.code) from None
        if not info.private or info.visibility not in ("private", ""):
            raise SendRefused(ERROR_CREATED_NOT_PRIVATE)
        await self.async_choose(f"{owner}/{name}")

    async def async_hold(self, file: str, held: bool) -> None:
        """Hold a problem back from every send, or let it go again."""
        if held:
            self.held.add(file)
        else:
            self.held.discard(file)
        await self._async_save()

    async def _async_context(self) -> RedactContext:
        """Gather what is private about this home."""
        hass = self.hass
        secrets = await hass.async_add_executor_job(
            self._log._load_secrets  # noqa: SLF001
        )
        hostnames = [socket.gethostname()]
        hostnames.extend(
            host
            for url in (hass.config.internal_url, hass.config.external_url)
            if url and (host := urlsplit(url).hostname)
        )
        coordinates = [hass.config.latitude, hass.config.longitude]
        things: list[NamedThing] = []
        if hass.config.location_name:
            things.append(
                NamedThing("location", KIND_PLACE, (hass.config.location_name,))
            )
        for state in hass.states.async_all():
            if state.domain == "zone":
                coordinates.extend(
                    float(value)
                    for key in ("latitude", "longitude")
                    if isinstance(value := state.attributes.get(key), int | float)
                )
            friendly = state.attributes.get("friendly_name")
            things.append(
                NamedThing(
                    state.entity_id,
                    kind_of_domain(state.domain),
                    entity_names(
                        state.entity_id, friendly if isinstance(friendly, str) else None
                    ),
                )
            )
        things.extend(
            NamedThing(
                entry.entity_id,
                kind_of_domain(entry.domain),
                (entry.entity_id, entry.name) if entry.name else (entry.entity_id,),
            )
            for entry in er.async_get(hass).entities.values()
        )
        things.extend(
            NamedThing(f"device:{device.id}", KIND_DEVICE, names)
            for device in dr.async_get(hass).devices
            if (names := tuple(n for n in (device.name_by_user, device.name) if n))
        )
        things.extend(
            NamedThing(f"area:{area.id}", KIND_AREA, (area.name,))
            for area in ar.async_get(hass).async_list_areas()
        )
        things.extend(
            NamedThing(f"user:{user.id}", KIND_PERSON, (user.name,))
            for user in await hass.auth.async_get_users()
            if user.name and not user.system_generated
        )
        return RedactContext(
            secrets=list(secrets),
            hostnames=[h for h in hostnames if h],
            coordinates=[float(c) for c in coordinates if c is not None],
            things=things,
            program_names=await self._async_program_names(),
            entity_domains=sorted(
                {state.domain for state in hass.states.async_all()}
                | {entry.domain for entry in er.async_get(hass).entities.values()}
                | ENTITY_DOMAINS
            ),
        )

    async def _async_program_names(self) -> list[str]:
        """Return every integration domain and name the loader knows."""
        hass = self.hass
        domains = {c.split(".", 1)[0] for c in hass.config.components}
        domains |= {entry.domain for entry in hass.config_entries.async_entries()}
        names = set(domains)
        names.update(await hass.async_add_executor_job(_builtin_domains))
        integrations = await async_get_integrations(hass, domains)
        names.update(
            value.name
            for value in integrations.values()
            if isinstance(value, Integration) and value.name
        )
        for integration in (await async_get_custom_components(hass)).values():
            names.add(integration.domain)
            if integration.name:
                names.add(integration.name)
        return sorted(names)

    def _system(self) -> SystemInfo:
        hass = self.hass
        integrations = sorted(
            {c for c in hass.config.components if "." not in c}
            | {entry.domain for entry in hass.config_entries.async_entries()}
        )
        installation = "unknown"
        if "hassio" in hass.config.components:
            installation = "Home Assistant OS or Supervised"
        return SystemInfo(
            build=__version__,
            python=platform.python_version(),
            installation=installation,
            operating_system=platform.system(),
            architecture=platform.machine(),
            integrations=integrations,
        )

    async def _async_build(self) -> tuple[dict[str, str], list[Problem]]:
        """Make the redacted files of the next send. Raises SendRefused on failure."""
        problems = await self._async_problems()
        try:
            context = await self._async_context()
            system = self._system()
            zone = dt_util.get_default_time_zone()
            files = build_files(
                problems,
                self.held,
                system,
                zone,
                words=self._words(),
                folder=self.folder,
            )
            fixed = {
                path: redact_confidential(text, context.secrets)
                for path, text in files.items()
                if path.removeprefix(self.folder) in _FIXED_FILES
            }
            variable = {p: t for p, t in files.items() if p not in fixed}
            forbidden = [self._token] if self._token else []
            redacted = await self.hass.async_add_executor_job(
                lambda: redact_for_sending(
                    variable,
                    context,
                    self.book,
                    keep_names=self.keep_names,
                    forbidden=forbidden,
                )
            )
            for text in fixed.values():
                if leaked(text, forbidden, context.secrets):
                    raise RedactionError("A confidential value was still present")  # noqa: TRY301
            json.loads(redacted[f"{self.folder}problems/index.json"])
        except Exception as err:  # noqa: BLE001
            # Fail closed: whatever went wrong, nothing is sent.
            _LOGGER.warning(
                "The problem log was not prepared for sending (%s)", type(err).__name__
            )
            raise SendRefused(ERROR_REDACTION) from None
        return {**fixed, **redacted}, problems

    async def async_preview(self) -> dict[str, str]:
        """Return the exact files the next send would write."""
        async with self._lock:
            files, _ = await self._async_build()
            await self._async_save()
        return files

    async def async_send(self, *, scheduled: bool = False) -> dict[str, Any]:
        """Send once, if every rule allows it."""
        if self._lock.locked():
            raise SendRefused(ERROR_BUSY)
        async with self._lock:
            return await self._async_send_locked(scheduled)

    async def _async_send_locked(self, scheduled: bool) -> dict[str, Any]:
        now = dt_util.utcnow()
        if not self.enabled:
            raise SendRefused(ERROR_OFF)
        if not may_send(now, self.last_sent, self.backoff_until):
            raise SendRefused(ERROR_TOO_SOON)
        problems = await self._async_problems()
        waiting = sum(
            1 for p in problems if status_of(p, self.sent, self.held) == STATUS_NOT_SENT
        )
        if not waiting:
            raise SendRefused(ERROR_NOTHING_NEW)
        try:
            host, owner, name, branch = await self._async_check_repository()
            files, problems = await self._async_build()
            sha = await host.commit(
                owner,
                name,
                self._token,
                branch,
                files,
                commit_message(waiting, dt_util.as_local(now), self._words()),
            )
        except SendRefused as err:
            await self._async_failed(err.code, now, waiting)
            raise
        except HostError as err:
            self._note_rate_limit(err, now)
            await self._async_failed(err.code, now, waiting)
            raise SendRefused(err.code) from None
        self.last_sent = now
        self.backoff_until = None
        self.last_error = None
        self.last_commit = sha
        for problem in problems:
            if problem.file not in self.held:
                self.sent[problem.file] = problem.count
        known = {p.file for p in problems}
        self.sent = {k: v for k, v in self.sent.items() if k in known}
        await self._async_save()
        return {"sent": waiting, "commit": sha, "at": _iso(now), "scheduled": scheduled}

    async def _async_failed(self, code: str, now: datetime, waiting: int) -> None:
        self.last_error = {"code": code, "at": _iso(now), "waiting": waiting}
        _LOGGER.warning("The problem log was not sent: %s", code)
        await self._async_save()

    async def _async_tick(self, _now: datetime) -> None:
        """Send on the hourly schedule when it is time and something is new."""
        if not self.enabled or self.mode != MODE_HOURLY:
            return
        if not may_send(dt_util.utcnow(), self.last_sent, self.backoff_until):
            return
        try:
            await self.async_send(scheduled=True)
        except SendRefused:
            return

    @callback
    def _cancel_device_timer(self) -> None:
        if self._device_timer is not None:
            self._device_timer()
            self._device_timer = None

    async def async_device_start(self) -> dict[str, Any]:
        """Start a device sign-in and return the code for the owner."""
        if not self.client_id:
            raise SendRefused(ERROR_NO_CLIENT_ID)
        self._cancel_device_timer()
        host = self._host_factory()
        try:
            code = await host.device_code(self.client_id)
        except HostError as err:
            raise SendRefused(err.code) from None
        self._device = _DeviceSignIn(
            state=DEVICE_PENDING,
            user_code=code.user_code,
            verification_uri=code.verification_uri,
            expires_at=dt_util.utcnow() + timedelta(seconds=code.expires_in),
            interval=max(code.interval, 1),
            device_code=code.device_code,
        )
        self._schedule_poll()
        return (await self.async_state())["device"]

    @callback
    def _schedule_poll(self) -> None:
        if self._device is None:
            return
        self._device_timer = async_call_later(
            self.hass, self._device.interval, self._async_device_poll
        )

    async def _async_device_poll(self, _now: datetime) -> None:
        self._device_timer = None
        device = self._device
        if device is None or device.state not in (DEVICE_PENDING, DEVICE_SLOW_DOWN):
            return
        if device.expires_at and dt_util.utcnow() >= device.expires_at:
            device.state = DEVICE_EXPIRED
            device.device_code = ""
            return
        host = self._host_factory()
        try:
            answer = await host.device_poll(self.client_id, device.device_code)
        except HostError:
            device.state = DEVICE_FAILED
            device.device_code = ""
            return
        if self._device is not device or device.state == DEVICE_CANCELLED:
            return
        if answer.state == DEVICE_APPROVED and answer.token:
            device.state = DEVICE_APPROVED
            device.device_code = ""
            self._token = answer.token
            self._method = METHOD_DEVICE
            await self._async_save_auth()
            await self._async_check_quietly()
            return
        if answer.state == DEVICE_SLOW_DOWN:
            device.state = DEVICE_SLOW_DOWN
            device.interval = answer.interval or device.interval + 5
            self._schedule_poll()
            return
        if answer.state == DEVICE_PENDING:
            device.state = DEVICE_PENDING
            self._schedule_poll()
            return
        device.state = (
            DEVICE_EXPIRED if answer.state == DEVICE_EXPIRED else DEVICE_DENIED
        )
        device.device_code = ""

    async def async_device_cancel(self) -> None:
        """Stop waiting for the owner to approve."""
        self._cancel_device_timer()
        if self._device is not None:
            self._device.state = DEVICE_CANCELLED
            self._device.device_code = ""
