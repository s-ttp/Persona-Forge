import os
import json
import uuid
import time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from redis import Redis
from rq import Queue

from models import SessionLocal, Project, Persona, Interview, InterviewTurn, Questionnaire
from auth import get_current_user

router = APIRouter(prefix="/interviews", tags=["interviews"])

redis_conn = Redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/1"))
q = Queue("personaforge_queue", connection=redis_conn)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class RunInterviewRequest(BaseModel):
    project_id: str
    questionnaire_id: str
    interviewer_model: str = "openai"


def run_interview_job(interview_id: str, questionnaire_json: list, persona_json: dict,
                      interviewer_model: str, respondent_model: str):
    """Background job: run one full interview for one persona."""
    from models import SessionLocal, Interview, InterviewTurn
    from llm.interview_conductor import run_interview_turn, pick_random_respondent, generate_follow_up
    from utils.vector_store import store_interview_chunk

    db = SessionLocal()
    interview = db.query(Interview).filter(Interview.id == interview_id).first()
    if not interview:
        return

    # Idempotency guard — skip if already finished; allow failed to be retried
    if interview.status == "completed":
        db.close()
        return
    if interview.status == "running":
        from models import InterviewTurn as IT
        if db.query(IT).filter(IT.interview_id == interview_id).count() > 0:
            db.close()
            return

    # Clear any partial turns left from a previous failed attempt
    if interview.status == "failed":
        db.query(InterviewTurn).filter(InterviewTurn.interview_id == interview_id).delete()
        db.commit()
        interview.error_log = None

    if respondent_model == "random":
        key, _, _ = pick_random_respondent()
        respondent_model = key
        interview.respondent_model = key

    interview.status = "running"
    db.commit()

    def _run_turn_with_retry(**kwargs):
        """Call run_interview_turn with up to 3 retries on 429/overload errors."""
        for attempt in range(3):
            try:
                return run_interview_turn(**kwargs)
            except Exception as e:
                msg = str(e)
                if attempt < 2 and ("429" in msg or "overloaded" in msg.lower() or "rate" in msg.lower()):
                    time.sleep(10 * (attempt + 1))
                    continue
                raise

    history = []
    try:
        for turn_order, q_item in enumerate(questionnaire_json):
            result = _run_turn_with_retry(
                interviewer_model=interviewer_model,
                respondent_model=respondent_model,
                persona_json=json.dumps(persona_json),
                question=q_item["question_text"],
                history=history
            )

            turn = InterviewTurn(
                interview_id=interview_id,
                question_id=q_item.get("question_id", str(uuid.uuid4())),
                question_text=result["asked_question"],
                response_text=result["answer"],
                reasoning_trace=result.get("reasoning_trace"),
                turn_order=turn_order
            )
            db.add(turn)
            db.commit()

            try:
                store_interview_chunk(
                    project_id=interview.project_id,
                    participant_id=interview.persona_id,
                    question_id=q_item.get("question_id", "q"),
                    text=result["answer"]
                )
            except Exception as embed_err:
                print(f"[embedding] non-fatal: {embed_err}")

            history.append({"role": "interviewer", "content": result["asked_question"]})
            history.append({"role": "respondent",  "content": result["answer"]})

            # ── Optional follow-up if answer needs clarification ──────────────
            follow_up_q = generate_follow_up(
                original_question=q_item["question_text"],
                answer=result["answer"],
                interviewer_model=interviewer_model
            )
            if follow_up_q:
                fu_result = _run_turn_with_retry(
                    interviewer_model=interviewer_model,
                    respondent_model=respondent_model,
                    persona_json=json.dumps(persona_json),
                    question=follow_up_q,
                    history=history
                )
                fu_turn = InterviewTurn(
                    interview_id=interview_id,
                    question_id=q_item.get("question_id", str(uuid.uuid4())) + "_followup",
                    question_text="[Follow-up] " + fu_result["asked_question"],
                    response_text=fu_result["answer"],
                    reasoning_trace=fu_result.get("reasoning_trace"),
                    turn_order=turn_order * 10 + 5
                )
                db.add(fu_turn)
                db.commit()
                history.append({"role": "interviewer", "content": fu_result["asked_question"]})
                history.append({"role": "respondent",  "content": fu_result["answer"]})

        interview.status = "completed"
    except Exception as e:
        interview.status = "failed"
        interview.error_log = str(e)
    finally:
        db.commit()
        db.close()


