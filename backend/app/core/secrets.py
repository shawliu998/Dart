from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Protocol

from app.core.config import get_settings


class SecretStore(Protocol):
    def get(self, reference: str) -> str | None: ...
    def put(self, reference: str, value: str) -> None: ...
    def delete(self, reference: str) -> None: ...


class LocalSecretStore:
    """Small replaceable desktop secret store.

    The API stores only opaque references. This local implementation keeps the
    credential file outside the database with owner-only permissions so the
    product flow can be packaged now and moved to an OS vault without changing
    the settings or provider contracts.
    """

    def __init__(self, path: Path):
        self.path = path

    def _read(self) -> dict[str, str]:
        if not self.path.exists():
            return {}
        data = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or not all(
            isinstance(key, str) and isinstance(value, str)
            for key, value in data.items()
        ):
            raise RuntimeError("secret store is invalid")
        return data

    def _write(self, data: dict[str, str]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(data, ensure_ascii=False, sort_keys=True),
            encoding="utf-8",
        )
        os.chmod(temporary, 0o600)
        temporary.replace(self.path)

    def get(self, reference: str) -> str | None:
        return self._read().get(reference)

    def put(self, reference: str, value: str) -> None:
        data = self._read()
        data[reference] = value
        self._write(data)

    def delete(self, reference: str) -> None:
        data = self._read()
        if reference in data:
            del data[reference]
            self._write(data)


def get_secret_store() -> SecretStore:
    settings = get_settings()
    root = settings.app_data_dir or settings.upload_dir.parent
    configured = os.getenv("BIDEVIDENCE_SECRET_STORE_PATH")
    path = Path(configured).expanduser() if configured else root / "config" / "provider-secrets.json"
    return LocalSecretStore(path)
