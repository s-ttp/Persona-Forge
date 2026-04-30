import os
import re
import tempfile
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from models import SessionLocal, Project, Interview, InterviewTurn, Persona
from auth import get_current_user
from utils.vector_store import search_project_themes
from utils.parser import process_file_to_text
from utils.document_builder import (
    build_transcripts_html, build_transcripts_docx,
    build_report_html, build_report_docx,
)


def _clean_text(text: str) -> str:
    """Strip stage directions and roleplay artifacts from stored answers."""
    text = re.sub(r'\*[^*\n]+\*', '', text)
    text = re.sub(r'\([^)\n]{1,40}\)', '', text)
    text = re.sub(r'[ \t]{2,}', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _generate_interview_summaries(interviews: list) -> list:
    """Return a 2-3 sentence summary for each interview using a fast LLM."""
    from langchain_anthropic import ChatAnthropic
    from langchain_core.messages import HumanMessage

    llm = ChatAnthropic(
        model_name="claude-haiku-4-5-20251001",
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY"),
        max_tokens=200,
    )

    summaries = []
    for iv in interviews:
        persona = iv.get("persona", {})
        name = persona.get("name", "Participant")
        occupation = persona.get("occupation", "")
        region = persona.get("region", "")
        turns = iv.get("turns", [])

        if not turns:
            summaries.append("")
            continue

        qa_text = "\n".join(
            f"Q: {t['question']}\nA: {t['answer']}"
            for t in turns[:6]
        )

        prompt = (
            f"Write a 2-3 sentence summary of this interview with {name} "
            f"({occupation}, {region}). Capture their key perspectives and most "
            f"notable points in third person. Be specific and substantive — no filler.\n\n"
            f"{qa_text}"
        )

        try:
            summary = llm.invoke([HumanMessage(content=prompt)]).content.strip()
        except Exception:
            summary = ""
        summaries.append(summary)

    return summaries

router = APIRouter(prefix="/output", tags=["output"])

MAX_REF_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".txt", ".csv", ".json"}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _get_interview_excerpts(project_id: str, db: Session) -> list[str]:
    """
    Return answer texts for a project.  Tries ChromaDB first for semantic
    relevance; falls back to reading all InterviewTurn rows from SQLite so
    the endpoints work even when the vector store is empty or unreachable.
    """
    try:
        results = search_project_themes(project_id, "main themes findings insights patterns", n_results=30)
        docs = (results.get("documents") or [[]])[0]
        if docs:
            return docs
    except Exception:
        pass  # ChromaDB/embedding failure — fall through to SQLite

    # SQLite fallback — collect every non-empty answer across completed/running interviews
    interviews = (
        db.query(Interview)
        .filter(Interview.project_id == project_id, Interview.status.in_(["completed", "running"]))
        .all()
    )
    texts = []
    for iv in interviews:
        turns = (
            db.query(InterviewTurn)
            .filter(InterviewTurn.interview_id == iv.id)
            .order_by(InterviewTurn.turn_order)
            .all()
        )
        for t in turns:
            if t.response_text and t.response_text.strip():
                texts.append(t.response_text.strip())
    return texts


def _file_response(content: bytes, media_type: str, filename: str) -> Response:
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _render(fmt: str, title: str, subtitle: str, body: str, filename_stem: str) -> Response:
    if fmt == "docx":
        return _file_response(
            build_report_docx(title, subtitle, body),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            f"{filename_stem}.docx",
        )
    # default: html
    return _file_response(
        build_report_html(title, subtitle, body),
        "text/html",
        f"{filename_stem}.html",
    )