@router.post("/run")
def run_interviews(
    req: RunInterviewRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """Enqueue interviews for all pre-created personas in a project."""
    project = db.query(Project).filter(Project.id == req.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    q_obj = db.query(Questionnaire).filter(Questionnaire.id == req.questionnaire_id).first()
    if not q_obj:
        raise HTTPException(status_code=404, detail="Questionnaire not found")

    personas = db.query(Persona).filter(Persona.project_id == req.project_id).all()
    if len(personas) < 2:
        raise HTTPException(status_code=400, detail="At least 2 personas are required before running interviews")
    if len(personas) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 personas per project")

    questionnaire_json = q_obj.questions_json
    interview_ids = []

    for persona in personas:
        interview = Interview(
            project_id=req.project_id,
            persona_id=persona.id,
            questionnaire_id=req.questionnaire_id,
            interviewer_model=req.interviewer_model,
            respondent_model="random",
            status="queued"
        )
        db.add(interview)
        db.commit()
        db.refresh(interview)

        q.enqueue(
            run_interview_job,
            interview.id,
            questionnaire_json,
            persona.persona_json,
            req.interviewer_model,
            "random",
            job_timeout=3600
        )
        interview_ids.append(interview.id)

    return {"message": f"Queued {len(personas)} interviews", "interview_ids": interview_ids}


@router.get("/status/{project_id}")
def get_project_interview_status(
    project_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    interviews = db.query(Interview).filter(Interview.project_id == project_id).all()
    return [
        {
            "id": iv.id,
            "persona_id": iv.persona_id,
            "status": iv.status,
            "interviewer_model": iv.interviewer_model,
            "respondent_model": iv.respondent_model,
            "turn_count": db.query(InterviewTurn).filter(InterviewTurn.interview_id == iv.id).count()
        }
        for iv in interviews
    ]


@router.post("/requeue/{project_id}")
def requeue_stuck_interviews(
    project_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """Re-enqueue any queued or stuck-running interviews for a project."""
    from datetime import datetime, timedelta
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    stuck_cutoff = datetime.utcnow() - timedelta(minutes=15)
    stuck = db.query(Interview).filter(
        Interview.project_id == project_id,
        Interview.status.in_(["queued", "running", "failed"])
    ).all()

    requeued = []
    for iv in stuck:
        if iv.status == "running" and iv.started_at and iv.started_at > stuck_cutoff:
            continue  # still plausibly running
        q_obj = db.query(Questionnaire).filter(Questionnaire.id == iv.questionnaire_id).first()
        persona = db.query(Persona).filter(Persona.id == iv.persona_id).first()
        if not q_obj or not persona:
            iv.status = "failed"
            iv.error_log = "Missing questionnaire or persona"
            db.commit()
            continue
        iv.status = "queued"
        db.commit()
        q.enqueue(
            run_interview_job,
            iv.id,
            q_obj.questions_json,
            persona.persona_json,
            iv.interviewer_model,
            iv.respondent_model or "random",
            job_timeout=3600
        )
        requeued.append(iv.id)

    return {"requeued": len(requeued), "interview_ids": requeued}


@router.get("/transcript/{interview_id}")
def get_transcript(
    interview_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    interview = db.query(Interview).filter(Interview.id == interview_id).first()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    project = db.query(Project).filter(Project.id == interview.project_id).first()
    if not project:
        raise HTTPException(status_code=403, detail="Access denied")

    turns = db.query(InterviewTurn).filter(InterviewTurn.interview_id == interview_id).order_by(InterviewTurn.turn_order).all()
    return [
        {
            "question_id": t.question_id,
            "question": t.question_text,
            "answer": t.response_text,
            "has_reasoning": t.reasoning_trace is not None
        }
        for t in turns
    ]
