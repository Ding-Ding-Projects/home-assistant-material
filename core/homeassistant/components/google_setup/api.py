"""Switch on Google APIs with a service account key, held in memory only."""

import asyncio
import base64
from dataclasses import dataclass
import json
import re
import time
from urllib.parse import quote
from typing import Any

from aiohttp import ClientError, ClientSession, ClientTimeout
from cryptography.exceptions import UnsupportedAlgorithm
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from .const import (
    POLL_ATTEMPTS,
    POLL_DELAY,
    REQUEST_TIMEOUT,
    SCOPE,
    SERVICE_USAGE_URL,
    TOKEN_URL,
)

MAX_KEY_SIZE = 20000
MAX_FIELD_SIZE = 320
MAX_RESPONSE_SIZE = 64 * 1024
PROJECT_ID_RE = re.compile(r"^[a-z][a-z0-9-]{4,28}[a-z0-9]$")


class GoogleSetupError(Exception):
    """Error with a fixed message that never contains key material."""


@dataclass(slots=True)
class ServiceAccount:
    """The parts of a service account key that are needed."""

    project_id: str
    client_email: str
    private_key: rsa.RSAPrivateKey

    def __repr__(self) -> str:
        """Show nothing about the key."""
        return "ServiceAccount()"


def parse_service_account_key(raw: object) -> ServiceAccount:
    """Validate a service account key and load its private key."""
    if isinstance(raw, str):
        if len(raw) > MAX_KEY_SIZE:
            raise GoogleSetupError("The key file is too large")
        try:
            data = json.loads(raw)
        except (ValueError, RecursionError):
            raise GoogleSetupError("The key file is not valid JSON") from None
    else:
        data = raw
    if not isinstance(data, dict) or data.get("type") != "service_account":
        raise GoogleSetupError("The file is not a service account key")
    project_id = data.get("project_id")
    client_email = data.get("client_email")
    pem = data.get("private_key")
    if not all(isinstance(v, str) and v for v in (project_id, client_email, pem)):
        raise GoogleSetupError("The key is missing project_id, client_email or key")
    if len(pem) > MAX_KEY_SIZE:
        raise GoogleSetupError("The key file is too large")
    if len(client_email) > MAX_FIELD_SIZE:
        raise GoogleSetupError("The client email in the key is not valid")
    if not PROJECT_ID_RE.fullmatch(project_id):
        raise GoogleSetupError("The project id in the key is not valid")
    try:
        key = serialization.load_pem_private_key(pem.encode(), password=None)
    except (ValueError, TypeError, UnsupportedAlgorithm):
        raise GoogleSetupError("The private key in the file cannot be read") from None
    if not isinstance(key, rsa.RSAPrivateKey):
        raise GoogleSetupError("The private key is not an RSA key")
    return ServiceAccount(project_id, client_email, key)


def _b64(data: bytes) -> bytes:
    return base64.urlsafe_b64encode(data).rstrip(b"=")


def build_assertion(account: ServiceAccount, now: int | None = None) -> str:
    """Build the signed JWT that is exchanged for an access token."""
    issued = int(time.time()) if now is None else now
    header = {"alg": "RS256", "typ": "JWT"}
    claims = {
        "iss": account.client_email,
        "scope": SCOPE,
        "aud": TOKEN_URL,
        "iat": issued,
        "exp": issued + 3600,
    }
    signing_input = (
        _b64(json.dumps(header, separators=(",", ":")).encode())
        + b"."
        + _b64(json.dumps(claims, separators=(",", ":")).encode())
    )
    signature = account.private_key.sign(
        signing_input, padding.PKCS1v15(), hashes.SHA256()
    )
    return (signing_input + b"." + _b64(signature)).decode()


def _reason(body: Any) -> str:
    """Return Google's error status and reason, nothing else."""
    if not isinstance(body, dict):
        return "unknown"
    error = body.get("error")
    if isinstance(error, str):
        return error[:80]
    if not isinstance(error, dict):
        return "unknown"
    parts: list[str] = []
    if isinstance(status := error.get("status"), str):
        parts.append(status)
    details = error.get("details")
    for detail in details if isinstance(details, list) else []:
        if isinstance(detail, dict) and isinstance(detail.get("reason"), str):
            parts.append(detail["reason"])
            break
    return " / ".join(p[:80] for p in parts) or "unknown"


