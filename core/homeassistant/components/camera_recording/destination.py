"""Where recordings are kept: a folder or disk here, a Windows share, or an SSH server."""

from abc import ABC, abstractmethod
import asyncio
from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass, field
import os
from pathlib import Path, PurePosixPath, PureWindowsPath
import shlex
import shutil
import tempfile
from typing import Any, override

from homeassistant.const import CONF_HOST, CONF_PASSWORD, CONF_PORT, CONF_USERNAME
from homeassistant.core import HomeAssistant

from .const import (
    CONF_DESTINATION,
    CONF_DOMAIN,
    CONF_PATH,
    CONF_PRIVATE_KEY_FILE,
    CONF_SHARE,
    DEST_LOCAL,
    DEST_SCP,
    DEST_SFTP,
    DEST_SMB,
    DEST_USB,
    SMB_PORT,
    SSH_PORT,
    TEST_FILE_NAME,
)

CONNECT_TIMEOUT = 15
TEST_PAYLOAD = b"Home Assistant camera recording test\n"


class DestinationError(Exception):
    """A destination could not be used. The message is safe to show."""


@dataclass(slots=True)
class TestStep:
    """One checked step of a connection test."""

    key: str
    ok: bool
    detail: str = ""


@dataclass(slots=True)
class TestResult:
    """Every step of a connection test, in order. Stops at the first failure."""

    steps: list[TestStep] = field(default_factory=list)
    free_bytes: int | None = None

    @property
    def ok(self) -> bool:
        """Whether every step passed."""
        return bool(self.steps) and all(step.ok for step in self.steps)

    @property
    def failed(self) -> TestStep | None:
        """The step that failed, if any."""
        return next((step for step in self.steps if not step.ok), None)


class Session(ABC):
    """An open connection to a destination, used for one batch of work."""

    @abstractmethod
    async def upload(self, local: Path, remote: str) -> None:
        """Copy a local file to the relative remote path, creating folders."""

    @abstractmethod
    async def download(self, remote: str, local: Path) -> None:
        """Copy the relative remote path to a local file."""

    @abstractmethod
    async def delete(self, remote: str) -> None:
        """Delete the relative remote path. A missing file is not an error."""

    @abstractmethod
    async def free_space(self) -> int | None:
        """Free bytes at the destination, when the destination can tell."""


class Destination(ABC):
    """A place recordings are copied to."""

    kind: str
    #: A local destination is written in place: segments are never copied.
    is_local = False

    def __init__(self, hass: HomeAssistant, data: Mapping[str, Any]) -> None:
        """Keep the settings."""
        self.hass = hass
        self.data = data

    @property
    @abstractmethod
    def label(self) -> str:
        """A short readable name, for example nas.local > Cameras."""

    @abstractmethod
    def session(self) -> Any:
        """Return an async context manager that yields a Session."""

    async def async_test(self) -> TestResult:
        """Reach, sign in, open the folder, write, read back and delete a file."""
        result = TestResult()
        if not await self._test_reach(result):
            return result
        try:
            async with self.session() as session:
                if not self.is_local:
                    result.steps.append(TestStep("sign_in", True))
                result.steps.append(TestStep("open_folder", True))
                if not await self._test_write(session, result):
                    return result
                result.free_bytes = await session.free_space()
        except FolderError as err:
            if not self.is_local and (
                not result.steps or result.steps[-1].key != "sign_in"
            ):
                result.steps.append(TestStep("sign_in", True))
            result.steps.append(TestStep("open_folder", False, str(err)))
            return result
        except DestinationError as err:
            result.steps.append(TestStep("sign_in", False, str(err)))
            return result
        result.steps.append(
            TestStep("free_space", True, _human_bytes(result.free_bytes))
        )
        return result

    async def _test_reach(self, result: TestResult) -> bool:
        """Check the server answers on its port."""
        host, port = self._address()
        if host is None:
            return True
        try:
            _reader, writer = await asyncio.wait_for(
                asyncio.open_connection(host, port), CONNECT_TIMEOUT
            )
        except (OSError, TimeoutError) as err:
            result.steps.append(
                TestStep(
                    "reach",
                    False,
                    f"{host}:{port} did not answer ({err or 'timed out'})",
                )
            )
            return False
        writer.close()
        with suppress(OSError):
            await writer.wait_closed()
        result.steps.append(TestStep("reach", True, f"{host}:{port}"))
        return True

    def _address(self) -> tuple[str | None, int]:
        return None, 0

    async def _test_write(self, session: Session, result: TestResult) -> bool:
        """Write a small file, read it back, compare and delete it."""

        def _write_local() -> Path:
            handle, name = tempfile.mkstemp(prefix="ha-rec-")
            with os.fdopen(handle, "wb") as file:
                file.write(TEST_PAYLOAD)
            return Path(name)

        source = await self.hass.async_add_executor_job(_write_local)
        back = source.with_suffix(".back")
        try:
            await session.upload(source, TEST_FILE_NAME)
            await session.download(TEST_FILE_NAME, back)
            same = await self.hass.async_add_executor_job(
                lambda: back.read_bytes() == TEST_PAYLOAD
            )
            await session.delete(TEST_FILE_NAME)
        except DestinationError as err:
            result.steps.append(TestStep("write_test", False, str(err)))
            return False
        finally:
            await self.hass.async_add_executor_job(_unlink, source, back)
        if not same:
            result.steps.append(
                TestStep(
                    "write_test", False, "The file read back was not the file written"
                )
            )
            return False
        result.steps.append(TestStep("write_test", True))
        return True


