# PersonaForge

**An AI-powered customer research and decision simulation engine.**

PersonaForge simulates how your customers would react to questions, propositions, and decisions — before you put them in front of real people.

The workflow is straightforward:

1. **Define the audience.** Describe a target customer segment in plain language, *or* upload a customer dataset and let PersonaForge derive personas directly from it using **machine learning** — an unsupervised clustering pipeline (PCA + KMeans, with silhouette-based auto-K selection) groups your real customers into behaviorally distinct segments, and each cluster is then materialized as a fully-formed persona.
2. **Provide what you want to test.** Upload a questionnaire, concept brief, strategy document, or any decision artifact.
3. **Run the simulation.** A panel of frontier LLMs interviews each persona in the background, producing a full transcript per conversation.
4. **Read the results.** Download structured transcripts, a synthesized thematic insights report, or a correlation analysis that cross-validates any reference artifact against the simulated customer voice.

The whole loop compresses what would normally be weeks of recruiting, scheduling, transcription, and coding into hours — while preserving the structural diversity of opinion that makes qualitative research useful for decisions.

---

## Table of Contents

- [Overview](#overview)
- [Augmenting Real-World Research](#augmenting-real-world-research)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Repository Layout](#repository-layout)
- [Data Flow](#data-flow)
- [LLM Model Assignments](#llm-model-assignments)
- [Database Schema](#database-schema)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Environment Variables](#environment-variables)
- [Running the Stack](#running-the-stack)
- [API Surface](#api-surface)
- [ML-Driven Persona Generation](#ml-driven-persona-generation)
- [Reporting Intelligence & Outputs](#reporting-intelligence--outputs)
- [Authentication](#authentication)
- [Roadmap & Limitations](#roadmap--limitations)
- [Contributing](#contributing)

---

## Overview

PersonaForge is built for product, strategy, marketing, and research teams that need to **stress-test decisions against representative customer reactions** — quickly, repeatedly, and at lower cost than running fresh fieldwork for every question.

Typical use cases include:

- **Research augmentation** — wrap synthetic interviews around any real qualitative or quantitative study to amplify its signal, fill gaps, and stress-test its conclusions. See [Augmenting Real-World Research](#augmenting-real-world-research) for the full pattern catalogue.
- **Concept and proposition testing** — gauge how distinct customer segments react to a new product, message, pricing model, or feature before committing to live research.
- **Decision simulation** — run "what would our customers say" panels against strategy briefs, policy changes, or roadmap trade-offs.
- **Document-grounded discovery** — upload a reference brief and let the platform interview synthetic customers about it, surfacing themes, objections, and gaps.
- **Segmentation activation** — turn a static customer dataset into a panel of speaking, opinion-having personas you can interview repeatedly.

Two persona-creation paths feed the same simulation engine:

1. **Brief-driven personas** — describe the target customer in natural language; an LLM expands the brief into distinct synthetic personas matching the envelope.
2. **ML-driven personas (data-grounded)** — upload a CSV of your existing customer/user data and PersonaForge runs a full unsupervised machine-learning segmentation pipeline:
   - **Profiling** — every column is type-inferred and scored for identifier risk; PII and high-risk fields are auto-excluded so personas are derived from behavioral distributions, not from individuals.
   - **Feature engineering** — numeric scaling (`StandardScaler`), one-hot encoding for low-cardinality categoricals, free-text and high-missing columns dropped.
   - **Dimensionality reduction** — Principal Component Analysis, capped at 20 components.
   - **Clustering** — KMeans with **automatic K selection** via silhouette score sweep when the user doesn't specify a cluster count.
   - **Cluster explanation** — per-cluster dominant signals (top differentiating features) and latent-component loadings.
   - **Persona materialization** — each cluster's statistical signature is converted into a fully-formed behavioral persona JSON via an LLM.

   The result: personas anchored in the real distributions of your real customers, not the modeller's intuition.

Both paths converge on the same interview engine: each persona is questioned by a randomly-weighted respondent model from a pool of five frontier LLMs, with adaptive follow-up probes generated mid-conversation. The result is an interview corpus with structural diversity rather than the stylistic fingerprint of any single model.

---

## Augmenting Real-World Research

PersonaForge is designed to **complement, not replace, real qualitative or quantitative research**. Wrapped around an existing study, synthetic interviews act as a research multiplier — directional signal at LLM cost, used to scaffold or validate the more expensive ground-truth research before, during, or after fieldwork.

Common augmentation patterns:

- **Pre-fielding pilot** — run your questionnaire against a synthetic panel before paying to deploy it to real respondents. Catch ambiguous wording, dead-end branches, missing probes, and segment-level interpretation differences early, when fixing them is cheap.
- **Hard-to-reach segments** — when a real-world segment is expensive, sparse, or operationally impossible to recruit (rare medical conditions, C-suite buyers, sensitive contexts, niche professions), use a data-grounded ML persona panel to triangulate where field recruitment can't.
- **Hypothesis generation** — run a fast, low-cost synthetic study upfront to surface candidate themes, objections, and questions, then take only the sharpest of those into expensive real-world fieldwork.
- **Sample augmentation** — pair a small real qualitative study (e.g., n=10 in-depth interviews) with a larger synthetic panel (n=100+) to surface edge cases and stress-test the stability of patterns you observed in the real sample.
- **Stress-testing findings** — once a real study is complete, re-run the same questionnaire against the synthetic panel to separate findings that are robust from those that may be artifacts of the specific real-world sample.
- **Survey instrument validation** — test for question-order effects, leading wording, and segment-level interpretation differences without burning real respondents.
- **Longitudinal re-interrogation** — re-interview a persona panel against new decision artifacts weeks or months later, with no re-recruitment cost and no panel attrition.
- **Cross-validation against research literature or strategy documents** — use the [reference correlation](#output-3--reference-correlation) output to compare existing study findings, internal strategy briefs, or published research against the synthetic customer voice and surface alignment, contradictions, and missing themes.

The platform is **not a substitute for ground truth** — synthetic respondents can't replicate lived experience, true buying behavior, or the unprompted creativity of real people. But used as a multiplier around real research, it lets a team test more, ship sharper instruments, and stretch a fixed research budget further than fieldwork alone allows.

---

## Key Features

- **Machine-learning-driven persona generation** — upload a real customer dataset and the platform automatically segments it (PCA + KMeans with silhouette-based auto-K) and materializes each cluster as a behaviorally distinct persona. No need to hand-author segments; the data tells you what your audience looks like.
- **Identifier-risk-aware ML pipeline** — before clustering, every column in the uploaded dataset is profiled for type and PII/identifier risk. High-risk fields (emails, phones, free-form names, high-cardinality IDs) are auto-excluded from the feature matrix so personas reflect *behavioral patterns*, not individuals.
- **Two persona creation paths** — brief-driven (natural language describes the target customer) *or* ML-driven (clustered from real customer datasets). Both feed the same simulation engine.
- **Multi-model respondent pool** — each persona's answers are produced by a stochastically chosen LLM (Claude Sonnet, GPT, Gemini, Llama, Qwen) so the simulated panel has stylistic and reasoning diversity rather than mono-model bias.
- **Adaptive follow-up probes** — the interviewer model decides per-turn whether a follow-up is warranted, mirroring how a skilled qualitative researcher pursues an interesting answer.
- **Decision-document ingestion** — upload a PDF/DOCX brief, strategy artifact, or concept doc and the platform either extracts existing questions or generates a fresh questionnaire grounded in the document.
- **Reference correlation** — compare a simulated interview corpus against a separate reference artifact to surface alignment, contradictions, and gaps in your thinking.
- **Repeatable panels** — once a persona panel exists, it can be re-interviewed with new questions or against new decision artifacts at a fraction of the cost of fresh fieldwork.
- **Background workers** — long-running interviews (30 sec – 5 min each) run on a Redis/RQ worker so the API stays responsive even with hundreds of simultaneous simulated conversations.
- **Vector-indexed transcripts** — every answer is embedded into ChromaDB (`text-embedding-3-large`) for thematic search and synthesis at corpus scale.
- **Output formats** — per-persona transcripts (HTML/DOCX), synthesized insight reports across the corpus, and correlation analyses against any reference document.

---

## Architecture

| Layer | Technology |
|---|---|
| Backend API | FastAPI + Uvicorn (port 5000) |
| Persistence | SQLAlchemy + SQLite |
| Background jobs | Redis + RQ (`personaforge_queue`) |
| Vector search | ChromaDB (cosine, OpenAI `text-embedding-3-large`) |
| Frontend | Next.js 14 (App Router) + Tailwind + shadcn/ui (port 3000) |
| LLM SDK | LangChain (Anthropic, OpenAI, Google, HuggingFace, Moonshot) |
| ML | scikit-learn (StandardScaler → PCA → KMeans), pandas |

The frontend proxies `/api/*` calls to the FastAPI backend by default. The notable exception is `/api/output/*` (transcripts, insights, correlation), which is handled by an explicit Next.js Route Handler with `maxDuration=300s` so slow LLM synthesis endpoints don't hit the default proxy timeout.

---

## Repository Layout

```
personaforge/
├── backend/
│   ├── main.py                          # FastAPI app, auth endpoints, lifespan hooks
│   ├── auth.py                          # OAuth2 bearer, get_current_user
│   ├── models.py                        # SQLAlchemy models + Settings + init_db + lightweight migrations
│   ├── worker.py                        # RQ worker entrypoint
│   ├── routes/
│   │   ├── projects.py                  # Project CRUD, document upload, in-project personas
│   │   ├── interviews.py                # Enqueue + status + requeue + transcript
│   │   ├── personas.py                  # Library personas, save-to-library, copy-into-project
│   │   ├── reports.py                   # ChromaDB → LLM thematic report
│   │   ├── output.py                    # Transcripts (HTML/DOCX), insights, correlate
│   │   ├── datasets.py                  # Tabular dataset upload + pandas profiling
│   │   └── ml_personas.py               # KMeans segmentation + approve/exclude/edit
│   ├── llm/
│   │   ├── interview_conductor.py       # Multi-model turn runner, follow-up generator, respondent pool
│   │   ├── persona_generator.py         # Envelope-based persona generation
│   │   └── questionnaire_extractor.py   # Extract or generate questions from a document
│   ├── ml/
│   │   ├── profiler.py                  # Per-column type and identifier-risk inference
│   │   ├── pipeline.py                  # Feature matrix → scale → PCA → KMeans → silhouette → cluster explanation
│   │   └── persona_generator.py         # Cluster summary → behavioral persona JSON
│   └── utils/
│       ├── vector_store.py              # ChromaDB helpers
│       ├── parser.py                    # File-to-text (PDF, DOCX, etc.)
│       └── document_builder.py          # Build HTML/DOCX output
└── frontend/
    ├── next.config.mjs                  # Rewrites /api/* → backend (except /api/output/*)
    └── src/
        ├── app/
        │   ├── page.tsx                 # Dashboard (project list + stats)
        │   ├── login/page.tsx           # Login
        │   ├── monitor/page.tsx         # Live interview progress
        │   ├── analytics/page.tsx       # Analytics view
        │   ├── personas/page.tsx        # Library persona CRUD
        │   ├── projects/
        │   │   ├── new/page.tsx         # 8-state creation wizard
        │   │   └── [id]/output/page.tsx # Download transcripts / insights / correlate
        │   └── api/output/[projectId]/[action]/route.ts   # Long-running route handler (maxDuration=300s)
        ├── components/
        │   └── AuthGuard.tsx            # Wraps all pages, validates token
        └── lib/utils.ts
```

---

## Data Flow

### Brief-driven persona path

```
1. User uploads a brief or decision document (PDF/DOCX/TXT) to a project
   POST /projects/{id}/upload?mode=extract|generate
   → LLM extracts existing questions from the doc, or generates a fresh
     questionnaire grounded in the doc → saved as a Questionnaire row.

2. User adds personas — either:
   • POST /projects/{id}/personas         (in-project, form-based)
   • POST /personas/{id}/use/{project_id} (copy from library)

3. User triggers the simulation
   POST /interviews/run
   → creates Interview rows (status=queued)
   → RQ enqueues run_interview_job per persona

4. Worker process (run_interview_job):
   • Idempotency guard (skip if already completed; clear partial turns on retry)
   • Resolve a respondent model from the weighted pool (persisted per interview)
   • For each question: pose → answer → optional follow-up probe
   • Retry-on-429 with exponential backoff (3 attempts)
   • Persist InterviewTurn rows to SQLite
   • Best-effort embed each answer into ChromaDB (non-fatal on failure)
```

### Data-grounded persona path

```
1. User uploads a tabular dataset
   POST /datasets/upload?project_id=...
   → pandas reads the file, profiler infers types + identifier risk per column
   → DatasetUpload row stored with column profiles.

2. User triggers segmentation
   POST /ml-personas/generate { project_id, dataset_id, n_clusters? }
   → enqueues run_ml_segmentation_job.

3. Worker process (run_ml_segmentation_job):
   • Build feature matrix (excludes high-risk identifiers, >80% missing, free-text columns)
   • StandardScaler → PCA (≤20 components) → KMeans
   • Auto-pick K via silhouette score if n_clusters not provided
   • Per cluster: dominant signals + latent feature importance
   • Convert each cluster summary → behavioral persona JSON
   • Write MLPersona rows; mark dataset.status = "ready"

4. User reviews proposed personas in the UI
   POST /ml-personas/{id}/approve  → copies an MLPersona into a real Persona row
   POST /ml-personas/{id}/exclude
   PUT  /ml-personas/{id}          → edit name + interpretation
```

### Output endpoints

```
GET  /output/{id}/transcripts?format=html|docx  → per-interview summarized transcript
GET  /output/{id}/insights?format=html|docx     → thematic insights synthesized across the corpus
POST /output/{id}/correlate (multipart file)    → compare corpus against reference doc
```

All output endpoints first attempt ChromaDB retrieval and fall back to reading raw `InterviewTurn.response_text` from SQLite. The frontend reaches these via `/api/output/*`, served by a Next.js Route Handler (`maxDuration=300s`) instead of the default rewrite, so 30–120 second LLM synthesis calls don't time out.

---

## LLM Model Assignments

Different parts of the pipeline are assigned to models tuned for that workload:

| Role | Model |
|---|---|
| Questionnaire extraction / generation | `claude-sonnet-4-6` |
| Manual persona generation (envelope) | `claude-opus-4-7` |
| ML persona generation (cluster → JSON) | `gpt-4o-mini` |
| Interviewer | User-selectable: `gpt-4o-mini`, `gpt-5.4` (Responses API), or `kimi` (Moonshot kimi-k2.5) |
| Respondent pool (weighted random) | `claude-sonnet-4-6` 30%, `gpt-5.4` 30%, `gemini-2.5-flash` 25%, `Llama-3.3-70B` 8%, `Qwen2.5-72B` 7% |
| Per-interview transcript summary | `claude-haiku-4-5-20251001` |
| Insights / correlation synthesis | `claude-sonnet-4-6` |
| Embeddings | `text-embedding-3-large` (OpenAI) |

The interviewer call has a graceful fallback chain: `gpt-5.4` → `gpt-4o-mini` → raw prompt, so a model outage doesn't kill an entire interview run.

---

## Database Schema

| Model | Purpose |
|---|---|
| `Project` | Top-level container; owner, name, type, status, participant target, persona envelope |
| `ProjectFile` | Uploaded source documents and parsed text |
| `Questionnaire` | Versioned list of questions per project |
| `Persona` | Synthetic respondent — can be project-scoped or library-scoped (`is_library=True`) |
| `Interview` | One run of one persona answering one questionnaire — tracks status, models used, timestamps |
| `InterviewTurn` | Individual question/answer turns; supports follow-up turns and reasoning traces (Kimi only) |
| `DatasetUpload` | Uploaded tabular dataset with column profiles, status, segmentation params |
| `MLPersona` | Cluster-derived candidate persona (draft/approved/excluded) before approval into `Persona` |

`init_db()` runs lightweight `ALTER TABLE` migrations for backwards compatibility on existing SQLite files.

---

## Prerequisites

- **Python** 3.10+
- **Node.js** 18+ with **pnpm** (or npm/yarn)
- **Redis** running locally on the default port (6379) — used as the simulation job queue
- API keys for:
  - OpenAI (required — used for embeddings + several model calls)
  - Anthropic
  - Google AI Studio (Gemini)
  - HuggingFace Inference (Llama / Qwen access)
  - Moonshot AI (Kimi)

---

## Setup

```bash
# Clone
git clone https://github.com/s-ttp/Persona-Forge.git
cd Persona-Forge

# --- Backend ---
cd backend
python -m venv venv
source venv/bin/activate
# (No requirements.txt is committed yet — see "Roadmap & Limitations" below.
#  Install the packages listed under Architecture above plus their LangChain integrations.)
cp .env.example .env       # then fill in the keys

# --- Frontend ---
cd ../frontend
pnpm install
```

Make sure Redis is running before starting the worker:

```bash
redis-cli ping   # should return PONG
```

---

## Environment Variables

Create `backend/.env` from the provided `backend/.env.example`:

```env
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
MOONSHOT_API_KEY=
HUGGINGFACEHUB_API_TOKEN=

DATABASE_URL=
REDIS_URL=
FRONTEND_URL=

SECRET_KEY=
```

`DATABASE_URL` defaults to a local SQLite file if unset. `REDIS_URL` defaults to `redis://localhost:6379/0`.

---

## Running the Stack

Three processes run concurrently in development. Open three terminals:

```bash
# 1) Backend API
cd backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 5000 --reload

# 2) Worker (handles interviews + ML segmentation)
cd backend
source venv/bin/activate
python worker.py

# 3) Frontend
cd frontend
pnpm dev
```

Visit `http://localhost:3000` and log in with credentials configured in `backend/users.json` (no public registration endpoint — see [Authentication](#authentication)).

---

## API Surface

A non-exhaustive reference. All routes require a Bearer token unless noted.

### Auth
- `POST /auth/login` — exchange username/password for a token
- `GET /auth/me` — token validation (used by frontend `AuthGuard`)

### Projects
- `GET /projects/` — list
- `POST /projects/` — create
- `POST /projects/{id}/upload?mode=extract|generate` — upload source doc, build questionnaire
- `POST /projects/{id}/personas` — add a persona to a project
- `GET /projects/{id}` — full project detail
- `DELETE /projects/{id}` — delete

### Personas (library)
- `GET /personas/` — library + project personas grouped
- `POST /personas/{id}/use/{project_id}` — copy library persona into a project
- `POST /personas/save_to_library/{persona_id}` — promote project persona to library

### Interviews
- `POST /interviews/run` — enqueue interviews for a project
- `GET /interviews/status/{project_id}` — progress polling
- `POST /interviews/{id}/requeue` — retry a failed interview
- `GET /interviews/{id}/transcript` — JSON transcript

### Datasets & ML personas
- `POST /datasets/upload?project_id=...` — upload CSV, run profiling
- `POST /ml-personas/generate` — enqueue segmentation job
- `GET /ml-personas/?project_id=...` — list candidate personas
- `POST /ml-personas/{id}/approve` — promote to real Persona
- `POST /ml-personas/{id}/exclude`
- `PUT /ml-personas/{id}` — edit name/interpretation

### Output
- `GET /output/{project_id}/transcripts?format=html|docx`
- `GET /output/{project_id}/insights?format=html|docx`
- `POST /output/{project_id}/correlate` — multipart upload of reference doc

---

## ML-Driven Persona Generation

PersonaForge's machine-learning persona pipeline is what makes simulated panels reflective of real customer distributions rather than the modeller's intuition. The pipeline lives in `backend/ml/` and runs in three stages:

1. **Profiler (`profiler.py`)** — per-column type inference plus identifier-risk scoring. High-risk columns (emails, phone numbers, free-form names, IDs with high cardinality) are flagged for exclusion from the feature matrix.

2. **Pipeline (`pipeline.py`)**:
   - Drop high-risk columns and columns with >80% missing values.
   - Numeric columns: `StandardScaler`.
   - Low-cardinality categoricals: one-hot encoding.
   - Free-text: skipped.
   - Dimensionality reduction: PCA, capped at 20 components.
   - Clustering: KMeans. If `n_clusters` is not provided, the platform sweeps K=2…8 and picks the K with the highest silhouette score.
   - Per-cluster explanation: dominant signals (top differentiating features) and latent components (PCA loadings).

3. **Persona generator (`persona_generator.py`)** — each cluster's statistical summary is converted into a behavioral persona JSON via `gpt-4o-mini`. The generated persona includes a name, demographic sketch, behavioral pattern description, and a confidence score.

The result is a set of draft `MLPersona` rows that the user can review, edit, approve, or exclude before they're used in actual interviews.

---

## Reporting Intelligence & Outputs

A simulated interview corpus is only useful if you can extract decisions from it. PersonaForge's reporting layer treats interview data as a structured asset that can be queried, synthesized, and cross-validated against any reference artifact you supply.

The reporting endpoints share three design principles:

- **Hybrid retrieval** — every report first attempts ChromaDB semantic search across the embedded answer corpus, then falls back to reading raw `InterviewTurn` rows from SQLite. Reports work even if the vector store is empty, unreachable, or out of sync.
- **Anti-fabrication guardrails** — every prompt explicitly forbids inventing quotes or data. The LLM is constrained to synthesize from verbatim excerpts only, with the source corpus included in-context.
- **Re-runnable** — reports are not snapshotted artifacts; they are regenerated on demand. As more interviews complete, every output endpoint refreshes against the new corpus, so reports stay current without manual rebuild steps.

### Output 1 — Per-interview transcripts

`GET /output/{project_id}/transcripts?format=html|docx`

A polished, persona-attributed transcript bundle. For each interview:

- Every Q+A turn is included in chronological order.
- Each answer is **stage-direction-stripped** — regex passes remove roleplay artifacts (`*nods thoughtfully*`, `(pauses)`, padded whitespace) so you read the substance, not the costume.
- Each interview is augmented with a **2–3 sentence executive summary** generated by Claude Haiku 4.5 from the first six turns — useful for skimming a 50-interview corpus in minutes.
- Persona attribution: name, occupation, region.

Available as styled HTML (web-shareable) or Word DOCX (paste-ready into research decks).

### Output 2 — Synthesized insights report

`GET /output/{project_id}/insights?format=html|docx`

A senior-analyst-grade thematic synthesis produced by Claude Sonnet 4.6, structured as:

1. **Executive Summary** — 2–3 sentence top-line for stakeholders.
2. **Key Themes** — 3–5 themes with supporting verbatim quotes from the corpus.
3. **Notable Patterns** — cross-segment observations.
4. **Implications for Research** — what the findings mean for the decision at hand.
5. **Limitations** — caveats on what the synthesized panel can and cannot tell you.

The model receives up to 40 verbatim excerpts in-context and is instructed to write in formal academic prose, citing only material that appears in the source. Available as HTML or DOCX.

### Output 3 — Reference correlation

`POST /output/{project_id}/correlate` (multipart upload, up to 10 MB; PDF, DOC, DOCX, TXT, CSV, JSON)

The flagship decision-simulation output. You upload **any reference artifact** — a strategy brief, a product hypothesis paper, a positioning deck, a competitor teardown, a research plan — and Sonnet 4.6 cross-validates the customer voice against it:

1. **Key Correlations** — where the simulated customer voice supports the reference's claims.
2. **Contradictions / Tensions** — where customer evidence challenges or undermines the reference.
3. **Novel Insights** — themes present in interviews that the reference document missed entirely.
4. **Conclusions & Recommendations** — concrete next steps grounded in both inputs.

This is what differentiates PersonaForge from a transcription summarizer: it doesn't just tell you what your customers said, it tells you **whether the document you're about to ship will land**.

### Output 4 — Theme Analytics (interactive)

The `/analytics` page in the frontend exposes a **conversational query interface** over the interview corpus. You describe the themes or insights you want surfaced (e.g., *"main barriers to adoption among enterprise buyers"*) and the platform generates a structured thematic report on demand. Useful for ad-hoc exploration when you don't yet know which formal report to run.

### Output retrieval pipeline

```
[Output endpoint hit]
       │
       ▼
ChromaDB semantic search
("main themes findings insights patterns", n_results=30)
       │
       ▼
Documents found?  ──── yes ──▶  Use semantic results
       │ no
       ▼
Fall back to SQLite
(every InterviewTurn.response_text from completed/running interviews)
       │
       ▼
Stage-direction strip + cleanup
       │
       ▼
LLM synthesis with anti-fabrication guardrails
       │
       ▼
Render to HTML or DOCX → download
```

The frontend reaches all output endpoints via `/api/output/*`, served by a Next.js Route Handler with `maxDuration=300s` (rather than the default rewrite proxy). This is deliberate: synthesized insights and correlation reports often take 30–120 seconds, and the longer ceiling prevents the proxy layer from killing legitimate work.

---

## Authentication

PersonaForge uses a bearer-token scheme:

- Login at `POST /auth/login` returns a hex token.
- Tokens are kept in an in-memory dict and persisted to disk so they survive restarts.
- `AuthGuard.tsx` on the frontend validates the token on every page load via `/auth/me`.
- There is no public registration endpoint — users are added manually to `backend/users.json`.

---

## Roadmap & Limitations

- **No `requirements.txt` committed yet** — package list will be regenerated and added in a follow-up commit. Until then, refer to the imports in `backend/` to derive dependencies.
- **Stronger password hashing** — current SHA-256 hashing should be migrated to bcrypt or argon2.
- **Async-safe LLM calls** — output endpoints currently use synchronous LLM clients inside async handlers; should migrate to async clients to free the event loop.
- **Pagination** — project and interview listings return full sets; pagination needed for larger workspaces.
- **Project deletion cleanup** — `delete_project_collection` exists in `vector_store.py` but is not yet wired into the project deletion route.
- **Rate limiting** on `/auth/login`.
- **Public user registration** flow.

---

## Contributing

Issues and PRs are welcome. Please open an issue first to discuss any non-trivial change.

When working on the backend, both `uvicorn` and the worker need to be restarted manually after code edits if you launched without `--reload` (the worker has no reload mode at all).

---

## License

PersonaForge is released under the [MIT License](LICENSE) — free to use, modify, and distribute, including for commercial purposes, with attribution.
