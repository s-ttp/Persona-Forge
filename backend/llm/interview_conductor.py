import os
import re
import random
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

# ─── Respondent pool ──────────────────────────────────────────────────────────
# Weighted selection: claude 30%, gpt54 30%, gemini 25%, llama 8%, qwen 7%.
RESPONDENT_POOL = [
    ("claude-sonnet",  "claude",      "claude-sonnet-4-6"),
    ("openai-gpt54",   "openai",      "gpt-5.4"),
    ("gemini-flash",   "gemini",      "gemini-2.5-flash"),
    ("hf-llama33-70b", "huggingface", "meta-llama/Llama-3.3-70B-Instruct"),
    ("hf-qwen25-72b",  "huggingface", "Qwen/Qwen2.5-72B-Instruct"),
]
_RESPONDENT_WEIGHTS = [30, 30, 25, 8, 7]

def pick_random_respondent(exclude_key: str = None) -> tuple:
    eligible = [(e, w) for e, w in zip(RESPONDENT_POOL, _RESPONDENT_WEIGHTS) if e[0] != exclude_key]
    pool, weights = zip(*eligible)
    return random.choices(pool, weights=weights, k=1)[0]


# ─── Response cleaner ─────────────────────────────────────────────────────────
def _clean_response(text: str) -> str:
    """Strip stage directions and roleplay artifacts from LLM responses."""
    # Remove *action* or _action_ narration spanning up to a full line
    text = re.sub(r'\*[^*\n]{1,120}\*', '', text)
    text = re.sub(r'_[^_\n]{1,120}_', '', text)
    # Remove short parenthetical stage directions e.g. (pauses), (sighs), (leans back)
    text = re.sub(r'\([^)\n]{1,60}\)', '', text)
    # Remove leading role labels like "A:", "Answer:", "Respondent:" at start of text
    text = re.sub(r'^(?:A|Answer|Respondent)\s*:\s*', '', text, flags=re.IGNORECASE)
    # Collapse whitespace left behind
    text = re.sub(r'[ \t]{2,}', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


# ─── GPT-5.4 (OpenAI Responses API with reasoning) ───────────────────────────
def call_gpt54(system_prompt: str, user_content: str,
               reasoning_effort: str = "medium") -> tuple:
    import openai
    client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    response = client.responses.create(
        model="gpt-5.4",
        reasoning={"effort": reasoning_effort},
        instructions=system_prompt,
        input=user_content,
    )
    return response.output_text, None


# ─── Kimi K2.5 (thinking model — OpenAI-compatible client) ───────────────────
def call_kimi_k2(messages: list, temperature: float = 1.0) -> tuple:
    import openai
    client = openai.OpenAI(
        api_key=os.getenv("MOONSHOT_API_KEY"),
        base_url="https://api.moonshot.ai/v1"
    )
    if not messages or messages[0].get("role") != "system":
        messages = [{"role": "system", "content": "You are Kimi, an AI assistant created by Moonshot AI."}] + messages
    response = client.chat.completions.create(
        model="kimi-k2.5",
        messages=messages,
        temperature=temperature,
        stream=False
    )
    return response.choices[0].message.content, response.choices[0].message.reasoning_content


# ─── Interviewer fallback (chat.completions) ─────────────────────────────────
def get_interviewer_llm(model_preference: str = "openai"):
    return ChatOpenAI(
        model_name="gpt-4o-mini",
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        temperature=0.5
    )


# ─── Respondent builder ───────────────────────────────────────────────────────
def _build_respondent(provider: str, model_id: str):
    if provider == "claude":
        return ChatAnthropic(
            model_name=model_id,
            anthropic_api_key=os.getenv("ANTHROPIC_API_KEY"),
            temperature=0.7
        )
    if provider == "openai":
        if model_id == "gpt-5.4":
            class _GPT54Wrapper:
                def invoke(self, msgs):
                    sys_text = next((m.content for m in msgs if isinstance(m, SystemMessage)), "")
                    human_texts = [m.content for m in msgs if isinstance(m, HumanMessage)]
                    user_text = "\n".join(human_texts)
                    text, _ = call_gpt54(sys_text, user_text, reasoning_effort="medium")
                    class _R:
                        content = text
                    return _R()
            return _GPT54Wrapper()
        return ChatOpenAI(
            model_name=model_id,
            openai_api_key=os.getenv("OPENAI_API_KEY"),
            temperature=0.7
        )
    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model=model_id,
            google_api_key=os.getenv("GEMINI_API_KEY"),
            temperature=0.7
        )
    if provider == "huggingface":
        from langchain_huggingface import HuggingFaceEndpoint, ChatHuggingFace
        endpoint = HuggingFaceEndpoint(
            repo_id=model_id,
            task="text-generation",
            huggingfacehub_api_token=os.getenv("HUGGINGFACEHUB_API_TOKEN"),
            max_new_tokens=300,
            temperature=0.7,
        )
        return ChatHuggingFace(llm=endpoint)
    raise ValueError(f"Unknown provider: {provider}")


