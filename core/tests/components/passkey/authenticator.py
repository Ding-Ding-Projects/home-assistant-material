"""A software authenticator that builds WebAuthn responses by hand."""

import base64
import hashlib
import json
import os
import struct
from typing import Any

import cbor2
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec

FLAG_USER_PRESENT = 0x01
FLAG_USER_VERIFIED = 0x04
FLAG_ATTESTED = 0x40


def b64url(data: bytes) -> str:
    """Encode bytes as unpadded base64url."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def unb64url(value: str) -> bytes:
    """Decode unpadded base64url."""
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


class SoftwareAuthenticator:
    """An ES256 authenticator that holds one credential."""

    def __init__(self, *, origin: str, rp_id: str) -> None:
        """Create a credential with a fresh key pair."""
        self.origin = origin
        self.rp_id = rp_id
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.credential_id = os.urandom(32)
        self.counter = 0

    @property
    def credential_id_b64(self) -> str:
        """Return the credential id as sent over the wire."""
        return b64url(self.credential_id)

    @property
    def public_key_b64(self) -> str:
        """Return the public key the way the server stores it."""
        return b64url(self.cose_public_key())

    def cose_public_key(self) -> bytes:
        """Return the public key as a COSE_Key."""
        numbers = self.key.public_key().public_numbers()
        return cbor2.dumps(
            {
                1: 2,
                3: -7,
                -1: 1,
                -2: numbers.x.to_bytes(32, "big"),
                -3: numbers.y.to_bytes(32, "big"),
            }
        )

    def _client_data(self, kind: str, challenge: str, origin: str | None) -> bytes:
        return json.dumps(
            {
                "type": kind,
                "challenge": challenge,
                "origin": origin or self.origin,
                "crossOrigin": False,
            }
        ).encode()

    def _flags(self, *, user_verified: bool, attested: bool) -> int:
        flags = FLAG_USER_PRESENT
        if user_verified:
            flags |= FLAG_USER_VERIFIED
        if attested:
            flags |= FLAG_ATTESTED
        return flags

    def create(
        self,
        options: dict[str, Any],
        *,
        origin: str | None = None,
        rp_id: str | None = None,
        challenge: str | None = None,
        user_verified: bool = True,
    ) -> dict[str, Any]:
        """Answer navigator.credentials.create() with attestation "none"."""
        client_data = self._client_data(
            "webauthn.create", challenge or options["challenge"], origin
        )
        rp_hash = hashlib.sha256((rp_id or self.rp_id).encode()).digest()
        auth_data = (
            rp_hash
            + bytes([self._flags(user_verified=user_verified, attested=True)])
            + struct.pack(">I", self.counter)
            + bytes(16)
            + struct.pack(">H", len(self.credential_id))
            + self.credential_id
            + self.cose_public_key()
        )
        attestation = cbor2.dumps({"fmt": "none", "attStmt": {}, "authData": auth_data})
        return {
            "id": self.credential_id_b64,
            "rawId": self.credential_id_b64,
            "type": "public-key",
            "authenticatorAttachment": "platform",
            "clientExtensionResults": {},
            "response": {
                "clientDataJSON": b64url(client_data),
                "attestationObject": b64url(attestation),
                "transports": ["internal", "bogus"],
            },
        }

    def get(
        self,
        options: dict[str, Any],
        *,
        user_handle: bytes,
        origin: str | None = None,
        rp_id: str | None = None,
        challenge: str | None = None,
        user_verified: bool = True,
        counter: int | None = None,
    ) -> dict[str, Any]:
        """Answer navigator.credentials.get() with a signed assertion."""
        client_data = self._client_data(
            "webauthn.get", challenge or options["challenge"], origin
        )
        if counter is None:
            self.counter += 1
            counter = self.counter
        rp_hash = hashlib.sha256((rp_id or self.rp_id).encode()).digest()
        auth_data = (
            rp_hash
            + bytes([self._flags(user_verified=user_verified, attested=False)])
            + struct.pack(">I", counter)
        )
        signature = self.key.sign(
            auth_data + hashlib.sha256(client_data).digest(),
            ec.ECDSA(hashes.SHA256()),
        )
        return {
            "id": self.credential_id_b64,
            "rawId": self.credential_id_b64,
            "type": "public-key",
            "authenticatorAttachment": "platform",
            "clientExtensionResults": {},
            "response": {
                "clientDataJSON": b64url(client_data),
                "authenticatorData": b64url(auth_data),
                "signature": b64url(signature),
                "userHandle": b64url(user_handle),
            },
        }
