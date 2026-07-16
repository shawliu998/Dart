# BidEvidence backend

The complete local MVP provides project CRUD, tenant/RBAC boundaries, safe upload,
page parsing, offline schema-validated requirement extraction, disqualification
candidates, evidence claims and human-approved matches, deterministic compliance and
consistency checks, amendment impacts, remediation tasks, safe package generation,
and append-only audit events.

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/alembic upgrade head
.venv/bin/python -m scripts.seed
.venv/bin/uvicorn app.main:app --reload --port 8000
.venv/bin/pytest
```

The API root is `/api`; OpenAPI is `/docs`; health is `/health`. Use the demo seed
response values as `X-Tenant-ID`, `X-User-ID`, and `X-Role`. The default database is
SQLite; set `DATABASE_URL=postgresql+psycopg://...` for PostgreSQL. The only model
provider in this phase is deterministic `MockLLMProvider`; it does not inspect keys or
make network calls.

Local login is `admin@demo.local` / `demo1234`. The stored value is PBKDF2-SHA256,
tokens expire after 30 minutes, and the default password/secret are rejected for
`APP_ENV=production`. `Authorization: Bearer ...` takes precedence over compatibility
headers.

When `S3_ENDPOINT_URL`/`S3_BUCKET` (or MinIO aliases) are configured, document and
package objects use the S3-compatible adapter. `S3_ACCESS_KEY` and `S3_SECRET_KEY` are
passed directly to the SDK and never logged. Otherwise the isolated local adapter is
used. The worker polls persistent `async_jobs`:

```bash
.venv/bin/python -m worker.main --poll-seconds 1
```

Generated ZIPs contain `MANIFEST.json`, sorted `SHA256SUMS.txt`, and
`CHECK_REPORT.json`. Failed validations cannot be approved; remaining warnings require
an authorized reviewer reason. The application never performs CA signing, payment,
CAPTCHA bypass, or unattended external submission.
