from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

TEST_ROOT = Path(tempfile.mkdtemp(prefix="bidevidence-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_ROOT / 'test.db'}"
os.environ["UPLOAD_DIR"] = str(TEST_ROOT / "uploads")

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def demo(client):
    bootstrap_headers = {
        "X-Tenant-ID": "00000000-0000-0000-0000-000000000001",
        "X-User-ID": "00000000-0000-0000-0000-000000000002",
        "X-Role": "admin",
    }
    response = client.post("/api/dev/seed", headers=bootstrap_headers)
    assert response.status_code == 200
    return response.json()