class FolderError(DestinationError):
    """Signed in, but the folder could not be opened or written."""


def _unlink(*paths: Path) -> None:
    for path in paths:
        path.unlink(missing_ok=True)


def _human_bytes(value: int | None) -> str:
    if value is None:
        return ""
    size = float(value)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size < 1000 or unit == "TB":
            return f"{size:.0f} {unit}" if unit in ("B", "KB") else f"{size:.1f} {unit}"
        size /= 1000
    return f"{size:.1f} PB"


class _LocalSession(Session):
    def __init__(self, hass: HomeAssistant, root: Path) -> None:
        self.hass = hass
        self.root = root

    def _path(self, remote: str) -> Path:
        path = (self.root / remote).resolve()
        if path != self.root and self.root not in path.parents:
            raise FolderError("The path leaves the recording folder")
        return path

    @override
    async def upload(self, local: Path, remote: str) -> None:
        target = self._path(remote)

        def _copy() -> None:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(local, target)

        try:
            await self.hass.async_add_executor_job(_copy)
        except OSError as err:
            raise FolderError(
                f"Could not write {target}: {err.strerror or err}"
            ) from err

    @override
    async def download(self, remote: str, local: Path) -> None:
        try:
            await self.hass.async_add_executor_job(
                shutil.copyfile, self._path(remote), local
            )
        except OSError as err:
            raise FolderError(
                f"Could not read {remote}: {err.strerror or err}"
            ) from err

    @override
    async def delete(self, remote: str) -> None:
        try:
            await self.hass.async_add_executor_job(
                lambda: self._path(remote).unlink(missing_ok=True)
            )
        except OSError as err:
            raise FolderError(
                f"Could not delete {remote}: {err.strerror or err}"
            ) from err

    @override
    async def free_space(self) -> int | None:
        try:
            usage = await self.hass.async_add_executor_job(shutil.disk_usage, self.root)
        except OSError:
            return None
        return usage.free


class LocalDestination(Destination):
    """A folder on this computer, or on a disk attached to it. Segments are written in place."""

    kind = DEST_LOCAL
    is_local = True

    @property
    def root(self) -> Path:
        """The recording folder."""
        return Path(self.data[CONF_PATH])

    @property
    @override
    def label(self) -> str:
        """The folder path."""
        return str(self.root)

    @asynccontextmanager
    @override
    async def session(self) -> AsyncIterator[Session]:
        """Open the folder, creating it when needed."""
        root = self.root
        if not root.is_absolute():
            raise FolderError("Use a full path, starting with /")

        def _open() -> Path:
            root.mkdir(parents=True, exist_ok=True)
            if not os.access(root, os.W_OK):
                raise PermissionError(13, "Permission denied")
            return root.resolve()

        try:
            resolved = await self.hass.async_add_executor_job(_open)
        except OSError as err:
            raise FolderError(f"Could not open {root}: {err.strerror or err}") from err
        yield _LocalSession(self.hass, resolved)