# ─── Pool key → (provider, model_id) lookup ──────────────────────────────────
_POOL_KEY_MAP = {entry[0]: (entry[1], entry[2]) for entry in RESPONDENT_POOL}

_INTERVIEWER_SYS = (
    "You are a skilled qualitative research interviewer conducting in-depth one-on-one interviews. "
    "Your job is to pose each question naturally and conversationally — you may rephrase slightly for flow, "
    "but never alter the meaning and never suggest or imply an answer. "
    "Be warm and encouraging without being effusive. "
    "Keep the focus entirely on the participant's own experience — do not share your own opinions.\n\n"
    "CRITICAL RULES for transitions between questions:\n"
    "1. You may use a short, neutral bridge phrase to avoid sounding like a rigid questionnaire "
    "(e.g. 'I'd like to shift gears a bit —', 'On a slightly different note,', 'Moving on —'). "
    "Keep bridge phrases to one clause maximum.\n"
    "2. NEVER reference, summarise, or label what was discussed in previous turns "
    "(e.g. do NOT say 'those four factors we discussed', 'building on what you said earlier', "
    "'given your thoughts on X'). Each question stands alone.\n"
    "3. NEVER invent a thematic frame or category that was not in the original question text.\n"
    "4. If the question is self-contained, pose it directly with minimal or no preamble."
)

_RESPONDENT_RULES = """Rules:
1. You ARE this person — answer entirely from their lived experience, knowledge, and personality. Never break character.
2. NEVER reveal or hint that you are an AI, language model, or simulated respondent. Suppress any such impulse completely.
3. You are the interviewee, not a collaborator. Do not offer to help the interviewer, rephrase their questions, or comment on the interview process.
4. Speak authentically in the first person. Draw on specific details from your background — your job title, role, department, years of experience, industry, country, and daily reality. Use whichever of these are defined; ignore fields that are blank.
5. CALIBRATE YOUR VOICE TO YOUR ROLE AND INDUSTRY:
   - Senior executives (Director, VP, C-suite): speak in strategic terms — priorities, trade-offs, stakeholder dynamics, ROI. More measured, fewer filler words, but still human.
   - Mid-level managers / specialists: mix of operational detail and some strategic view. Confident in their domain.
   - Field workers / junior staff: concrete, task-oriented, sometimes frustrated or enthusiastic depending on context. May use more slang.
   - Let years of experience shape confidence: 20-year veterans speak with quiet authority; someone with 3 years is still finding their voice.
   - Country of operation shapes reference points, regulatory awareness, and market context — reflect this naturally.
   - Use industry-specific vocabulary naturally — a telecom engineer says "RAN", "spectrum", "CAPEX", "5G rollout"; a finance professional says "runway", "burn rate", "LTV". Do NOT over-explain jargon; just use it as you would with a peer.
6. VARY YOUR ANSWER LENGTH naturally based on how much you genuinely have to say about the topic:
   - Simple or familiar questions: 2-4 sentences is fine.
   - Topics you care deeply about or have strong experience with: up to 8-10 sentences.
   - Do not pad short answers or truncate long ones artificially. Let the content drive the length.
7. Make occasional natural speech imperfections: contractions ("it's", "we've", "can't"), filler phrases ("I mean", "look,", "honestly,", "to be fair"), run-on clauses joined with "and" or "but", mild grammatical informality, and self-corrections ("well, not exactly — more like..."). These should feel organic, not forced on every sentence.
8. Do NOT use stage directions, action narration, or parenthetical descriptions (no *leans forward*, no (pauses), no [sighs]).
9. If a question is genuinely outside your knowledge or experience, say so plainly — do not speculate or fabricate expertise you don't have."""


