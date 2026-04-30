import os
import json
from langchain_core.prompts import PromptTemplate
from langchain_anthropic import ChatAnthropic
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field
from typing import List

class QuestionnaireItem(BaseModel):
    question_id: str = Field(description="Unique identifier (e.g. Q1, Q2)")
    question_text: str = Field(description="The exact text of the question")
    question_type: str = Field(description="Type of question (e.g., open_ended, multiple_choice)")
    probe_allowed: bool = Field(description="Whether follow-up probes are allowed for this question")
    mandatory: bool = Field(description="Whether a response to this question is mandatory")

class QuestionnaireStructured(BaseModel):
    items: List[QuestionnaireItem]

def get_llm():
    key = os.getenv("ANTHROPIC_API_KEY")
    return ChatAnthropic(model_name="claude-sonnet-4-6", anthropic_api_key=key)

def extract_questionnaire_from_text(raw_text: str) -> list[dict]:
    """Parse raw survey text into structured JSON list using LLM."""
    parser = JsonOutputParser(pydantic_object=QuestionnaireStructured)
    llm = get_llm()

    prompt = PromptTemplate(
        template="""You are an expert market research assistant.
Extract the survey questions from the following raw document text and format them strictly into a structured list.
If 'probe_allowed' or 'mandatory' are not explicitly stated, assume True for mandatory and True for open-ended probes.

Document Text:
{raw_text}

{format_instructions}""",
        input_variables=["raw_text"],
        partial_variables={"format_instructions": parser.get_format_instructions()},
    )

    chain = prompt | llm | parser

    try:
        result = chain.invoke({"raw_text": raw_text})
        return result.get("items", [])
    except Exception as e:
        print(f"Failed extracting questionnaire: {e}")
        return []

def generate_questions_from_context(context_text: str) -> list[dict]:
    """Generate survey questions from a background/context document using LLM."""
    parser = JsonOutputParser(pydantic_object=QuestionnaireStructured)
    llm = get_llm()

    prompt = PromptTemplate(
        template="""You are an expert market research assistant.
Based on the following background document, generate a comprehensive set of survey questions that would help gather insights relevant to the topics, themes, and objectives described.
Generate between 8 and 15 focused, open-ended questions. Assign each a unique question ID (Q1, Q2, etc.).
Set probe_allowed to true and mandatory to true for all generated questions.

Background Document:
{raw_text}

{format_instructions}""",
        input_variables=["raw_text"],
        partial_variables={"format_instructions": parser.get_format_instructions()},
    )

    chain = prompt | llm | parser

    try:
        result = chain.invoke({"raw_text": context_text})
        return result.get("items", [])
    except Exception as e:
        print(f"Failed generating questions from context: {e}")
        return []
