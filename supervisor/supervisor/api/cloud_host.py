"""Init file for Supervisor cloud host RESTful API."""

from typing import Any

import aiohttp
from aiohttp import web
import voluptuous as vol

from ..cloud_host import CloudHostManager, NotInstalledTunnelRunner, TunnelRunner
from ..cloud_host.const import ATTR_SIGN_IN_URL, CHECK_TIMEOUT_SECONDS, STATE_FILE
from ..const import ATTR_HOSTNAME
from ..coresys import CoreSysAttributes
from .utils import api_process, api_validate

SCHEMA_SETUP = vol.Schema({vol.Required(ATTR_HOSTNAME): vol.All(str, vol.Length(max=300))})


def build_runner() -> TunnelRunner:
    """Return the tunnel runner. The real one is not wired up yet."""
    return NotInstalledTunnelRunner()


class APICloudHost(CoreSysAttributes):
    """Handle RESTful API for the cloud host."""

    _manager: CloudHostManager | None = None

    @property
    def manager(self) -> CloudHostManager:
        """Return the cloud host manager, created on first use."""
        if self._manager is None:
            self._manager = CloudHostManager(
                self.sys_config.path_supervisor / STATE_FILE,
                build_runner(),
                self._fetch_status,
            )
        return self._manager

    async def _fetch_status(self, url: str) -> int:
        """Make one HTTPS GET and return only the status code."""
        timeout = aiohttp.ClientTimeout(total=CHECK_TIMEOUT_SECONDS)
        async with self.sys_websession.get(
            url, timeout=timeout, allow_redirects=False
        ) as response:
            return response.status

    @api_process
    async def info(self, request: web.Request) -> dict[str, Any]:
        """Return the cloud host state."""
        return await self.manager.info()

    @api_process
    async def sign_in(self, request: web.Request) -> dict[str, Any]:
        """Return the pending sign-in URL."""
        return {ATTR_SIGN_IN_URL: await self.manager.sign_in_url()}

    @api_process
    async def setup(self, request: web.Request) -> dict[str, Any]:
        """Start setting up the cloud host."""
        body = await api_validate(SCHEMA_SETUP, request)
        return await self.manager.setup(body[ATTR_HOSTNAME])

    @api_process
    async def pause(self, request: web.Request) -> dict[str, Any]:
        """Stop serving, keeping the sign-in."""
        return await self.manager.pause()

    @api_process
    async def resume(self, request: web.Request) -> dict[str, Any]:
        """Serve again."""
        return await self.manager.resume()

    @api_process
    async def remove(self, request: web.Request) -> dict[str, Any]:
        """Remove the cloud host."""
        return await self.manager.remove()

    @api_process
    async def check(self, request: web.Request) -> dict[str, Any]:
        """Check once from here that the hostname answers."""
        return await self.manager.check()
