import os
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from redis import Redis
from rq import Queue

from models import SessionLocal, Project, DatasetUpload, MLPersona, Persona
from auth import get_current_user

router = APIRouter(prefix="/ml-personas", tags=["ml-personas"])

redis_conn = Redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/1"))
q = Queue("personaforge_queue", connection=redis_conn)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class GenerateRequest(BaseModel):
    project_id: str
    dataset_id: str
    n_clusters: Optional[int] = None


class UpdateMLPersonaRequest(BaseModel):
    persona_name: Optional[str] = None
    behavioral_interpretation: Optional[str] = None


def run_ml_segmentation_job(dataset_upload_id: str, n_clusters):
    """RQ background job: run ML pipeline and generate personas via LLM."""
    from models import SessionLocal, DatasetUpload, MLPersona
    from ml.pipeline import load_dataset, run_segmentation
    from ml.persona_generator import generate_ml_persona

    db = SessionLocal()
    record = db.query(DatasetUpload).filter(DatasetUpload.id == dataset_upload_id).first()
    if not record:
        return

    record.status = 'segmenting'
    db.commit()

    try:
        import pandas as pd
        df = load_dataset(record.storage_path)
        profiles = record.column_profiles

        result = run_segmentation(df, profiles, n_clusters=n_clusters)
        record.n_clusters_used = result['n_clusters']

        db.query(MLPersona).filter(MLPersona.dataset_id == dataset_upload_id).delete()
        db.commit()

        for exp in result['cluster_explanations']:
            persona_data = generate_ml_persona(exp)
            db.add(MLPersona(
                project_id=record.project_id,
                dataset_id=dataset_upload_id,
                cluster_id=exp['cluster_id'],
                persona_json=persona_data,
                cluster_size=exp['cluster_size'],
                cluster_percentage=exp['cluster_percentage'],
                confidence_score=exp['confidence_score'],
                status='draft',
            ))

        record.status = 'ready'
        db.commit()
    except Exception as e:
        record.status = 'failed'
        record.error_log = str(e)
        db.commit()
    finally:
        db.close()


@router.post("/generate")
def generate_ml_personas(
    req: GenerateRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == req.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    dataset = db.query(DatasetUpload).filter(DatasetUpload.id == req.dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    if dataset.status == 'segmenting':
        raise HTTPException(status_code=409, detail="Segmentation already running")

    # Reset so results are fresh
    dataset.status = 'profiled'
    db.commit()

    q.enqueue(run_ml_segmentation_job, req.dataset_id, req.n_clusters, job_timeout=600)
    return {"message": "ML segmentation queued", "dataset_id": req.dataset_id}


@router.get("")
def list_ml_personas(
    project_id: str = Query(...),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    datasets = db.query(DatasetUpload).filter(DatasetUpload.project_id == project_id).order_by(DatasetUpload.created_at.desc()).all()
    personas = db.query(MLPersona).filter(MLPersona.project_id == project_id).order_by(MLPersona.cluster_id).all()

    dataset_info = None
    if datasets:
        ds = datasets[0]
        dataset_info = {
            'dataset_id': ds.id,
            'status': ds.status,
            'row_count': ds.row_count,
            'n_clusters_used': ds.n_clusters_used,
            'error_log': ds.error_log,
            'filename': ds.original_filename,
        }

    return {
        'dataset': dataset_info,
        'personas': [
            {
                'id': p.id,
                'cluster_id': p.cluster_id,
                'cluster_size': p.cluster_size,
                'cluster_percentage': p.cluster_percentage,
                'confidence_score': p.confidence_score,
                'status': p.status,
                'persona_json': p.persona_json,
                'persona_id': p.persona_id,
            }
            for p in personas
        ],
    }


@router.post("/{ml_persona_id}/approve")
def approve_ml_persona(
    ml_persona_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    ml_p = db.query(MLPersona).filter(MLPersona.id == ml_persona_id).first()
    if not ml_p:
        raise HTTPException(status_code=404, detail="ML persona not found")

    if ml_p.persona_id:
        # Already approved — idempotent
        existing = db.query(Persona).filter(Persona.id == ml_p.persona_id).first()
        if existing:
            return {'id': existing.id, 'persona_json': existing.persona_json}

    pj = ml_p.persona_json or {}
    persona = Persona(
        user_id=user['id'],
        project_id=ml_p.project_id,
        is_library=False,
        persona_json={
            'name': pj.get('persona_name', f'Segment {ml_p.cluster_id + 1}'),
            'source': 'ml_generated',
            'cluster_size': ml_p.cluster_size,
            'cluster_percentage': ml_p.cluster_percentage,
            'confidence_score': ml_p.confidence_score,
            **pj,
        },
        generation_model='ml_kmeans',
    )
    db.add(persona)
    db.flush()

    ml_p.status = 'approved'
    ml_p.persona_id = persona.id
    db.commit()
    db.refresh(persona)

    return {'id': persona.id, 'persona_json': persona.persona_json}


@router.post("/{ml_persona_id}/exclude")
def exclude_ml_persona(
    ml_persona_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    ml_p = db.query(MLPersona).filter(MLPersona.id == ml_persona_id).first()
    if not ml_p:
        raise HTTPException(status_code=404, detail="ML persona not found")
    ml_p.status = 'excluded'
    if ml_p.persona_id:
        db.query(Persona).filter(Persona.id == ml_p.persona_id).delete()
        ml_p.persona_id = None
    db.commit()
    return {"status": "excluded"}


@router.put("/{ml_persona_id}")
def update_ml_persona(
    ml_persona_id: str,
    req: UpdateMLPersonaRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    ml_p = db.query(MLPersona).filter(MLPersona.id == ml_persona_id).first()
    if not ml_p:
        raise HTTPException(status_code=404, detail="ML persona not found")

    pj = dict(ml_p.persona_json or {})
    if req.persona_name is not None:
        pj['persona_name'] = req.persona_name
    if req.behavioral_interpretation is not None:
        pj['behavioral_interpretation'] = req.behavioral_interpretation
    ml_p.persona_json = pj
    # Reset to draft so user must re-approve after edits
    if ml_p.status == 'approved':
        ml_p.status = 'draft'
        if ml_p.persona_id:
            db.query(Persona).filter(Persona.id == ml_p.persona_id).delete()
            ml_p.persona_id = None
    db.commit()
    return {'id': ml_p.id, 'persona_json': ml_p.persona_json, 'status': ml_p.status}