class UsbDestination(LocalDestination):
    """An external or USB disk, chosen from the mounted disks."""

    kind = DEST_USB


def candidate_disks() -> dict[str, str]:
    """Mounted disks and folders that suit recordings: path to a readable label.

    Runs in the executor.
    """
    found: dict[str, str] = {}
    for base in ("/media", "/mnt", "/share", "/run/media"):
        root = Path(base)
        if not root.is_dir():
            continue
        for entry in [root, *sorted(p for p in root.iterdir() if p.is_dir())]:
            try:
                usage = shutil.disk_usage(entry)
            except OSError:
                continue
            if not os.access(entry, os.W_OK):
                continue
            found[str(entry)] = (
                f"{entry} · {_human_bytes(usage.free)} free of {_human_bytes(usage.total)}"
            )
    return found


class _SmbSession(Session):
    def __init__(
        self, hass: HomeAssistant, base: str, session_kwargs: dict[str, Any]
    ) -> None:
        self.hass = hass
        self.base = base
        self.kwargs = session_kwargs

    def _path(self, remote: str) -> str:
        parts = PurePosixPath(remote).parts
        if ".." in parts:
            raise FolderError("The path leaves the recording folder")
        return str(PureWindowsPath(self.base, *parts))

    async def _run(self, func: Any, *args: Any) -> Any:
        from smbprotocol.exceptions import SMBException  # noqa: PLC0415

        try:
            return await self.hass.async_add_executor_job(func, *args)
        except (SMBException, OSError, ValueError) as err:
            raise FolderError(str(err).splitlines()[0][:300]) from err

    @override
    async def upload(self, local: Path, remote: str) -> None:
        import smbclient  # noqa: PLC0415

        target = self._path(remote)

        def _copy() -> None:
            smbclient.makedirs(
                str(PureWindowsPath(target).parent), exist_ok=True, **self.kwargs
            )
            with (
                open(local, "rb") as source,
                smbclient.open_file(target, mode="wb", **self.kwargs) as dest,
            ):
                shutil.copyfileobj(source, dest, 1024 * 1024)

        await self._run(_copy)

    @override
    async def download(self, remote: str, local: Path) -> None:
        import smbclient  # noqa: PLC0415

        source_path = self._path(remote)

        def _copy() -> None:
            with (
                smbclient.open_file(source_path, mode="rb", **self.kwargs) as source,
                open(local, "wb") as dest,
            ):
                shutil.copyfileobj(source, dest, 1024 * 1024)

        await self._run(_copy)

    @override
    async def delete(self, remote: str) -> None:
        import smbclient  # noqa: PLC0415

        target = self._path(remote)

        def _remove() -> None:
            with suppress(FileNotFoundError):
                smbclient.remove(target, **self.kwargs)

        await self._run(_remove)

    @override
    async def free_space(self) -> int | None:
        import smbclient  # noqa: PLC0415

        try:
            result = await self._run(
                lambda: smbclient.stat_volume(self.base, **self.kwargs)
            )
        except FolderError:
            return None
        return int(result.caller_available_size)