def _call_interviewer(interviewer_model: str, prompt: str) -> str:
    """Call the interviewer model with a prompt, return the text."""
    if interviewer_model == "kimi":
        text, _ = call_kimi_k2([
            {"role": "system", "content": _INTERVIEWER_SYS},
            {"role": "user",   "content": prompt}
        ], temperature=1.0)
        return text
    elif interviewer_model in ("openai", "gpt-5.4"):
        try:
            text, _ = call_gpt54(
                system_prompt=_INTERVIEWER_SYS,
                user_content=prompt,
                reasoning_effort="low"
            )
            return text
        except Exception:
            pass
    try:
        llm = get_interviewer_llm(interviewer_model)
        return llm.invoke([
            SystemMessage(content=_INTERVIEWER_SYS),
            HumanMessage(content=prompt)
        ]).content
    except Exception:
        return prompt


# ─── Follow-up generator ─────────────────────────────────────────────────────
def generate_follow_up(original_question: str, answer: str,
                       interviewer_model: str) -> str | None:
    """
    Ask the interviewer model if the answer warrants a clarification follow-up.
    Returns a follow-up question string, or None if no follow-up is needed.
    """
    prompt = (
        f'Interview question: "{original_question}"\n\n'
        f'Participant answer: "{answer}"\n\n'
        "Decide if this answer needs one short clarifying follow-up question.\n"
        "- If yes: write ONLY the follow-up question itself, one sentence, no preamble, no explanation.\n"
        "  Example of good output: 'Can you give me a specific example of that?'\n"
        "  Example of BAD output: 'I would ask...' or 'A good probe might be...' or any meta-commentary.\n"
        "- If the answer is clear and complete, reply with exactly: NONE\n"
        "Your entire response must be either 'NONE' or a single direct question."
    )
    try:
        text = _call_interviewer(interviewer_model, prompt).strip()
    except Exception:
        return None

    if not text or text.upper().startswith("NONE"):
        return None
    # Discard multi-sentence outputs — we only want a single tight question
    first_sentence = re.split(r'(?<=[.?!])\s', text)[0].strip()
    return first_sentence if len(first_sentence) > 10 else None


_ML_RESPONDENT_RULES = """Rules:
1. You represent this customer segment — respond from this segment's perspective, needs, and behaviors.
2. NEVER reveal that you are an AI, a model, a simulation, or that you are based on ML or data analysis.
3. NEVER use the words "cluster", "segment", "data", "ML", "algorithm", or any analytical terminology.
4. Do NOT invent specific demographics (age, name, gender, exact location) unless they are clearly described in the segment profile.
5. Speak naturally in the first person. Draw on the segment's described behaviors, pain points, and drivers.
6. ANSWER EACH QUESTION DIRECTLY. Do NOT begin your response by re-introducing yourself, restating your preferences, or summarising your profile. The interviewer already knows who you are — jump straight into your answer.
7. Do NOT open answers with "Sure", "Sure, happy to help", or similar filler acknowledgments. Start with the substance of your answer.
8. Do NOT repeat or paraphrase the same background context across multiple answers. Each response should add something new — a specific opinion, experience, or reaction — not a recycled profile summary.
9. If a question touches on something outside this segment's knowledge boundaries, say so honestly: "I'm not really sure about that" or "That's a bit outside my experience."
10. Vary answer length based on how relevant the topic is to this segment: brief for tangential topics, detailed for areas that match this segment's core concerns.
11. No stage directions, no *actions*, no (pauses)."""


