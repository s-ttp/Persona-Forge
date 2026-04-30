import json
import os
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

_SYS = """You are a market research analyst specializing in customer segmentation.

Convert a statistical cluster summary into a behavioral customer persona for use in synthetic research interviews.

Rules:
- Do NOT invent unsupported demographics (age, name, gender, location) unless clearly implied by the data signals
- Do NOT expose raw statistical values, cluster IDs, or ML terminology in the output
- Represent a customer SEGMENT, not an individual
- Translate statistical signals into realistic behavioral patterns and attitudes
- persona_name must be a descriptive behavioral label (e.g. "High-Usage Value Seekers"), NOT a person's name
- All list fields must have 2–5 items each

Output ONLY a valid JSON object with exactly these keys:
persona_name, dominant_signals (list of strings), latent_features (object of key:value strings),
behavioral_interpretation (string), likely_needs (list), likely_pain_points (list),
purchase_drivers (list), knowledge_boundaries (list)"""


def generate_ml_persona(cluster_summary: dict) -> dict:
    """Convert cluster explanation dict to behavioral persona JSON via LLM."""
    prompt = (
        f"Cluster size: {cluster_summary['cluster_size']} customers "
        f"({cluster_summary['cluster_percentage']}% of dataset)\n"
        f"Dominant signals: {cluster_summary['dominant_signals']}\n"
        f"Latent features: {json.dumps(cluster_summary['latent_features'])}\n"
        f"Clustering confidence: {cluster_summary['confidence_score']}\n\n"
        "Output ONLY valid JSON, no markdown fences."
    )
    try:
        llm = ChatOpenAI(
            model_name="gpt-4o-mini",
            openai_api_key=os.getenv("OPENAI_API_KEY"),
            temperature=0.6,
        )
        text = llm.invoke([
            SystemMessage(content=_SYS),
            HumanMessage(content=prompt),
        ]).content.strip()

        if text.startswith("```"):
            parts = text.split("```")
            text = parts[1].lstrip("json").strip() if len(parts) > 1 else text
        return json.loads(text)

    except Exception:
        signals = cluster_summary.get('dominant_signals', [])
        return {
            'persona_name': f"Segment {cluster_summary['cluster_id'] + 1}",
            'dominant_signals': signals,
            'latent_features': cluster_summary.get('latent_features', {}),
            'behavioral_interpretation': (
                f"Customer segment with {len(signals)} distinct behavioral signals"
            ),
            'likely_needs': [],
            'likely_pain_points': [],
            'purchase_drivers': [],
            'knowledge_boundaries': [],
        }