@router.get("/{project_id}/transcripts")
def download_transcripts(
    project_id: str,
    format: str = Query(default="html", pattern="^(html|docx)$"),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    interviews = db.query(Interview).filter(Interview.project_id == project_id).all()
    if not interviews:
        raise HTTPException(status_code=404, detail="No interviews found for this project")

    records = []
    for iv in interviews:
        turns = (
            db.query(InterviewTurn)
            .filter(InterviewTurn.interview_id == iv.id)
            .order_by(InterviewTurn.turn_order)
            .all()
        )
        persona = db.query(Persona).filter(Persona.id == iv.persona_id).first()
        records.append({
            "persona": persona.persona_json if persona else {},
            "turns": [
                {
                    "turn": t.turn_order,
                    "question": t.question_text,
                    "answer": _clean_text(t.response_text or ""),
                }
                for t in turns
            ],
        })

    summaries = _generate_interview_summaries(records)
    for rec, summary in zip(records, summaries):
        rec["summary"] = summary

    stem = f"transcripts_{project.name.replace(' ', '_')}"
    if format == "docx":
        return _file_response(
            build_transcripts_docx(project.name, records),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            f"{stem}.docx",
        )
    return _file_response(
        build_transcripts_html(project.name, records),
        "text/html",
        f"{stem}.html",
    )


@router.get("/{project_id}/insights")
def get_insights(
    project_id: str,
    format: str = Query(default="html", pattern="^(html|docx)$"),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    documents = _get_interview_excerpts(project_id, db)
    if not documents:
        raise HTTPException(status_code=404, detail="No interview data found. Run interviews first.")

    raw_quotes = "\n\n".join([f"- {d}" for d in documents[:40]])

    from langchain_anthropic import ChatAnthropic
    from langchain_core.messages import HumanMessage

    llm = ChatAnthropic(
        model_name="claude-sonnet-4-6",
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY"),
    )

    prompt = f"""You are a senior qualitative research analyst.
Synthesize the following verbatim interview excerpts into a structured key insights report.

Structure your report as:
1. Executive Summary (2-3 sentences)
2. Key Themes (3-5 themes with supporting quotes)
3. Notable Patterns
4. Implications for Research
5. Limitations

Interview Excerpts:
{raw_quotes}

Write in formal academic prose. Do NOT fabricate quotes or data not present above."""

    report_text = llm.invoke([HumanMessage(content=prompt)]).content
    stem = f"insights_{project.name.replace(' ', '_')}"
    return _render(
        format,
        title=f"Key Insights — {project.name}",
        subtitle=f"AI-synthesized thematic analysis · {len(documents)} interview excerpts",
        body=report_text,
        filename_stem=stem,
    )


@router.post("/{project_id}/correlate")
async def correlate_with_reference(
    project_id: str,
    file: UploadFile = File(...),
    format: str = Query(default="html", pattern="^(html|docx)$"),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    content = await file.read(MAX_REF_FILE_SIZE + 1)
    if len(content) > MAX_REF_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")

    safe_name = os.path.basename(file.filename or "reference")
    ext = os.path.splitext(safe_name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type '{ext}' not allowed")

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        reference_text = process_file_to_text(tmp_path)
    finally:
        os.unlink(tmp_path)

    documents = _get_interview_excerpts(project_id, db)
    if not documents:
        raise HTTPException(status_code=404, detail="No interview data found. Run interviews first.")

    raw_quotes = "\n\n".join([f"- {d}" for d in documents[:40]])

    from langchain_anthropic import ChatAnthropic
    from langchain_core.messages import HumanMessage

    llm = ChatAnthropic(
        model_name="claude-sonnet-4-6",
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY"),
    )

    prompt = f"""You are a senior qualitative research analyst.

You have been provided with:
1. Verbatim excerpts from synthetic participant interviews
2. A reference document

Identify correlations, validate or challenge the reference document's claims using the interview evidence, and draw conclusions.

Reference Document:
{reference_text[:3000]}

Interview Excerpts:
{raw_quotes}

Structure your analysis as:
1. Key Correlations (where interview evidence aligns with the reference)
2. Contradictions / Tensions (where interviews diverge from reference claims)
3. Novel Insights (themes in interviews not addressed in the reference)
4. Conclusions & Recommendations

Be specific. Cite interview excerpts where relevant. Do not fabricate data."""

    analysis_text = llm.invoke([HumanMessage(content=prompt)]).content
    stem = f"correlation_{project.name.replace(' ', '_')}"
    return _render(
        format,
        title=f"Reference Correlation — {project.name}",
        subtitle=f"Interview data correlated against: {safe_name}",
        body=analysis_text,
        filename_stem=stem,
    )