class SmbDestination(Destination):
    """A Windows shared folder, on a PC or a NAS."""

    kind = DEST_SMB

    @property
    @override
    def label(self) -> str:
        """Server, share and folder."""
        parts = [self.data[CONF_HOST], self.data[CONF_SHARE]]
        if folder := self.data.get(CONF_PATH, "").strip("/\\"):
            parts.append(folder)
        return " › ".join(parts)

    @override
    def _address(self) -> tuple[str | None, int]:
        return self.data[CONF_HOST], int(self.data.get(CONF_PORT) or SMB_PORT)

    @asynccontextmanager
    @override
    async def session(self) -> AsyncIterator[Session]:
        """Sign in and open the share folder."""
        import smbclient  # noqa: PLC0415
        from smbprotocol.exceptions import SMBAuthenticationError, SMBException  # noqa: PLC0415

        host = self.data[CONF_HOST]
        user = self.data.get(CONF_USERNAME) or None
        if user and (domain := self.data.get(CONF_DOMAIN)):
            user = f"{domain}\\{user}"
        kwargs: dict[str, Any] = {
            "username": user,
            "password": self.data.get(CONF_PASSWORD) or None,
            "port": int(self.data.get(CONF_PORT) or SMB_PORT),
            "connection_timeout": CONNECT_TIMEOUT,
        }
        folder = [
            p
            for p in str(self.data.get(CONF_PATH, "")).replace("\\", "/").split("/")
            if p
        ]
        if ".." in folder:
            raise FolderError("The folder cannot contain ..")
        base = str(PureWindowsPath(f"\\\\{host}\\{self.data[CONF_SHARE]}", *folder))

        def _open() -> None:
            smbclient.register_session(host, **kwargs)

        def _folder() -> None:
            smbclient.makedirs(base, exist_ok=True, **kwargs)

        try:
            await self.hass.async_add_executor_job(_open)
        except SMBAuthenticationError as err:
            raise DestinationError(
                "The user name or password was not accepted"
            ) from err
        except (SMBException, OSError, ValueError) as err:
            raise DestinationError(str(err).splitlines()[0][:300]) from err
        try:
            await self.hass.async_add_executor_job(_folder)
        except (SMBException, OSError, ValueError) as err:
            raise FolderError(
                f"Could not open {base}: {str(err).splitlines()[0][:300]}"
            ) from err
        yield _SmbSession(self.hass, base, kwargs)


def _ssh_options(data: Mapping[str, Any]) -> Any:
    """Connection options. Runs in the executor because keys are read from disk."""
    from asyncssh import SSHClientConnectionOptions  # noqa: PLC0415

    key = data.get(CONF_PRIVATE_KEY_FILE)
    return SSHClientConnectionOptions(
        known_hosts=None,
        username=data[CONF_USERNAME],
        password=data.get(CONF_PASSWORD) or None,
        client_keys=[key] if key else None,
        connect_timeout=CONNECT_TIMEOUT,
    )


def _remote_join(base: str, remote: str) -> str:
    parts = PurePosixPath(remote).parts
    if ".." in parts or PurePosixPath(remote).is_absolute():
        raise FolderError("The path leaves the recording folder")
    return str(PurePosixPath(base, *parts))


class _SftpSession(Session):
    def __init__(self, sftp: Any, base: str) -> None:
        self.sftp = sftp
        self.base = base

    @override
    async def upload(self, local: Path, remote: str) -> None:
        from asyncssh import SFTPError  # noqa: PLC0415

        target = _remote_join(self.base, remote)
        try:
            await self.sftp.makedirs(str(PurePosixPath(target).parent), exist_ok=True)
            await self.sftp.put(str(local), target)
        except (SFTPError, OSError) as err:
            raise FolderError(f"Could not write {target}: {err}") from err

    @override
    async def download(self, remote: str, local: Path) -> None:
        from asyncssh import SFTPError  # noqa: PLC0415

        try:
            await self.sftp.get(_remote_join(self.base, remote), str(local))
        except (SFTPError, OSError) as err:
            raise FolderError(f"Could not read {remote}: {err}") from err

    @override
    async def delete(self, remote: str) -> None:
        from asyncssh import SFTPError, SFTPNoSuchFile  # noqa: PLC0415

        try:
            await self.sftp.remove(_remote_join(self.base, remote))
        except SFTPNoSuchFile:
            return
        except (SFTPError, OSError) as err:
            raise FolderError(f"Could not delete {remote}: {err}") from err

    @override
    async def free_space(self) -> int | None:
        from asyncssh import SFTPError  # noqa: PLC0415

        try:
            info = await self.sftp.statvfs(self.base)
        except SFTPError, OSError:
            return None
        return int(info.bavail * info.frsize)


