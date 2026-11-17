"""Tunnel runner that starts the official tunnel client in managed containers."""

import asyncio
from collections.abc import Callable
from contextlib import suppress
import hashlib
import logging
import os
from pathlib import Path, PurePath
import re
import shutil
from typing import TYPE_CHECKING
from urllib.parse import urlsplit

import aiodocker

from ..const import DOCKER_IPV4_NETWORK_MASK
from ..docker.const import DockerMount, MountType, RestartPolicy
from ..exceptions import CloudHostRunnerError, DockerError, DockerNotFound
from .const import (
    CLIENT_CERT_FILE,
    CLIENT_DATA_TARGET,
    CLIENT_IMAGE,
    CLIENT_TAG,
    CLIENT_USER_ID,
    LOGIN_DOCKER_NAME,
    PULL_TIMEOUT_SECONDS,
    RE_HOSTNAME,
    SIGN_IN_HOST,
    SIGN_IN_POLL_SECONDS,
    SIGN_IN_TIMEOUT_SECONDS,
    STEP_TIMEOUT_SECONDS,
    STOP_TIMEOUT_SECONDS,
    TUNNEL_DOCKER_NAME,
    TUNNEL_NAME_FILE,
)
from .runner import TunnelRunner

if TYPE_CHECKING:
    from ..docker.manager import DockerAPI

_LOGGER: logging.Logger = logging.getLogger(__name__)

RE_URL_IN_LINE = re.compile(r"https://\S+")
RE_CREDENTIAL_FILE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$")
RE_TUNNEL_NAME = re.compile(r"^ham-[0-9a-f]{16}$")
RE_ORIGIN =re.compile(r"^https?://[0-9]{1,3}(?:\.[0-9]{1,3}){3}(?::[0-9]{1,5})?$")


def parse_sign_in_url(lines: list[str]) -> str | None:
    """Return the first sign-in address on the provider's login domain, or None.

    The client prints a short sentence, a blank line, the address on a line of its
    own, a blank line and a sentence about leaving the client running. Only a
    line that holds a https address is considered, and only one for the
    provider's own login domain is accepted.
    """
    for line in lines:
        for candidate in RE_URL_IN_LINE.findall(line.strip()):
            if valid_sign_in_url(candidate):
                return candidate
    return None


def valid_sign_in_url(value: str) -> bool:
    """Return True when the address is https on the provider's login domain."""
    try:
        parts = urlsplit(value)
        port = parts.port
    except ValueError:
        return False
    return (
        parts.scheme == "https"
        and parts.hostname == SIGN_IN_HOST
        and port is None
        and parts.username is None
        and parts.password is None
    )


def tunnel_name(hostname: str) -> str:
    """Return the tunnel name for this instance, derived from the hostname."""
    return f"ham-{hashlib.sha256(hostname.encode()).hexdigest()[:16]}"


def create_command(name: str) -> list[str]:
    """Return the command that creates a named tunnel."""
    return ["tunnel", "create", name]


def route_command(name: str, hostname: str) -> list[str]:
    """Return the command that routes a hostname to a named tunnel."""
    return ["tunnel", "route", "dns", name, hostname]


def delete_command(name: str) -> list[str]:
    """Return the command that deletes a named tunnel at the provider."""
    return ["tunnel", "delete", "-f", name]


def run_tunnel_command(name: str, origin: str) -> list[str]:
    """Return the command that serves a named tunnel towards the origin."""
    command = [
        "tunnel",
        "--no-autoupdate",
        "--metrics",
        "0.0.0.0:2000",
        "run",
        "--url",
        origin,
    ]
    if origin.startswith("https://"):
        command.append("--no-tls-verify")
    command.append(name)
    return command


