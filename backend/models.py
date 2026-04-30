import uuid
from datetime import datetime
from sqlalchemy import create_engine, Column, String, Integer, Float, DateTime, Boolean, ForeignKey, JSON, Text
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./senti_db.sqlite"
    REDIS_URL: str = "redis://localhost:6379/1"
    SECRET_KEY: str = "change-me"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

Base = declarative_base()

class Project(Base):
    __tablename__ = 'projects'
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_user_id = Column(String, index=True)
    name = Column(String)
    description = Column(String, nullable=True)
    project_type = Column(String)  # 'new_survey' or 'validation_study'
    status = Column(String, default="draft")
    participant_target = Column(Integer, default=50)
    participant_completed = Column(Integer, default=0)
    persona_envelope = Column(JSON, nullable=True)  # envelope constraints for persona gen
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ProjectFile(Base):
    __tablename__ = 'project_files'
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey('projects.id'))
    file_type = Column(String)
    filename = Column(String)
    storage_path = Column(String)
    parsed_text = Column(Text, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

class Questionnaire(Base):
    __tablename__ = 'questionnaires'
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey('projects.id'))
    version = Column(Integer, default=1)
    questions_json = Column(JSON)  # list of question dicts
    created_at = Column(DateTime, default=datetime.utcnow)

class Persona(Base):
    __tablename__ = 'personas'
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=True, index=True)
    project_id = Column(String, ForeignKey('projects.id'), nullable=True)
    is_library = Column(Boolean, default=False)
    participant_id = Column(String, index=True, default=lambda: str(uuid.uuid4()))
    persona_json = Column(JSON)
    generation_model = Column(String, nullable=True)
    persona_seed = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Interview(Base):
    __tablename__ = 'interviews'
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey('projects.id'))
    persona_id = Column(String, ForeignKey('personas.id'))
    questionnaire_id = Column(String, ForeignKey('questionnaires.id'), nullable=True)
    interviewer_model = Column(String)
    respondent_model = Column(String)
    status = Column(String, default="queued")  # queued / running / completed / failed
    error_log = Column(Text, nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

class InterviewTurn(Base):
    __tablename__ = 'interview_turns'
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    interview_id = Column(String, ForeignKey('interviews.id'))
    question_id = Column(String, nullable=True)
    question_text = Column(Text, nullable=True)
    response_text = Column(Text, nullable=True)
    reasoning_trace = Column(Text, nullable=True)  # Kimi K2.5 thinking trace
    turn_order = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class StructuredAnswer(Base):
    __tablename__ = 'structured_answers'
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    interview_id = Column(String, ForeignKey('interviews.id'))
    participant_id = Column(String)
    question_id = Column(String)
    answer_summary = Column(String)
    verbatim_quote = Column(String)
    themes_json = Column(JSON)
    sentiment = Column(String)
    confidence = Column(String)
    not_sure = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class DatasetUpload(Base):
    __tablename__ = 'dataset_uploads'
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey('projects.id'))
    user_id = Column(String)
    original_filename = Column(String)
    storage_path = Column(String)
    row_count = Column(Integer, nullable=True)
    column_count = Column(Integer, nullable=True)
    column_profiles = Column(JSON, nullable=True)
    status = Column(String, default='uploaded')  # uploaded / profiled / segmenting / ready / failed
    error_log = Column(Text, nullable=True)
    n_clusters_used = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class MLPersona(Base):
    __tablename__ = 'ml_personas'
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey('projects.id'))
    dataset_id = Column(String, ForeignKey('dataset_uploads.id'))
    cluster_id = Column(Integer)
    persona_json = Column(JSON)
    cluster_size = Column(Integer)
    cluster_percentage = Column(Float)
    confidence_score = Column(Float)
    status = Column(String, default='draft')  # draft / approved / excluded
    persona_id = Column(String, nullable=True)  # points to personas.id after approval
    created_at = Column(DateTime, default=datetime.utcnow)


engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)
    _migrate()

def _migrate():
    """Add new columns to existing tables without dropping data."""
    with engine.connect() as conn:
        existing = {row[1] for row in conn.execute(
            __import__("sqlalchemy").text("PRAGMA table_info(personas)")
        )}
        if "user_id" not in existing:
            conn.execute(__import__("sqlalchemy").text(
                "ALTER TABLE personas ADD COLUMN user_id TEXT"
            ))
        if "is_library" not in existing:
            conn.execute(__import__("sqlalchemy").text(
                "ALTER TABLE personas ADD COLUMN is_library INTEGER DEFAULT 0"
            ))
        conn.commit()
