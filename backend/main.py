import os
import json
import hashlib
from contextlib import asynccontextmanager
from pathlib import Path
import secrets
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from models import init_db
from auth import oauth2_scheme, active_tokens, get_current_user

from routes.projects import router as projects_router
from routes.interviews import router as interviews_router
from routes.reports import router as reports_router
from routes.output import router as output_router
from routes.personas import router as personas_router
from routes.datasets import router as datasets_router
from routes.ml_personas import router as ml_personas_router

def _recover_queued_interviews():
    """Re-enqueue any interviews stuck in 'queued' state (e.g. after a restart)."""
    from models import SessionLocal, Interview, Questionnaire, Persona
    from routes.interviews import q as rq, run_interview_job
    from datetime import datetime, timedelta
    db = SessionLocal()
    stuck_cutoff = datetime.utcnow() - timedelta(minutes=15)
    try:
        stuck = db.query(Interview).filter(
            Interview.status.in_(["queued", "running"]),
        ).all()
        stuck = [iv for iv in stuck if iv.status == "queued" or (iv.started_at and iv.started_at < stuck_cutoff)]
        for iv in stuck:
            q_obj = db.query(Questionnaire).filter(Questionnaire.id == iv.questionnaire_id).first()
            persona = db.query(Persona).filter(Persona.id == iv.persona_id).first()
            if not q_obj or not persona:
                iv.status = "failed"
                iv.error_log = "Missing questionnaire or persona during recovery"
                db.commit()
                continue
            rq.enqueue(
                run_interview_job,
                iv.id,
                q_obj.questions_json,
                persona.persona_json,
                iv.interviewer_model,
                iv.respondent_model or "random",
                job_timeout=3600
            )
            print(f"↩️  Re-enqueued stuck interview {iv.id}")
        db.commit()
    except Exception as e:
        print(f"⚠️  Interview recovery error: {e}")
    finally:
        db.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _restore_tokens()
    _recover_queued_interviews()
    print("✅ Database initialized")
    print("✅ Virtual Survey Platform API started on port 5000")
    yield

app = FastAPI(title="Virtual Survey Platform", version="1.0.0", lifespan=lifespan, redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Auth ─────────────────────────────────────────────────────────────────────
USERS_FILE = Path(__file__).parent / "users.json"
TOKENS_FILE = Path(__file__).parent / "tokens.json"

def _load_users() -> dict:
    if not USERS_FILE.exists():
        USERS_FILE.write_text(json.dumps({}, indent=2))
    return json.loads(USERS_FILE.read_text())

def _save_users(users: dict):
    USERS_FILE.write_text(json.dumps(users, indent=2))

def _load_tokens() -> dict:
    if not TOKENS_FILE.exists():
        return {}
    try:
        return json.loads(TOKENS_FILE.read_text())
    except Exception:
        return {}

def _save_tokens(tokens: dict):
    TOKENS_FILE.write_text(json.dumps(tokens, indent=2))

def _restore_tokens():
    """Reload persisted tokens into the in-memory dict on startup."""
    saved = _load_tokens()
    active_tokens.update(saved)

class LoginRequest(BaseModel):
    email: str
    password: str

@app.post("/auth/login")
def login(req: LoginRequest):
    if not req.email or not req.password:
        raise HTTPException(status_code=400, detail="Email and password required")

    users = _load_users()
    user = users.get(req.email)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    pw_hash = hashlib.sha256(req.password.encode()).hexdigest()
    if pw_hash != user["password_hash"]:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = secrets.token_hex(32)
    active_tokens[token] = user
    saved = _load_tokens()
    saved[token] = user
    _save_tokens(saved)

    return {"token": token, "email": user["email"], "role": user["role"]}

@app.get("/auth/me")
def me(user: dict = Depends(get_current_user)):
    return {"email": user["email"], "role": user["role"], "id": user["id"]}

# ─── Health ───────────────────────────────────────────────────────────────────
@app.get("/")
def read_root():
    return {"status": "ok", "message": "Virtual Survey Platform API is running", "version": "1.0.0"}

@app.get("/health")
def health():
    return {"status": "healthy"}

# ─── Register Routers ─────────────────────────────────────────────────────────
app.include_router(projects_router, dependencies=[Depends(get_current_user)])
app.include_router(interviews_router, dependencies=[Depends(get_current_user)])
app.include_router(reports_router, dependencies=[Depends(get_current_user)])
app.include_router(output_router, dependencies=[Depends(get_current_user)])
app.include_router(personas_router, dependencies=[Depends(get_current_user)])
app.include_router(datasets_router, dependencies=[Depends(get_current_user)])
app.include_router(ml_personas_router, dependencies=[Depends(get_current_user)])

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)