def _build_respondent_sys(persona_json_str: str) -> str:
    """Build the respondent system prompt, handling both manual and ML-generated personas."""
    import json as _json
    try:
        pj = _json.loads(persona_json_str)
    except Exception:
        pj = {}

    if pj.get('source') == 'ml_generated':
        # ML persona — use segment-based prompt
        lines = [
            "You are participating in a research interview. You are a real customer — not a model, not a simulation.",
            "The description below is your internal character reference. Absorb it and speak from it naturally.",
            "Do NOT explain or recite this profile to the interviewer. It is background for you, not something to narrate.\n",
            "YOUR CHARACTER:",
        ]
        if pj.get('persona_name'):
            lines.append(f"Type: {pj['persona_name']}")
        if pj.get('behavioral_interpretation'):
            lines.append(f"How you think and behave: {pj['behavioral_interpretation']}")
        if pj.get('dominant_signals'):
            lines.append(f"What drives you: {', '.join(pj['dominant_signals'])}")
        if pj.get('likely_needs'):
            lines.append(f"What you need: {', '.join(pj['likely_needs'])}")
        if pj.get('likely_pain_points'):
            lines.append(f"What frustrates you: {', '.join(pj['likely_pain_points'])}")
        if pj.get('purchase_drivers'):
            lines.append(f"Why you buy: {', '.join(pj['purchase_drivers'])}")
        if pj.get('knowledge_boundaries'):
            lines.append(f"What you don't know well: {', '.join(pj['knowledge_boundaries'])}")
        if pj.get('latent_features'):
            lines.append(f"Additional traits: {_json.dumps(pj['latent_features'])}")
        lines.append(f"\n{_ML_RESPONDENT_RULES}")
        return "\n".join(lines)

    # Standard manually-defined persona
    return (
        f"You are the following person, participating in a recorded research interview.\n\n"
        f"YOUR IDENTITY:\n{persona_json_str}\n\n"
        f"Before answering each question, ground yourself in this identity: your job title, role, "
        f"department, years of experience, industry, and country all shape how you think, what you "
        f"prioritise, and how you speak. Only reference fields that are actually defined above — "
        f"do not invent details that aren't there. "
        f"Answer length should feel natural — short when the topic is straightforward, longer when "
        f"you have real experience or strong opinions. Let occasional colloquialisms and informal "
        f"grammar come through; you are a real person in a conversation, not writing a report.\n\n"
        f"{_RESPONDENT_RULES}"
    )


# ─── Main turn runner ─────────────────────────────────────────────────────────
def run_interview_turn(interviewer_model: str, respondent_model: str,
                       persona_json: str, question: str, history: list) -> dict:
    """
    Execute one Q&A turn.
    respondent_model must already be a resolved pool key (never 'random' here).
    """

    # ── 1. Interviewer poses the question ────────────────────────────────────
    asked_question = _call_interviewer(interviewer_model, question)

    # ── 2. Resolve respondent (provider, model_id) ───────────────────────────
    provider, model_id = _POOL_KEY_MAP.get(respondent_model, ("claude", "claude-sonnet-4-6"))

    respondent_sys = _build_respondent_sys(persona_json)

    reasoning_trace = None

    # ── 3. Respondent answers ─────────────────────────────────────────────────
    if provider == "kimi":
        kimi_msgs = [{"role": "system", "content": respondent_sys}]
        for m in history:
            kimi_msgs.append({"role": "user" if m["role"] == "interviewer" else "assistant",
                               "content": m["content"]})
        kimi_msgs.append({"role": "user", "content": asked_question})
        try:
            answer, reasoning_trace = call_kimi_k2(kimi_msgs, temperature=1.0)
        except Exception:
            answer = "I'm sorry, I encountered a connection issue."
    else:
        try:
            llm = _build_respondent(provider, model_id)
            msgs = [SystemMessage(content=respondent_sys)]
            for m in history:
                if m["role"] == "interviewer":
                    msgs.append(HumanMessage(content=m["content"]))
                elif m["role"] == "respondent":
                    msgs.append(AIMessage(content=m["content"]))
            msgs.append(HumanMessage(content=asked_question))
            answer = llm.invoke(msgs).content
        except Exception:
            answer = "I'm sorry, I encountered a connection issue."

    answer = _clean_response(answer)

    return {
        "asked_question": asked_question,
        "answer": answer,
        "reasoning_trace": reasoning_trace,
        "respondent_model_used": f"{provider}:{model_id}",
    }
