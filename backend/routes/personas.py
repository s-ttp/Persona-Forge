import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional

from models import SessionLocal, Persona, Project
from auth import get_current_user

router = APIRouter(prefix="/personas", tags=["personas"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class PersonaRequest(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = Field(None, ge=18, le=80)
    gender: Optional[str] = None
    occupation: Optional[str] = None
    company: Optional[str] = None
    industry: Optional[str] = None
    department: Optional[str] = None
    role: Optional[str] = None
    years_experience: Optional[str] = None
    country: Optional[str] = None
    education: Optional[str] = None
    region: Optional[str] = None
    background: Optional[str] = None


def _persona_response(p: Persona, project_name: str | None = None) -> dict:
    return {
        "id": p.id,
        "participant_id": p.participant_id,
        "is_library": p.is_library,
        "project_id": p.project_id,
        "project_name": project_name,
        "generation_model": p.generation_model,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "persona_json": p.persona_json,
    }


@router.get("")
def list_all_personas(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return all personas — both library and project-linked."""
    personas = (
        db.query(Persona)
        .order_by(Persona.is_library.desc(), Persona.created_at.desc())
        .all()
    )

    project_ids = {p.project_id for p in personas if p.project_id}
    projects = {
        proj.id: proj.name
        for proj in db.query(Project).filter(Project.id.in_(project_ids)).all()
    } if project_ids else {}

    return [_persona_response(p, projects.get(p.project_id)) for p in personas]


@router.post("")
def create_library_persona(
    req: PersonaRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    count = db.query(Persona).filter(Persona.is_library == True).count()
    if count >= 200:
        raise HTTPException(status_code=400, detail="Library limit is 200 personas")

    persona_dict = {k: v for k, v in req.model_dump().items() if v is not None}
    if not persona_dict.get("name"):
        persona_dict["name"] = f"Persona {count + 1}"

    persona = Persona(
        user_id=user["id"],
        project_id=None,
        is_library=True,
        persona_json=persona_dict,
        generation_model="manual",
    )
    db.add(persona)
    db.commit()
    db.refresh(persona)
    return _persona_response(persona)


@router.put("/{persona_id}")
def update_persona(
    persona_id: str,
    req: PersonaRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Update any persona (library or project)."""
    persona = db.query(Persona).filter(Persona.id == persona_id).first()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")

    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if not updates.get("name"):
        updates["name"] = persona.persona_json.get("name", "Persona")

    merged = {**persona.persona_json, **updates}
    persona.persona_json = merged
    db.commit()
    db.refresh(persona)

    project_name = None
    if persona.project_id:
        proj = db.query(Project).filter(Project.id == persona.project_id).first()
        project_name = proj.name if proj else None

    return _persona_response(persona, project_name)


@router.post("/{persona_id}/save-to-library")
def save_to_library(
    persona_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Promote a project persona to the library (keeps the original in-project)."""
    persona = db.query(Persona).filter(Persona.id == persona_id).first()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")

    if persona.is_library:
        return _persona_response(persona)

    library_copy = Persona(
        user_id=user["id"],
        project_id=None,
        is_library=True,
        persona_json=dict(persona.persona_json),
        generation_model=persona.generation_model or "manual",
    )
    db.add(library_copy)
    db.commit()
    db.refresh(library_copy)
    return _persona_response(library_copy)


@router.delete("/{persona_id}")
def delete_persona(
    persona_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    persona = db.query(Persona).filter(Persona.id == persona_id).first()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    db.delete(persona)
    db.commit()
    return {"ok": True}


@router.post("/{persona_id}/use/{project_id}")
def use_library_persona_in_project(
    persona_id: str,
    project_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Copy any existing persona (library or project-linked) into a project."""
    source_persona = db.query(Persona).filter(Persona.id == persona_id).first()
    if not source_persona:
        raise HTTPException(status_code=404, detail="Persona not found")

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    existing_count = db.query(Persona).filter(Persona.project_id == project_id).count()
    if existing_count >= 50:
        raise HTTPException(status_code=400, detail="Maximum of 50 personas per project")

    copy = Persona(
        user_id=user["id"],
        project_id=project_id,
        is_library=False,
        persona_json=dict(source_persona.persona_json),
        generation_model=source_persona.generation_model,
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    return {"id": copy.id, "participant_id": copy.participant_id, "persona_json": copy.persona_json}
