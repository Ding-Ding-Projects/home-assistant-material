"""Tests for Google setup."""

import base64
import json
import logging
from typing import Any
from unittest.mock import patch

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
import pytest

from homeassistant.components.google_setup.api import (
    GoogleSetupError,
    build_assertion,
    parse_service_account_key,
)
from homeassistant.components.google_setup.const import (
    GOOGLE_APIS,
    SERVICE_USAGE_URL,
    TOKEN_URL,
)
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

from pytest_homeassistant.test_util.aiohttp import AiohttpClientMocker

from tests.typing import WebSocketGenerator

PROJECT = "demo-project"
SECRET_MARKER = "SECRET-MARKER-VALUE"


@pytest.fixture(scope="module")
def private_key() -> rsa.RSAPrivateKey:
    """Return a throwaway RSA key."""
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture
def key_json(private_key: rsa.RSAPrivateKey) -> str:
    """Return a service account key file."""
    pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    return json.dumps(
        {
            "type": "service_account",
            "project_id": PROJECT,
            "private_key_id": SECRET_MARKER,
            "private_key": pem,
            "client_email": "robot@demo-project.iam.gserviceaccount.com",
            "token_uri": "https://evil.example/token",
        }
    )


def _b64decode(part: str) -> bytes:
    return base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))


def test_assertion_is_signed_for_the_fixed_token_url(
    key_json: str, private_key: rsa.RSAPrivateKey
) -> None:
    """The JWT carries the right claims and verifies with the public key."""
    account = parse_service_account_key(key_json)
    jwt = build_assertion(account, now=1000)
    header, claims, signature = jwt.split(".")
    assert json.loads(_b64decode(header)) == {"alg": "RS256", "typ": "JWT"}
    decoded = json.loads(_b64decode(claims))
    assert decoded == {
        "iss": "robot@demo-project.iam.gserviceaccount.com",
        "scope": "https://www.googleapis.com/auth/service.management",
        "aud": TOKEN_URL,
        "iat": 1000,
        "exp": 4600,
    }
    private_key.public_key().verify(
        _b64decode(signature),
        f"{header}.{claims}".encode(),
        padding.PKCS1v15(),
        hashes.SHA256(),
    )


@pytest.mark.parametrize(
    "raw",
    [
        "not json",
        "[]",
        json.dumps({"type": "authorized_user"}),
        json.dumps({"type": "service_account", "project_id": "p"}),
        json.dumps(
            {
                "type": "service_account",
                "project_id": "p",
                "client_email": "a@b",
                "private_key": "not a pem",
            }
        ),
        "x" * 30000,
    ],
)
def test_bad_keys_are_refused(raw: str) -> None:
    """Invalid keys raise a fixed message that echoes nothing."""
    with pytest.raises(GoogleSetupError) as err:
        parse_service_account_key(raw)
    assert "not a pem" not in str(err.value)


def _mock_google(
    aioclient_mock: AiohttpClientMocker, states: dict[str, str]
) -> None:
    aioclient_mock.post(TOKEN_URL, json={"access_token": "token-value"})
    for service in GOOGLE_APIS.values():
        base = f"{SERVICE_USAGE_URL}/projects/{PROJECT}/services/{service}"
        aioclient_mock.get(base, json={"state": states.get(service, "ENABLED")})
    forbidden = GOOGLE_APIS["gmail"]
    aioclient_mock.post(
        f"{SERVICE_USAGE_URL}/projects/{PROJECT}/services/{forbidden}:enable",
        status=403,
        json={
            "error": {
                "status": "PERMISSION_DENIED",
                "message": f"mentions {SECRET_MARKER}",
                "details": [{"reason": "SERVICE_DISABLED"}],
            }
        },
    )


