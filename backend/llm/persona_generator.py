import os
from langchain_core.prompts import PromptTemplate
from langchain_anthropic import ChatAnthropic
from langchain_core.output_parsers import JsonOutputParser

def generate_persona(envelope_config: dict) -> dict:
    """Generate a high-fidelity synthetic participant persona using claude-opus-4-7."""
    llm = ChatAnthropic(model_name="claude-opus-4-7", anthropic_api_key=os.getenv("ANTHROPIC_API_KEY"))
    parser = JsonOutputParser()

    prompt = PromptTemplate(
        template="""You are a research-grade persona generator for synthetic survey interviews.

Your task is to create one realistic participant persona based on the provided persona envelope.
Do not create a generic person. Do not make the persona too perfect.
Include human variation, mild contradictions, preferences, limitations, and realistic uncertainty.

Envelope Constraints:
Industry: {industry}
Role Profile: {role_profile}
Age Range: {age}
Sex/Gender: {sex}
Region: {region}
Seniority: {seniority}

Output strictly valid JSON with the following fields ONLY:
- participant_id (a generated ID string)
- industry
- role_profile
- age (exact int)
- sex
- education
- work_experience
- seniority
- region
- domain_knowledge (High/Medium/Low)
- background (short bio)
- personality (dict of traits: directness, skepticism 0-1, confidence 0-1, etc.)
- survey_behavior (dict: answer_length, probe_responsiveness, fatigue_level 0-1)
- likely_biases (array of strings)
- knowledge_boundaries (short text on what they DO NOT know)

Respond only with the raw valid JSON. {format_instructions}""",
        input_variables=["industry", "role_profile", "age", "sex", "region", "seniority"],
        partial_variables={"format_instructions": parser.get_format_instructions()},
    )

    try:
        return (prompt | llm | parser).invoke({
            "industry":     envelope_config.get("industry",    "Technology"),
            "role_profile": envelope_config.get("role_profile","Software Engineer"),
            "age":          envelope_config.get("age",         "25-35"),
            "sex":          envelope_config.get("sex",         "Any"),
            "region":       envelope_config.get("region",      "Global"),
            "seniority":    envelope_config.get("seniority",   "Mid-level"),
        })
    except Exception as e:
        print(f"Failed generating persona: {e}")
        return {}
