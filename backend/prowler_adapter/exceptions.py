"""
Prowler Adapter — Custom Exceptions

All Prowler-specific errors are subclasses of ProwlerAdapterError so
callers can catch them with a single except clause and never let Prowler's
internal exceptions leak into application code.
"""
from __future__ import annotations


class ProwlerAdapterError(Exception):
    """Base exception for all errors raised by the Prowler adapter layer."""


class ProwlerConnectionError(ProwlerAdapterError):
    """Raised when a cloud provider connection test fails.

    Attributes:
        provider_type: The cloud provider type (e.g. 'aws', 'azure').
        message: Human-readable description of the failure.
    """

    def __init__(self, provider_type: str, message: str) -> None:
        self.provider_type = provider_type
        self.message = message
        super().__init__(f"[{provider_type}] Connection failed: {message}")


class ProwlerScanError(ProwlerAdapterError):
    """Raised when a Prowler scan encounters a fatal error.

    Attributes:
        scan_id: The platform scan UUID.
        message: Human-readable description of the failure.
    """

    def __init__(self, scan_id: str, message: str) -> None:
        self.scan_id = scan_id
        self.message = message
        super().__init__(f"[scan={scan_id}] Scan error: {message}")