class DockerTunnelRunner(TunnelRunner):
    """Runs the tunnel client as Supervisor managed containers.

    The credential files live in a folder private to the cloud host. They are
    only ever checked for existence and handed to the client by mounting the
    folder; nothing here reads, logs or returns their content.
    """

    def __init__(
        self,
        docker: "DockerAPI",
        data_dir: Path,
        extern_data_dir: PurePath,
        core_url: Callable[[], str],
        *,
        poll_seconds: float = SIGN_IN_POLL_SECONDS,
    ) -> None:
        """Initialize."""
        self._docker = docker
        self._data_dir = data_dir
        self._extern_data_dir = extern_data_dir
        self._core_url = core_url
        self._poll_seconds = poll_seconds

    # -- helpers ---------------------------------------------------------

    def _mount(self) -> list[DockerMount]:
        return [
            DockerMount(
                type=MountType.BIND,
                source=self._extern_data_dir.as_posix(),
                target=CLIENT_DATA_TARGET,
                read_only=False,
            )
        ]

    def _prepare_data_dir(self) -> None:
        self._data_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(self._data_dir, 0o700)
        # The client runs as an unprivileged user and must be able to write here
        with suppress(OSError, AttributeError):
            os.chown(self._data_dir, CLIENT_USER_ID, CLIENT_USER_ID)

    def _has_cert(self) -> bool:
        try:
            return (self._data_dir / CLIENT_CERT_FILE).stat().st_size > 0
        except OSError:
            return False

    def _credential_ids(self) -> list[str]:
        try:
            names = [entry.name for entry in self._data_dir.iterdir()]
        except OSError:
            return []
        return sorted(n[:-5] for n in names if RE_CREDENTIAL_FILE.match(n))

    async def _ensure_image(self) -> None:
        image = f"{CLIENT_IMAGE}:{CLIENT_TAG}"
        try:
            async with asyncio.timeout(PULL_TIMEOUT_SECONDS):
                try:
                    await self._docker.images.inspect(image)
                except aiodocker.DockerError as err:
                    if err.status != 404:
                        raise
                    await self._docker.images.pull(CLIENT_IMAGE, tag=CLIENT_TAG)
        except (aiodocker.DockerError, DockerError, TimeoutError) as err:
            _LOGGER.warning("Tunnel client image unavailable: %s", type(err).__name__)
            raise CloudHostRunnerError("tunnel client image unavailable") from err

    async def _stop_container(self, name: str) -> None:
        """Stop and remove a managed container, quietly when it does not exist."""
        try:
            await asyncio.wait_for(
                self._docker.stop_container(name, STOP_TIMEOUT_SECONDS),
                timeout=STEP_TIMEOUT_SECONDS,
            )
        except DockerNotFound:
            # A container that does not exist is already stopped
            return
        except (DockerError, TimeoutError) as err:
            _LOGGER.warning("Could not stop %s: %s", name, type(err).__name__)
            raise CloudHostRunnerError("could not stop the tunnel") from err

    async def _one_shot(self, command: list[str], reason: str) -> None:
        """Run one client command to completion and require exit code 0."""
        try:
            async with asyncio.timeout(STEP_TIMEOUT_SECONDS):
                result = await self._docker.run_command(
                    CLIENT_IMAGE,
                    command,
                    tag=CLIENT_TAG,
                    mounts=self._mount(),
                    security_opt=["no-new-privileges"],
                )
        except (DockerError, TimeoutError) as err:
            _LOGGER.warning("Tunnel client step failed: %s", type(err).__name__)
            raise CloudHostRunnerError(reason) from err
        if result.exit_code != 0:
            _LOGGER.warning("Tunnel client step exited with %s", result.exit_code)
            raise CloudHostRunnerError(reason)

    # -- interface -------------------------------------------------------

    async def begin_sign_in(self, hostname: str) -> str:
        """Start the client's sign-in and return only the address it prints."""
        if not RE_HOSTNAME.match(hostname):
            raise CloudHostRunnerError("invalid hostname")
        await self._ensure_image()
        await self._stop_container(LOGIN_DOCKER_NAME)
        await asyncio.to_thread(self._prepare_data_dir)
        try:
            await self._docker.run(
                CLIENT_IMAGE,
                name=LOGIN_DOCKER_NAME,
                tag=CLIENT_TAG,
                command=["tunnel", "login"],
                mounts=self._mount(),
                detach=True,
                security_opt=["no-new-privileges"],
            )
        except (DockerError, TimeoutError) as err:
            _LOGGER.warning("Tunnel sign-in did not start: %s", type(err).__name__)
            raise CloudHostRunnerError("could not start the sign-in") from err

        loop = asyncio.get_running_loop()
        deadline = loop.time() + SIGN_IN_TIMEOUT_SECONDS
        while True:
            try:
                lines = await self._docker.container_logs(LOGIN_DOCKER_NAME, tail=50)
            except (DockerError, TimeoutError):
                lines = []
            if url := parse_sign_in_url(lines):
                return url
            if loop.time() >= deadline:
                break
            await asyncio.sleep(self._poll_seconds)

        with suppress(CloudHostRunnerError):
            await self._stop_container(LOGIN_DOCKER_NAME)
        raise CloudHostRunnerError("no sign-in address from the tunnel client")

    async def sign_in_complete(self) -> bool:
        """Return True once the client has written its credential."""
        if not await asyncio.to_thread(self._has_cert):
            return False
        # Sign-in is done, the waiting login container is no longer needed
        with suppress(CloudHostRunnerError):
            await self._stop_container(LOGIN_DOCKER_NAME)
        return True

    async def start(self, hostname: str) -> None:
        """Create or reuse the named tunnel, route the hostname and run it."""
        if not RE_HOSTNAME.match(hostname):
            raise CloudHostRunnerError("invalid hostname")
        origin = self._core_url()
        if not RE_ORIGIN.match(origin):
            raise CloudHostRunnerError("the Core address is not available")
        if not await asyncio.to_thread(self._has_cert):
            raise CloudHostRunnerError("not signed in to the tunnel provider")

        await self._ensure_image()
        name = tunnel_name(hostname)

        if not await asyncio.to_thread(self._credential_ids):
            await self._one_shot(create_command(name), "could not create the tunnel")
            if not await asyncio.to_thread(self._credential_ids):
                raise CloudHostRunnerError("could not create the tunnel")
        await self._one_shot(
            route_command(name, hostname), "could not route the hostname"
        )

        await self._stop_container(TUNNEL_DOCKER_NAME)
        try:
            await self._docker.run(
                CLIENT_IMAGE,
                name=TUNNEL_DOCKER_NAME,
                tag=CLIENT_TAG,
                command=run_tunnel_command(name, origin),
                mounts=self._mount(),
                detach=True,
                restart_policy={"Name": RestartPolicy.ALWAYS},
                security_opt=["no-new-privileges"],
                ipv4=DOCKER_IPV4_NETWORK_MASK[7],
            )
        except (DockerError, TimeoutError) as err:
            _LOGGER.warning("Tunnel did not start: %s", type(err).__name__)
            raise CloudHostRunnerError("could not start the tunnel") from err
        await asyncio.to_thread(self._write_tunnel_name, name)

    def _write_tunnel_name(self, name: str) -> None:
        (self._data_dir / TUNNEL_NAME_FILE).write_text(name, encoding="ascii")

    def _read_tunnel_name(self) -> str | None:
        try:
            value = (self._data_dir / TUNNEL_NAME_FILE).read_text(encoding="ascii")
        except OSError:
            return None
        return value if RE_TUNNEL_NAME.match(value) else None

    async def stop(self) -> None:
        """Stop serving, keeping the credential."""
        await self._stop_container(TUNNEL_DOCKER_NAME)

    async def _container_state(self, name: str) -> dict | None:
        try:
            return await asyncio.wait_for(
                self._docker.containers.container(name).show(),
                timeout=STEP_TIMEOUT_SECONDS,
            )
        except aiodocker.DockerError as err:
            if err.status == 404:
                return None
            raise CloudHostRunnerError("could not read the tunnel state") from err
        except TimeoutError as err:
            raise CloudHostRunnerError("could not read the tunnel state") from err

    async def is_running(self) -> bool:
        """Return True when the tunnel container is running."""
        meta = await self._container_state(TUNNEL_DOCKER_NAME)
        return bool(meta and meta.get("State", {}).get("Running"))

    async def trusted_proxy(self) -> str | None:
        """Return the address the tunnel container has on the Supervisor network."""
        meta = await self._container_state(TUNNEL_DOCKER_NAME)
        if not meta or not meta.get("State", {}).get("Running"):
            return None
        networks = meta.get("NetworkSettings", {}).get("Networks", {})
        address = networks.get(self._docker.network.name, {}).get("IPAddress")
        return address or None

    async def remove(self) -> str | None:
        """Clean up everything that exists and return a note about what is left.

        Never raises for a cleanup step: the caller must always be able to reach
        the not-set-up state.
        """
        notes: list[str] = []
        for name in (TUNNEL_DOCKER_NAME, LOGIN_DOCKER_NAME):
            try:
                await self._stop_container(name)
            except CloudHostRunnerError:
                notes.append("a container could not be stopped")

        if await asyncio.to_thread(self._has_cert) and await asyncio.to_thread(
            self._credential_ids
        ):
            name = await asyncio.to_thread(self._read_tunnel_name)
            if name:
                try:
                    await self._one_shot(delete_command(name), "tunnel delete failed")
                except CloudHostRunnerError:
                    notes.append("the tunnel was not deleted at the provider")
            else:
                notes.append("the tunnel was not deleted at the provider")
        try:
            await asyncio.to_thread(shutil.rmtree, self._data_dir, True)
        except OSError:
            notes.append("the credential folder could not be deleted")
        if (await asyncio.to_thread(self._data_dir.exists)):
            notes.append("the credential folder could not be deleted")
        return "; ".join(dict.fromkeys(notes)) or None
