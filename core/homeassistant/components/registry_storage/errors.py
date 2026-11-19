"""Reason codes for everything that can go wrong with the registry or the lock."""

from enum import StrEnum

from homeassistant.exceptions import HomeAssistantError


class Reason(StrEnum):
    """A short, stable reason code. Registry error text never reaches these."""

    # The registry.
    AUTH_FAILED = "auth_failed"
    DENIED = "denied"
    NOT_FOUND = "not_found"
    RATE_LIMITED = "rate_limited"
    UNAVAILABLE = "unavailable"
    TIMEOUT = "timeout"
    INVALID_RESPONSE = "invalid_response"
    REJECTED = "rejected"
    INSECURE_ADDRESS = "insecure_address"
    INVALID_ADDRESS = "invalid_address"
    INVALID_REPOSITORY = "invalid_repository"
    # The lock.
    PASSWORD_TOO_WEAK = "password_too_weak"
    PASSWORD_MISMATCH = "password_mismatch"
    WRONG_PASSWORD = "wrong_password"
    NOT_LOCKED = "not_locked"
    UNSUPPORTED_FORMAT = "unsupported_format"
    TAMPERED = "tampered"
    TRUNCATED = "truncated"
    # The store.
    OBJECT_NOT_FOUND = "object_not_found"
    SELF_TEST_FAILED = "self_test_failed"
    INVALID_REQUEST = "invalid_request"
    NOT_READY = "not_ready"


class RegistryStorageError(HomeAssistantError):
    """Base error. Its text is the reason code and nothing else."""

    def __init__(self, reason: Reason, *, status: int | None = None) -> None:
        """Keep only the code and, for the registry, the status number."""
        super().__init__(str(reason))
        self.reason = reason
        self.status = status


class RegistryError(RegistryStorageError):
    """The registry refused, failed or answered nonsense."""


class LockError(RegistryStorageError):
    """The password, the header or the encrypted bytes were not acceptable."""