async def test_enable_apis_maps_results_and_never_leaks_the_key(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    aioclient_mock: AiohttpClientMocker,
    key_json: str,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Each API gets its own result and the key stays out of everything."""
    caplog.set_level(logging.DEBUG)
    logging.getLogger("homeassistant.components.websocket_api").setLevel(
        logging.DEBUG
    )
    assert await async_setup_component(hass, "google_setup", {})
    _mock_google(aioclient_mock, {GOOGLE_APIS["gmail"]: "DISABLED"})
    client = await hass_ws_client(hass)

    with patch("homeassistant.components.google_setup.api.POLL_DELAY", 0):
        await client.send_json_auto_id(
            {
                "type": "google_setup/enable_apis",
                "service_account_key": key_json,
                "apis": ["drive", "gmail"],
            }
        )
        response = await client.receive_json()

    assert response["success"]
    result = response["result"]
    assert result["project_id"] == PROJECT
    by_id: dict[str, Any] = {item["id"]: item for item in result["apis"]}
    assert by_id["drive"]["state"] == "enabled"
    assert by_id["gmail"]["state"] == "error"
    assert by_id["gmail"]["reason"] == "PERMISSION_DENIED / SERVICE_DISABLED"

    serialized = json.dumps(response)
    assert "**REDACTED**" in caplog.text
    for secret in (SECRET_MARKER, "BEGIN PRIVATE KEY", "token-value"):
        assert secret not in serialized
        assert secret not in caplog.text
    sent = aioclient_mock.mock_calls[0][2]
    assert sent["assertion"].count(".") == 2
    assert "evil.example" not in str(aioclient_mock.mock_calls)


@pytest.mark.parametrize(
    "project_id", ["../evil", "A-Bad-Id", "a/b/c/d/e", "short", "x" * 40, "ok-id?x=1"]
)
def test_hostile_project_id_is_refused(key_json: str, project_id: str) -> None:
    """A project id that is not a Google project id never reaches a URL."""
    data = json.loads(key_json)
    data["project_id"] = project_id
    with pytest.raises(GoogleSetupError):
        parse_service_account_key(data)


def test_oversized_key_in_object_form_is_refused(key_json: str) -> None:
    """The size limit also holds when the key arrives as an object."""
    data = json.loads(key_json)
    data["private_key"] = data["private_key"] + "x" * 30000
    with pytest.raises(GoogleSetupError):
        parse_service_account_key(data)


def test_deeply_nested_key_is_refused() -> None:
    """Nested brackets give a clean refusal, not a recursion error."""
    with pytest.raises(GoogleSetupError):
        parse_service_account_key("[" * 10000 + "]" * 10000)


@pytest.mark.parametrize("apis", [[[1]], [{"a": 1}], "drive", [None], 5])
async def test_unhashable_or_wrong_api_list_is_refused(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    key_json: str,
    apis: Any,
) -> None:
    """A malformed list of APIs is refused with a format error."""
    assert await async_setup_component(hass, "google_setup", {})
    client = await hass_ws_client(hass)

    await client.send_json_auto_id(
        {
            "type": "google_setup/enable_apis",
            "service_account_key": key_json,
            "apis": apis,
        }
    )
    response = await client.receive_json()

    assert not response["success"]
    assert response["error"]["code"] == "invalid_format"


@pytest.mark.parametrize("details", [5, "text", {"reason": "x"}, [1, None]])
async def test_odd_google_error_details_are_tolerated(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    aioclient_mock: AiohttpClientMocker,
    key_json: str,
    details: Any,
) -> None:
    """Google error details that are not a list never break the call."""
    assert await async_setup_component(hass, "google_setup", {})
    aioclient_mock.post(TOKEN_URL, status=400, json={"error": {"status": "X", "details": details}})
    client = await hass_ws_client(hass)

    await client.send_json_auto_id(
        {"type": "google_setup/enable_apis", "service_account_key": key_json}
    )
    response = await client.receive_json()

    assert response["error"]["code"] == "google_setup_failed"


async def test_redirect_and_oversized_responses_are_errors(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    aioclient_mock: AiohttpClientMocker,
    key_json: str,
) -> None:
    """A redirect or a huge body from Google is refused, not followed or read."""
    assert await async_setup_component(hass, "google_setup", {})
    client = await hass_ws_client(hass)

    aioclient_mock.post(TOKEN_URL, status=302, headers={"Location": "https://evil.example/"})
    await client.send_json_auto_id(
        {"type": "google_setup/enable_apis", "service_account_key": key_json}
    )
    response = await client.receive_json()
    assert response["error"]["message"] == "Google answered with an unexpected redirect"

    aioclient_mock.clear_requests()
    aioclient_mock.post(TOKEN_URL, content=b'{"access_token": "' + b"a" * 70000 + b'"}')
    await client.send_json_auto_id(
        {"type": "google_setup/enable_apis", "service_account_key": key_json}
    )
    response = await client.receive_json()
    assert response["error"]["message"] == "Google refused the key: unknown"


async def test_token_refusal_reports_only_google_reason(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    aioclient_mock: AiohttpClientMocker,
    key_json: str,
) -> None:
    """A refused key returns an error naming Google's reason."""
    assert await async_setup_component(hass, "google_setup", {})
    aioclient_mock.post(TOKEN_URL, status=400, json={"error": "invalid_grant"})
    client = await hass_ws_client(hass)

    await client.send_json_auto_id(
        {"type": "google_setup/enable_apis", "service_account_key": key_json}
    )
    response = await client.receive_json()

    assert not response["success"]
    assert response["error"]["message"] == "Google refused the key: invalid_grant"


async def test_invalid_key_never_echoed(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A malformed key is refused without echoing it."""
    assert await async_setup_component(hass, "google_setup", {})
    client = await hass_ws_client(hass)

    await client.send_json_auto_id(
        {"type": "google_setup/enable_apis", "service_account_key": SECRET_MARKER}
    )
    response = await client.receive_json()

    assert not response["success"]
    assert SECRET_MARKER not in json.dumps(response)


async def test_status_lists_apis_and_available_domains(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """The status command lists every API and the integrations present."""
    assert await async_setup_component(hass, "google_setup", {})
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": "google_setup/status"})
    response = await client.receive_json()

    assert response["success"]
    assert len(response["result"]["apis"]) == 10
    assert "google_drive" in response["result"]["domains"]
    assert response["result"]["my_link"] is False
