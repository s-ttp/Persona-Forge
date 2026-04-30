import os
from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session
from fastapi import Depends
from models import SessionLocal, Project
from utils.vector_store import search_project_themes
from auth import get_current_user

router = APIRouter(prefix="/reports", tags=["reports"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def _summarise_themes(project_id: str, themes_data: list, model: str = "claude") -> str:
    """Use LLM to synthesize raw theme quotes into a formatted research summary."""
    if model == "openai":
        from langchain_openai import ChatOpenAI
        llm = ChatOpenAI(model_name="gpt-4o-mini", openai_api_key=os.getenv("OPENAI_API_KEY"), temperature=0.3)
    else:
        from langchain_anthropic import ChatAnthropic
        llm = ChatAnthropic(model_name="claude-opus-4-7", anthropic_api_key=os.getenv("ANTHROPIC_API_KEY"))

    from langchain_core.messages import HumanMessage

    raw_quotes = "\n\n".join([f"- {d}" for d in themes_data[:30]])

    prompt = f"""You are a senior qualitative research analyst.
Synthesize the following verbatim interview excerpts into a concise, professional thematic research report.

Structure your report as:
1. Executive Summary (2-3 sentences)
2. Key Themes (3-5 themes with supporting quotes)
3. Notable Patterns
4. Implications for Research
5. Limitations

Interview Excerpts:
{raw_quotes}

Write in formal academic prose. Do NOT fabricate quotes or data not present above."""

    messages = [HumanMessage(content=prompt)]
    return llm.invoke(messages).content


@router.get("/{project_id}")
def generate_report(
    project_id: str,
    query: str = "main themes and findings",
    model: str = "claude",
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """Generate a thematic research report for a completed project using ChromaDB + LLM synthesis."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    results = search_project_themes(project_id, query_text=query, n_results=20)
    if not results or not results.get("documents"):
        raise HTTPException(status_code=404, detail="No interview data found for this project. Run interviews first.")

    documents = results["documents"][0] if results["documents"] else []
    report_text = _summarise_themes(project_id, documents, model=model)

    return {
        "project_id": project_id,
        "project_name": project.name,
        "query": query,
        "source_chunks": len(documents),
        "report": report_text
    }
