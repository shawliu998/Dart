from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.service import append_event
from app.auth.dependencies import Principal
from app.models.entities import TenderProject
from app.schemas.projects import ProjectCreate, ProjectUpdate


def get_project(db: Session, principal: Principal, project_id: UUID) -> TenderProject:
    project = db.scalar(
        select(TenderProject).where(
            TenderProject.id == project_id,
            TenderProject.tenant_id == principal.tenant_id,
            TenderProject.deleted_at.is_(None),
        )
    )
    if project is None:
        raise HTTPException(status_code=404, detail="project not found")
    return project


def list_projects(db: Session, principal: Principal) -> list[TenderProject]:
    return list(
        db.scalars(
            select(TenderProject)
            .where(
                TenderProject.tenant_id == principal.tenant_id, TenderProject.deleted_at.is_(None)
            )
            .order_by(TenderProject.updated_at.desc())
        )
    )


def create_project(db: Session, principal: Principal, data: ProjectCreate) -> TenderProject:
    project = TenderProject(
        tenant_id=principal.tenant_id,
        organization_id=principal.tenant_id,
        created_by=principal.user_id,
        owner_id=data.owner_id or principal.user_id,
        **data.model_dump(exclude={"owner_id"}),
    )
    db.add(project)
    db.flush()
    append_event(
        db,
        principal,
        action="project.created",
        entity_type="project",
        entity_id=project.id,
        project_id=project.id,
        after=data.model_dump(mode="json"),
    )
    db.commit()
    db.refresh(project)
    return project


def update_project(
    db: Session, principal: Principal, project: TenderProject, data: ProjectUpdate
) -> TenderProject:
    before = {key: getattr(project, key) for key in data.model_fields_set}
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(project, key, value)
    project.version += 1
    append_event(
        db,
        principal,
        action="project.updated",
        entity_type="project",
        entity_id=project.id,
        project_id=project.id,
        before=before,
        after={key: getattr(project, key) for key in data.model_fields_set},
    )
    db.commit()
    db.refresh(project)
    return project


def delete_project(db: Session, principal: Principal, project: TenderProject) -> None:
    from app.db.base import utcnow

    project.deleted_at = utcnow()
    project.version += 1
    append_event(
        db,
        principal,
        action="project.deleted",
        entity_type="project",
        entity_id=project.id,
        project_id=project.id,
        before={"deleted_at": None},
        after={"deleted_at": project.deleted_at},
    )
    db.commit()
