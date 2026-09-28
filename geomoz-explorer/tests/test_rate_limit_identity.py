"""Tests for proxy-safe GeoMoz rate-limit identities."""

from __future__ import annotations

import hashlib
from types import SimpleNamespace


class DummyRequest:
    def __init__(
        self,
        *,
        authorization: str | None = None,
        forwarded_for: str | None = None,
        client_ip: str = "10.0.0.1",
    ):
        self.headers = {}
        if authorization:
            self.headers["Authorization"] = authorization
        if forwarded_for:
            self.headers["x-forwarded-for"] = forwarded_for
        self.client = SimpleNamespace(host=client_ip)


def test_authenticated_identity_uses_token_hash_not_proxy_ip() -> None:
    from api import _rate_limit_identity

    token = "firebase-token-value"
    first = _rate_limit_identity(
        DummyRequest(
            authorization=f"Bearer {token}",
            client_ip="proxy-a",
        )
    )
    second = _rate_limit_identity(
        DummyRequest(
            authorization=f"Bearer {token}",
            client_ip="proxy-b",
        )
    )

    expected = hashlib.sha256(token.encode("utf-8")).hexdigest()[:24]
    assert first == f"auth:{expected}"
    assert second == first
    assert token not in first


def test_anonymous_identity_prefers_first_forwarded_ip() -> None:
    from api import _rate_limit_identity

    identity = _rate_limit_identity(
        DummyRequest(
            forwarded_for="203.0.113.10, 10.0.0.2",
            client_ip="firebase-proxy",
        )
    )

    assert identity == "ip:203.0.113.10"


def test_anonymous_identity_falls_back_to_client_host() -> None:
    from api import _rate_limit_identity

    identity = _rate_limit_identity(DummyRequest(client_ip="192.0.2.25"))

    assert identity == "ip:192.0.2.25"
