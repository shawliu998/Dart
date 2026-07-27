from __future__ import annotations

import pytest

from app.auth.dependencies import get_principal
from app.auth.tokens import create_token, decode_token
from app.main import (
    _API_CSP,
    _REDOC_CSP,
    _SWAGGER_CSP,
    SecurityHeadersMiddleware,
    internal_server_error,
)
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient


@pytest.mark.parametrize("path", ["/health", "/does-not-exist"])
def test_api_responses_include_baseline_security_headers(client, path: str) -> None:
    response = client.get(path)

    assert response.headers["content-security-policy"] == _API_CSP
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["permissions-policy"] == "camera=(), geolocation=(), microphone=()"


def test_swagger_csp_allows_only_the_assets_it_uses(client) -> None:
    response = client.get("/docs")

    assert response.status_code == 200
    assert response.headers["content-security-policy"] == _SWAGGER_CSP
    assert "https://cdn.jsdelivr.net" in response.text
    assert "url: '/openapi.json'" in response.text
    assert "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net" in _SWAGGER_CSP
    assert "style-src 'self' https://cdn.jsdelivr.net" in _SWAGGER_CSP


def test_redoc_csp_allows_its_fonts_and_dynamic_styles(client) -> None:
    response = client.get("/redoc")

    assert response.status_code == 200
    assert response.headers["content-security-policy"] == _REDOC_CSP
    assert "https://cdn.jsdelivr.net" in response.text
    assert "font-src 'self' data: https://fonts.gstatic.com" in _REDOC_CSP
    assert "style-src 'self' 'unsafe-inline'" in _REDOC_CSP
    assert "img-src 'self' data: https://cdn.redoc.ly" in _REDOC_CSP
    assert "worker-src 'self' blob:" in _REDOC_CSP


def test_cors_preflight_includes_baseline_security_headers(client) -> None:
    response = client.options(
        "/api/auth/login",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert response.headers["content-security-policy"] == _API_CSP
    assert response.headers["x-content-type-options"] == "nosniff"


def test_unhandled_500_response_has_generic_body_and_security_headers() -> None:
    probe = FastAPI()
    probe.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_methods=["GET"],
        allow_headers=["Content-Type"],
    )
    probe.add_exception_handler(Exception, internal_server_error)
    probe.add_middleware(SecurityHeadersMiddleware)

    @probe.get("/boom")
    def boom() -> None:
        raise RuntimeError("untrusted exception detail")

    response = TestClient(probe, raise_server_exceptions=False).get(
        "/boom", headers={"Origin": "http://localhost:3000"}
    )

    assert response.status_code == 500
    assert response.json() == {"detail": "internal server error"}
    assert response.headers["content-security-policy"] == _API_CSP
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert response.headers["access-control-expose-headers"] == "X-Request-ID"


@pytest.mark.parametrize("environment", ["production", "staging"])
def test_non_development_server_rejects_client_supplied_identity_headers_and_default_secret(
    monkeypatch, environment: str
) -> None:
    monkeypatch.setenv("APP_ENV", environment)

    with pytest.raises(HTTPException, match="bearer authorization required") as error:
        get_principal(
            authorization=None,
            x_tenant_id="00000000-0000-0000-0000-000000000001",
            x_user_id="00000000-0000-0000-0000-000000000002",
            x_role="admin",
        )

    assert error.value.status_code == 401

    with pytest.raises(HTTPException, match="non-development auth secret") as token_error:
        create_token(
            {
                "tenant_id": "00000000-0000-0000-0000-000000000001",
                "user_id": "00000000-0000-0000-0000-000000000002",
                "role": "admin",
            }
        )
    assert token_error.value.status_code == 503

    with pytest.raises(HTTPException, match="non-development auth secret"):
        decode_token("untrusted.token")
