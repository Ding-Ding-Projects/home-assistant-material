"""The WebAuthn ceremonies, delegated to the webauthn library.

No signature, CBOR or authenticator data parsing happens here beyond what the
library returns. This module only chooses the options and treats every failure
as a refusal.
"""

from dataclasses import dataclass
import json
import logging
import secrets
from typing import Any

from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import (
    AttestationConveyancePreference,
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from homeassistant.auth.models import User

from .const import (
    CEREMONY_TIMEOUT_MS,
    CHALLENGE_BYTES,
    KNOWN_TRANSPORTS,
    MAX_CREDENTIAL_ID_BYTES,
    RP_NAME,
)
from .origin import RelyingParty
from .store import PasskeyCredential

_LOGGER = logging.getLogger(__name__)


class CeremonyError(Exception):
    """A ceremony was refused. The reason is for logs and tests only."""

    def __init__(self, reason: str) -> None:
        """Initialize the error."""
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True, slots=True)
class VerifiedRegistration:
    """The outcome of a verified registration."""

    credential_id: str
    public_key: str
    sign_count: int
    transports: list[str]


@dataclass(frozen=True, slots=True)
class VerifiedAssertion:
    """The outcome of a verified assertion."""

    new_sign_count: int


def user_handle(user: User) -> bytes:
    """Return the opaque user handle stored in the credential for a user."""
    return user.id.encode()


def new_challenge() -> bytes:
    """Return a fresh random challenge."""
    return secrets.token_bytes(CHALLENGE_BYTES)


def build_registration_options(
    *,
    relying_party: RelyingParty,
    user: User,
    existing: list[PasskeyCredential],
    challenge: bytes,
) -> dict[str, Any]:
    """Return the creation options for a discoverable, user-verified credential."""
    options = generate_registration_options(
        rp_id=relying_party.rp_id,
        rp_name=RP_NAME,
        user_id=user_handle(user),
        user_name=user.name or user.id,
        user_display_name=user.name or user.id,
        challenge=challenge,
        attestation=AttestationConveyancePreference.NONE,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        exclude_credentials=[
            PublicKeyCredentialDescriptor(id=base64url_to_bytes(item.id))
            for item in existing
        ],
        timeout=CEREMONY_TIMEOUT_MS,
    )
    return json.loads(options_to_json(options))


def build_authentication_options(
    *, relying_party: RelyingParty, challenge: bytes
) -> dict[str, Any]:
    """Return the request options. The list of allowed credentials stays empty."""
    options = generate_authentication_options(
        rp_id=relying_party.rp_id,
        challenge=challenge,
        timeout=CEREMONY_TIMEOUT_MS,
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    return json.loads(options_to_json(options))


def _transports(credential: dict[str, Any]) -> list[str]:
    response = credential.get("response")
    raw = response.get("transports") if isinstance(response, dict) else None
    if not isinstance(raw, list):
        return []
    return sorted({item for item in raw if item in KNOWN_TRANSPORTS})


def verify_registration(
    *,
    credential: dict[str, Any],
    challenge: bytes,
    relying_party: RelyingParty,
) -> VerifiedRegistration:
    """Verify an attestation, requiring user verification."""
    try:
        verified = verify_registration_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=relying_party.rp_id,
            expected_origin=relying_party.origin,
            require_user_verification=True,
        )
    except Exception as err:
        _LOGGER.debug("Passkey registration refused: %s", type(err).__name__)
        raise CeremonyError("registration_invalid") from err

    if not 0 < len(verified.credential_id) <= MAX_CREDENTIAL_ID_BYTES:
        raise CeremonyError("credential_id_length")

    return VerifiedRegistration(
        credential_id=bytes_to_base64url(verified.credential_id),
        public_key=bytes_to_base64url(verified.credential_public_key),
        sign_count=verified.sign_count,
        transports=_transports(credential),
    )


def verify_assertion(
    *,
    credential: dict[str, Any],
    challenge: bytes,
    relying_party: RelyingParty,
    stored: PasskeyCredential,
) -> VerifiedAssertion:
    """Verify an assertion against a stored credential, requiring user verification.

    The sign counter is not judged by the library. It is checked by the caller
    afterwards, so that a regression is only reported for a genuine signature.
    """
    try:
        verified = verify_authentication_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=relying_party.rp_id,
            expected_origin=relying_party.origin,
            credential_public_key=base64url_to_bytes(stored.public_key),
            credential_current_sign_count=0,
            require_user_verification=True,
        )
    except Exception as err:
        _LOGGER.debug("Passkey assertion refused: %s", type(err).__name__)
        raise CeremonyError("assertion_invalid") from err

    return VerifiedAssertion(new_sign_count=verified.new_sign_count)


def counter_regressed(stored_count: int, new_count: int) -> bool:
    """Return True when the authenticator counter did not move forward.

    Authenticators that do not keep a counter report zero every time, which is
    accepted. Once either side is non-zero the counter has to increase.
    """
    return (new_count > 0 or stored_count > 0) and new_count <= stored_count
