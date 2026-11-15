"""Independent backup hosting through a locally approved native bridge."""

import asyncio
import secrets
import time
from typing import Any
from uuid import uuid4

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util.async_iterator import async_close_iterator

from ..agent import BackupAgent
from ..const import DATA_MANAGER
from ..models import BackupNotFound
from .client import (
    MAX_ARCHIVE_BYTES,
    TARGETS,
    BridgeClient,
    HostingError,
    bounded_archive,
    safe_job,
    validate_endpoint,
)

DATA_HOSTING = "backup.hosting"


class HostingManager:
    """Keep pairing private and journal submission before contacting the host."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.store = Store[dict[str, Any]](hass, 1, "backup.hosting", private=True)
        self.data: dict[str, Any] = {"bridges": {}, "requests": {}}
        self.pending: dict[str, dict[str, Any]] = {}
        self.core_id = ""
        self.lock = asyncio.Lock()
        self.tasks: dict[str, asyncio.Task[None]] = {}

    async def async_setup(self) -> None:
        """Load credentials without exposing them through state or diagnostics."""
        if data := await self.store.async_load():
            self.data = data
        # This identity and its authority are excluded from every backup route.
        # A restored instance therefore cannot inherit the source's host access.
        if not self.data.get("core_instance_id"):
            self.data["core_instance_id"] = uuid4().hex
            await self.store.async_save(self.data)
        self.core_id = self.data["core_instance_id"]
        for entry in self.data["requests"].values():
            if entry["state"] == "running":
                entry.update(state="reconciliation_needed", phase="reconciliation")

    def client(self, bridge_id: str) -> BridgeClient:
        """Select a paired host, never an address supplied in a job."""
        if not (bridge := self.data["bridges"].get(bridge_id)):
            raise HostingError("pairing_needed")
        return BridgeClient(bridge, self.core_id)

    async def async_status(self) -> dict[str, Any]:
        """Return approved bridges and authenticated runtime capabilities."""
        bridges = []
        for bridge_id, bridge in self.data["bridges"].items():
            item: dict[str, Any] = {"id": bridge_id, "url": bridge["url"], "paired": True}
            try:
                response = await self.client(bridge_id).request("GET", "/v1/status")
                capabilities = response.get("capabilities", {})
                if not isinstance(capabilities, dict) or not isinstance(capabilities.get("targets"), list):
                    raise HostingError("invalid_bridge_response")
                item["capabilities"] = {
                    "targets": [target for target in capabilities.get("targets", []) if target in TARGETS],
                    "automation_state": "original",
                }
                if isinstance(target_status := capabilities.get("target_status"), dict):
                    item["capabilities"]["target_status"] = {
                        target: {"available": value.get("available") is True,
                                 **({"reason": "setup_required"} if value.get("available") is not True else {})}
                        for target, value in target_status.items()
                        if target in TARGETS and isinstance(value, dict)
                    }
            except HostingError as err:
                item["error_code"] = err.code
            bridges.append(item)
        return {"bridges": bridges}

    async def async_pair(self, msg: dict[str, Any]) -> dict[str, Any]:
        """Start pairing or consume an approved credential exactly once."""
        async with self.lock:
            return await self._async_pair(msg)

    async def _async_pair(self, msg: dict[str, Any]) -> dict[str, Any]:
        """Serialize the transient native approval transaction."""
        now = time.monotonic()
        self.pending = {key: value for key, value in self.pending.items() if value["deadline"] > now}
        if bridge_id := msg.get("bridge_id"):
            if not (pending := self.pending.get(bridge_id)):
                raise HostingError("pairing_expired")
            response = await BridgeClient(pending, self.core_id).request(
                "GET", f"/v1/pair/{pending['pairing_id']}",
                headers={"X-Pairing-Challenge": pending["challenge"]},
            )
            if response.get("state") != "paired":
                return {"bridge_id": bridge_id, "state": "pending_native_approval", "pairing_id": pending["pairing_id"]}
            if response.get("client_id") != pending["client_id"] or not isinstance(response.get("credential"), str):
                raise HostingError("invalid_bridge_response")
            self.data["bridges"][bridge_id] = {
                key: pending[key] for key in ("url", "fingerprint", "client_id")
            } | {"credential": response["credential"]}
            await self.store.async_save(self.data)
            del self.pending[bridge_id]
            return {"bridge_id": bridge_id, "state": "paired"}
        if not all(msg.get(key) for key in ("url", "fingerprint")):
            raise HostingError("pairing_details_required")
        url, fingerprint = validate_endpoint(msg["url"], msg["fingerprint"])
        if len(self.pending) >= 4 or len(self.data["bridges"]) >= 8:
            raise HostingError("pairing_limit_reached")
        bridge_id = uuid4().hex
        pending: dict[str, Any] = {
            "url": url, "fingerprint": fingerprint, "client_id": uuid4().hex,
            "challenge": secrets.token_urlsafe(32), "deadline": now + 600,
        }
        response = await BridgeClient(pending, self.core_id).request(
            "POST", "/v1/pair", body={
                "core_instance_id": self.core_id, "client_id": pending["client_id"],
                "challenge": pending["challenge"],
            },
        )
        pairing_id = response.get("pairing_id")
        if not isinstance(pairing_id, str) or not pairing_id.isascii() or not pairing_id.replace("-", "").isalnum() or len(pairing_id) > 128:
            raise HostingError("invalid_bridge_response")
        pending["pairing_id"] = pairing_id
        self.pending[bridge_id] = pending
        return {"bridge_id": bridge_id, "state": "pending_native_approval", "pairing_id": pairing_id}

    async def async_jobs(self, bridge_id: str) -> dict[str, Any]:
        """Reconcile uncertain submissions by request id without replaying work."""
        result = await self.client(bridge_id).request("GET", "/v1/jobs")
        if not isinstance(jobs := result.get("jobs"), list) or len(jobs) > 1000:
            raise HostingError("invalid_bridge_response")
        public_jobs = [safe_job(job) for job in jobs if isinstance(job, dict)]
        seen = set()
        for job in public_jobs:
            request_id = job.get("request_id")
            seen.add(request_id)
            if entry := self.data["requests"].get(request_id):
                if entry["identity"]["bridge_id"] == bridge_id:
                    job.update({key: entry["identity"][key] for key in ("backup_id", "agent_id")})
        public_jobs.extend(
            self.local_job(request_id, entry)
            for request_id, entry in self.data["requests"].items()
            if entry["identity"]["bridge_id"] == bridge_id and request_id not in seen
        )
        return {"jobs": public_jobs}

    def local_job(self, request_id: str, entry: dict[str, Any]) -> dict[str, Any]:
        """Represent an upload or uncertain submission without secret state."""
        return {
            "id": request_id, "request_id": request_id,
            "state": entry["state"], "phase": entry.get("phase", "reconciliation"),
            **{key: entry["identity"][key] for key in ("backup_id", "agent_id", "target")},
            **({"error_code": entry["error_code"]} if "error_code" in entry else {}),
        }

    async def async_start(self, msg: dict[str, Any]) -> dict[str, Any]:
        """Stream the selected archive and submit an independent restore job."""
        async with self.lock:
            request_id = msg["request_id"]
            bridge_id = msg["bridge_id"]
            identity = {key: msg[key] for key in ("bridge_id", "backup_id", "agent_id", "target")}
            if previous := self.data["requests"].get(request_id):
                if previous["identity"] != identity:
                    raise HostingError("request_id_conflict")
                jobs = await self.async_jobs(bridge_id)
                job = next((job for job in jobs["jobs"] if job.get("request_id") == request_id), {"request_id": request_id, "state": "reconciliation_needed", "error_code": "submission_outcome_unknown"})
                if (
                    job.get("error_code") == "incorrect_password"
                    and msg.get("password")
                    and previous.get("upload_handle")
                ):
                    return safe_job(await self.client(bridge_id).request("POST", "/v1/jobs", body={
                        "request_id": request_id, "upload_handle": previous["upload_handle"],
                        "target": msg["target"], "options": {"automation_state": "original"},
                        "password": msg["password"],
                    }))
                return job
            if len(self.data["requests"]) >= 1000:
                raise HostingError("request_journal_full")
            if len(self.tasks) >= 2:
                raise HostingError("hosting_busy")
            client = self.client(bridge_id)
            status = await client.request("GET", "/v1/status")
            capabilities = status.get("capabilities")
            if not isinstance(capabilities, dict) or msg["target"] not in capabilities.get("targets", []):
                raise HostingError("capability_missing")
            target_statuses = capabilities.get("target_status")
            if not isinstance(target_statuses, dict):
                raise HostingError("capability_missing")
            target_status = target_statuses.get(msg["target"])
            if not isinstance(target_status, dict) or target_status.get("available") is not True:
                raise HostingError("hardware_unavailable")
            manager = self.hass.data[DATA_MANAGER]
            if not (agent := manager.backup_agents.get(msg["agent_id"])):
                raise HostingError("backup_agent_unavailable")
            try:
                backup = await agent.async_get_backup(msg["backup_id"])
            except BackupNotFound as err:
                raise HostingError("backup_not_found") from err
            except Exception as err:  # noqa: BLE001
                raise HostingError("backup_agent_unavailable") from err
            if not backup:
                raise HostingError("backup_not_found")
            if backup.protected and not msg.get("password"):
                raise HostingError("key_needed")
            if not 0 < backup.size <= MAX_ARCHIVE_BYTES:
                raise HostingError("archive_too_large")
            # Only fixed safe options reach the native host. In particular no
            # filesystem paths, shell commands or disabled-automation option.
            options: dict[str, Any] = {"automation_state": "original"}
            if name := msg.get("options", {}).get("name"):
                options["name"] = name
            entry: dict[str, Any] = {"identity": identity, "state": "running", "phase": "upload"}
            self.data["requests"][request_id] = entry
            await self.store.async_save(self.data)
            self.tasks[request_id] = self.hass.async_create_background_task(
                self._async_transfer(msg, agent, backup.size, client, options),
                f"backup hosting {request_id}",
                eager_start=False,
            )
            return self.local_job(request_id, entry)

    async def _async_transfer(self, msg: dict[str, Any], agent: BackupAgent, size: int, client: BridgeClient, options: dict[str, Any]) -> None:
        """Transfer outside the websocket lifetime and never replay a POST."""
        request_id = msg["request_id"]
        entry = self.data["requests"][request_id]
        try:
            stream = await agent.async_download_backup(msg["backup_id"])
            try:
                upload = await client.request(
                    "POST", "/v1/uploads", stream=bounded_archive(stream, size),
                    headers={"Content-Type": "application/x-tar", "Content-Length": str(size), "X-Upload-Name": "backup.tar"},
                )
            finally:
                await async_close_iterator(stream)
            if not isinstance(handle := upload.get("upload_handle"), str) or len(handle) > 256:
                raise HostingError("invalid_bridge_response")
            entry["upload_handle"] = handle
            body = {"request_id": request_id, "upload_handle": handle, "target": msg["target"], "options": options}
            if password := msg.get("password"):
                body["password"] = password
            entry.update(state="reconciliation_needed", phase="submission")
            await self.store.async_save(self.data)
            result = safe_job(await client.request("POST", "/v1/jobs", body=body))
            if not result.get("id") or result.get("request_id") != request_id:
                raise HostingError("invalid_bridge_response")
            entry.update(state="submitted", phase="native_job")
        except asyncio.CancelledError:
            if entry["phase"] == "submission":
                entry.update(state="reconciliation_needed", error_code="submission_outcome_unknown")
            else:
                entry.update(state="cancelled", phase="upload")
            raise
        except BackupNotFound:
            entry.update(state="failed", error_code="backup_not_found")
        except HostingError as err:
            if entry["phase"] != "submission":
                entry["state"] = "failed"
            entry["error_code"] = err.code
        except Exception:  # noqa: BLE001
            # Backup agents may embed sensitive remote data in their exceptions.
            entry.update(state="failed", error_code="backup_transfer_failed")
        finally:
            self.tasks.pop(request_id, None)
            await self.store.async_save(self.data)

    async def async_cancel(self, bridge_id: str, job_id: str) -> dict[str, Any]:
        """Cancel only a job bound to this approved Core client."""
        if (entry := self.data["requests"].get(job_id)) and entry["identity"]["bridge_id"] == bridge_id:
            if task := self.tasks.get(job_id):
                if entry["phase"] != "upload":
                    raise HostingError("reconciliation_needed")
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
                return self.local_job(job_id, entry)
        return safe_job(await self.client(bridge_id).request("POST", f"/v1/jobs/{job_id}/cancel"))


async def async_setup(hass: HomeAssistant) -> None:
    """Initialize the optional host bridge commands."""
    manager = HostingManager(hass)
    await manager.async_setup()
    hass.data[DATA_HOSTING] = manager
    from .websocket import async_register_commands  # noqa: PLC0415

    async_register_commands(hass)
