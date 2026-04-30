import os
import shutil
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional
from models import SessionLocal, Project, ProjectFile, Questionnaire, Persona
from utils.parser import process_file_to_text
from llm.questionnaire_extractor import extract_questionnaire_from_text, generate_questions_from_context
from auth import get_current_user

router = APIRouter(prefix="/projects", tags=["projects"])

ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".txt", ".csv", ".json"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class CreateProjectRequest(BaseModel):
    name: str
    desc: str
    project_type: str


class PersonaFormData(BaseModel):
    name: Optional[str] = None
    age: int = Field(..., ge=18, le=80)
    gender: str
    occupation: str
    industry: str
    education: str
    region: str
    background: str


@router.get("")
def list_projects(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    from models import Interview, Persona as PersonaModel
    from sqlalchemy import func
    projects = db.query(Project).order_by(Project.created_at.desc()).all()

    # Per-project interview stats in one query each (SQLite, small data)
    result = []
    for p in projects:
        interviews = db.query(Interview).filter(Interview.project_id == p.id).all()
        total_iv = len(interviews)
        completed_iv = sum(1 for iv in interviews if iv.status == "completed")
        running_iv = sum(1 for iv in interviews if iv.status in ("running", "queued"))
        persona_count = db.query(PersonaModel).filter(PersonaModel.project_id == p.id).count()

        result.append({
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "project_type": p.project_type,
            "status": p.status,
            "created_at": p.created_at,
            "persona_count": persona_count,
            "interview_total": total_iv,
            "interview_completed": completed_iv,
            "interview_running": running_iv,
        })
    return result


@router.post("")
def create_project(req: CreateProjectRequest, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    db_project = Project(
        owner_user_id=user["id"],
        name=req.name,
        description=req.desc,
        project_type=req.project_type
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project


@router.post("/{project_id}/upload")
async def upload_project_file(
    project_id: str,
    file: UploadFile = File(...),
    mode: str = Query("extract"),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    if mode not in ("extract", "generate"):
        raise HTTPException(status_code=400, detail="mode must be 'extract' or 'generate'")

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    safe_name = os.path.basename(file.filename or "upload")
    ext = os.path.splitext(safe_name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type '{ext}' not allowed")

    content = await file.read(MAX_FILE_SIZE + 1)
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")

    storage_dir = os.path.join(os.path.dirname(__file__), "..", "storage", "uploads", project_id)
    os.makedirs(storage_dir, exist_ok=True)
    file_location = os.path.join(storage_dir, safe_name)
    with open(file_location, "wb") as f:
        f.write(content)

    try:
        extracted_text = process_file_to_text(file_location)
    except Exception as e:
        extracted_text = f"Error extracting text: {e}"

    db_file = ProjectFile(
        project_id=project_id,
        filename=safe_name,
        file_type="background_document" if mode == "generate" else "survey_document",
        storage_path=file_location,
        parsed_text=extracted_text
    )
    db.add(db_file)
    db.commit()

    if mode == "generate":
        structured_q_json = generate_questions_from_context(extracted_text)
    else:
        structured_q_json = extract_questionnaire_from_text(extracted_text)

    questionnaire_id = None
    questions = structured_q_json or []
    if questions:
        q = Questionnaire(project_id=project_id, questions_json=questions)
        db.add(q)
        db.commit()
        questionnaire_id = q.id

    return {
        "info": f"file '{safe_name}' saved and parsed",
        "project_id": project_id,
        "questionnaire_id": questionnaire_id,
        "extracted_questions_count": len(questions),
        "questions": questions,
    }


@router.get("/{project_id}/personas")
def list_personas(project_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    personas = db.query(Persona).filter(Persona.project_id == project_id).all()
    return [{"id": p.id, "participant_id": p.participant_id, "persona_json": p.persona_json} for p in personas]


@router.post("/{project_id}/personas")
def add_persona(
    project_id: str,
    req: PersonaFormData,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    existing_count = db.query(Persona).filter(Persona.project_id == project_id).count()
    if existing_count >= 50:
        raise HTTPException(status_code=400, detail="Maximum of 50 personas per project")

    persona_dict = req.model_dump()
    if not persona_dict.get("name"):
        persona_dict["name"] = f"Participant {existing_count + 1}"

    persona = Persona(
        user_id=user["id"],
        project_id=project_id,
        is_library=False,
        persona_json=persona_dict,
        generation_model="manual"
    )
    db.add(persona)
    db.commit()
    db.refresh(persona)
    return {"id": persona.id, "participant_id": persona.participant_id, "persona_json": persona.persona_json}


@router.delete("/{project_id}/personas/{persona_id}")
def delete_persona(
    project_id: str,
    persona_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    persona = db.query(Persona).filter(Persona.id == persona_id, Persona.project_id == project_id).first()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    db.delete(persona)
    db.commit()
    return {"ok": True}