class _ScpSession(Session):
    def __init__(self, conn: Any, base: str) -> None:
        self.conn = conn
        self.base = base

    async def _run(self, command: str) -> str:
        result = await self.conn.run(command, check=False)
        if result.exit_status != 0:
            raise FolderError(
                str(result.stderr or result.stdout).strip()[:300] or command
            )
        return str(result.stdout)

    @override
    async def upload(self, local: Path, remote: str) -> None:
        from asyncssh import Error as SSHError, scp  # noqa: PLC0415

        target = _remote_join(self.base, remote)
        await self._run(f"mkdir -p -- {shlex.quote(str(PurePosixPath(target).parent))}")
        try:
            await scp(str(local), (self.conn, target))
        except (SSHError, OSError) as err:
            raise FolderError(f"Could not copy to {target}: {err}") from err

    @override
    async def download(self, remote: str, local: Path) -> None:
        from asyncssh import Error as SSHError, scp  # noqa: PLC0415

        try:
            await scp((self.conn, _remote_join(self.base, remote)), str(local))
        except (SSHError, OSError) as err:
            raise FolderError(f"Could not copy {remote}: {err}") from err

    @override
    async def delete(self, remote: str) -> None:
        await self._run(f"rm -f -- {shlex.quote(_remote_join(self.base, remote))}")

    @override
    async def free_space(self) -> int | None:
        try:
            out = await self._run(f"df -Pk -- {shlex.quote(self.base)}")
        except FolderError:
            return None
        lines = out.strip().splitlines()
        try:
            return int(lines[-1].split()[3]) * 1024
        except IndexError, ValueError:
            return None


class _SshDestination(Destination):
    @property
    @override
    def label(self) -> str:
        """user@host:folder."""
        return (
            f"{self.data[CONF_USERNAME]}@{self.data[CONF_HOST]}:{self.data[CONF_PATH]}"
        )

    @override
    def _address(self) -> tuple[str | None, int]:
        return self.data[CONF_HOST], int(self.data.get(CONF_PORT) or SSH_PORT)

    async def _connect(self) -> Any:
        from asyncssh import Error as SSHError, PermissionDenied, connect  # noqa: PLC0415

        if not str(self.data[CONF_PATH]).startswith("/"):
            raise FolderError("Use a full path on the server, starting with /")
        options = await self.hass.async_add_executor_job(_ssh_options, self.data)
        try:
            return await connect(
                self.data[CONF_HOST],
                port=int(self.data.get(CONF_PORT) or SSH_PORT),
                options=options,
            )
        except PermissionDenied as err:
            raise DestinationError(
                "The user name, password or key was not accepted"
            ) from err
        except (SSHError, OSError, TimeoutError) as err:
            raise DestinationError(f"Could not sign in: {err}") from err


class SftpDestination(_SshDestination):
    """An SSH server, copied to with SFTP."""

    kind = DEST_SFTP

    @asynccontextmanager
    @override
    async def session(self) -> AsyncIterator[Session]:
        """Sign in and open the folder over SFTP."""
        from asyncssh import Error as SSHError, SFTPError  # noqa: PLC0415

        conn = await self._connect()
        try:
            base = str(self.data[CONF_PATH])
            try:
                sftp = await conn.start_sftp_client()
                await sftp.makedirs(base, exist_ok=True)
            except (SFTPError, SSHError, OSError) as err:
                raise FolderError(f"Could not open {base}: {err}") from err
            async with sftp:
                yield _SftpSession(sftp, base)
        finally:
            conn.close()


class ScpDestination(_SshDestination):
    """An SSH server that allows SCP but not SFTP."""

    kind = DEST_SCP

    @asynccontextmanager
    @override
    async def session(self) -> AsyncIterator[Session]:
        """Sign in and make sure the folder exists."""
        conn = await self._connect()
        try:
            session = _ScpSession(conn, str(self.data[CONF_PATH]))
            await session._run(f"mkdir -p -- {shlex.quote(session.base)}")  # noqa: SLF001
            yield session
        finally:
            conn.close()


_KINDS: dict[str, type[Destination]] = {
    DEST_LOCAL: LocalDestination,
    DEST_USB: UsbDestination,
    DEST_SMB: SmbDestination,
    DEST_SFTP: SftpDestination,
    DEST_SCP: ScpDestination,
}


def create_destination(hass: HomeAssistant, data: Mapping[str, Any]) -> Destination:
    """Build the destination a config entry describes."""
    return _KINDS[data[CONF_DESTINATION]](hass, data)