async def _json(response: Any) -> Any:
    """Read a small JSON body, or None when it is large or not JSON."""
    chunks: list[bytes] = []
    size = 0
    try:
        async for chunk in response.content.iter_chunked(8192):
            size += len(chunk)
            if size > MAX_RESPONSE_SIZE:
                return None
            chunks.append(chunk)
        return json.loads(b"".join(chunks))
    except (ValueError, RecursionError, ClientError):
        return None


def _check_status(response: Any) -> None:
    """Treat a redirect as an error and never follow it."""
    if 300 <= response.status < 400:
        raise GoogleSetupError("Google answered with an unexpected redirect")


def _service_url(project: str, service: str) -> str:
    return (
        f"{SERVICE_USAGE_URL}/projects/{quote(project, safe='')}"
        f"/services/{quote(service, safe='')}"
    )


async def async_get_access_token(
    session: ClientSession, account: ServiceAccount
) -> str:
    """Exchange the signed assertion for an access token."""
    assertion = await asyncio.get_running_loop().run_in_executor(
        None, build_assertion, account
    )
    form = {
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": assertion,
    }
    try:
        async with session.post(
            TOKEN_URL,
            data=form,
            timeout=ClientTimeout(total=REQUEST_TIMEOUT),
            allow_redirects=False,
        ) as response:
            _check_status(response)
            body = await _json(response)
            if response.status != 200 or not isinstance(body, dict):
                raise GoogleSetupError(f"Google refused the key: {_reason(body)}")
    except (ClientError, TimeoutError):
        raise GoogleSetupError("Could not reach oauth2.googleapis.com") from None
    token = body.get("access_token")
    if not isinstance(token, str) or not token:
        raise GoogleSetupError("Google returned no access token")
    return token


async def _service_state(
    session: ClientSession, headers: dict[str, str], project: str, service: str
) -> str:
    """Return ENABLED, DISABLED or raise with the reason."""
    async with session.get(
        _service_url(project, service),
        headers=headers,
        timeout=ClientTimeout(total=REQUEST_TIMEOUT),
        allow_redirects=False,
    ) as response:
        _check_status(response)
        body = await _json(response)
        if response.status != 200 or not isinstance(body, dict):
            raise GoogleSetupError(_reason(body))
    state = body.get("state")
    return state if isinstance(state, str) else "UNKNOWN"


async def _enable_one(
    session: ClientSession, headers: dict[str, str], project: str, service: str
) -> dict[str, str]:
    """Check one API, enable it when needed and report the result."""
    result = {"service": service, "state": "error"}
    try:
        if await _service_state(session, headers, project, service) == "ENABLED":
            result["state"] = "enabled"
            return result
        async with session.post(
            f"{_service_url(project, service)}:enable",
            headers=headers,
            json={},
            timeout=ClientTimeout(total=REQUEST_TIMEOUT),
            allow_redirects=False,
        ) as response:
            _check_status(response)
            body = await _json(response)
            if response.status != 200:
                raise GoogleSetupError(_reason(body))
        for _ in range(POLL_ATTEMPTS):
            await asyncio.sleep(POLL_DELAY)
            if await _service_state(session, headers, project, service) == "ENABLED":
                result["state"] = "enabled"
                return result
        result["reason"] = "still pending, check again shortly"
    except GoogleSetupError as err:
        result["reason"] = str(err)
    except (ClientError, TimeoutError):
        result["reason"] = "could not reach serviceusage.googleapis.com"
    return result


async def async_enable_apis(
    session: ClientSession, account: ServiceAccount, services: dict[str, str]
) -> list[dict[str, str]]:
    """Enable each service and return one result per API identifier."""
    token = await async_get_access_token(session, account)
    headers = {"Authorization": f"Bearer {token}"}
    results = await asyncio.gather(
        *(
            _enable_one(session, headers, account.project_id, service)
            for service in services.values()
        )
    )
    return [{"id": api_id, **result} for api_id, result in zip(services, results)]
