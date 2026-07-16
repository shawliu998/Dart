from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.entities import Organization, TenderProject, User
from app.services.demo_seed import seed_full_demo
from app.auth.tokens import hash_password
from app.core.config import get_settings

DEMO_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")
DEMO_USER_ID = UUID("00000000-0000-0000-0000-000000000002")
DEMO_PROJECT_ID = UUID("00000000-0000-0000-0000-000000000003")


def seed_demo(db: Session) -> dict:
    if get_settings().app_env == "production":
        raise RuntimeError("demo seed and default password are disabled in production")
    organization = db.get(Organization, DEMO_TENANT_ID)
    if organization is None:
        db.add(
            Organization(
                id=DEMO_TENANT_ID, name="标证通演示企业", legal_name="上海智园数字科技有限公司"
            )
        )
    else:
        organization.legal_name = "上海智园数字科技有限公司"
    user = db.get(User, DEMO_USER_ID)
    if user is None:
        db.add(
            User(
                id=DEMO_USER_ID,
                organization_id=DEMO_TENANT_ID,
                name="演示管理员",
                email="admin@demo.local",
                role="admin",
                password_hash=hash_password("demo1234", salt="bidevidence-demo-admin"),
            )
        )
    else:
        user.password_hash = hash_password("demo1234", salt="bidevidence-demo-admin")
    if db.get(TenderProject, DEMO_PROJECT_ID) is None:
        db.add(
            TenderProject(
                id=DEMO_PROJECT_ID,
                tenant_id=DEMO_TENANT_ID,
                organization_id=DEMO_TENANT_ID,
                created_by=DEMO_USER_ID,
                name="智慧园区综合管理平台采购项目",
                project_code="2026-ZHYY-001",
                buyer_name="某市产业园区管理委员会",
                budget_amount=5900000,
                currency="CNY",
                deadline=datetime.now(timezone.utc) + timedelta(days=14),
                owner_id=DEMO_USER_ID,
            )
        )
    db.commit()
    fixture = seed_full_demo(db, DEMO_TENANT_ID, DEMO_USER_ID, DEMO_PROJECT_ID)
    return {
        "tenant_id": str(DEMO_TENANT_ID),
        "user_id": str(DEMO_USER_ID),
        "project_id": str(DEMO_PROJECT_ID),
        "role": "admin",
        "auth_headers": {
            "X-Tenant-ID": str(DEMO_TENANT_ID),
            "X-User-ID": str(DEMO_USER_ID),
            "X-Role": "admin",
        },
        **fixture,
    }
