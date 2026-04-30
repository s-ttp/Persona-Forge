# PersonaForge

**A virtual survey platform that simulates qualitative research interviews using large language models.**

Upload a questionnaire or background document, define synthetic personas (manually or by clustering a real dataset), and let multi-model LLMs conduct full interviews in the background. Download structured transcripts, thematic insight reports, and correlate findings against reference material — all without recruiting a single human respondent.

---

## Table of Contents

- [Overview](#overview)
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
- [ML Persona Pipeline](#ml-persona-pipeline)
- [Authentication](#authentication)
- [Roadmap & Limitations](#roadmap--limitations)
- [Contributing](#contributing)

---

## Overview

PersonaForge is built for product researchers, UX teams, and analysts who need fast directional signal from qualitative interviews without scheduling, recruiting, or transcribing real participants. It pairs a question-extraction pipeline with a synthetic respondent pool spread across multiple frontier LLMs, so the interview corpus reflects a diversity of "voices" rather than the stylistic fingerprint of any single model.

Two persona-creation paths are supported:

1. **Manual / envelope-driven personas** — describe a target segment in natural language and let an LLM generate distinct synthetic personas matching that envelope.
2. **ML-driven personas from real data** — upload a CSV of your existing customer/user data, and the platform runs a KMeans + PCA segmentation pipeline that clusters the population, then converts each cluster into a behavioral persona via LLM summarization.

Both paths converge on the same interview engine: each persona is interviewed by a randomly-weighted respondent model from a pool of five, with adaptive follow-up probes generated mid-interview.

---

## Key Features

- **Two persona creation paths**: hand-crafted from natural-language briefs, or ML-clustered from tabular customer data.
- **Multi-model respondent pool**: each persona's answers are produced by a stochastically chosen LLM (Claude Sonnet, GPT, Gemini, Llama, Qwen) so the interview corpus has stylistic diversity rather than mono-model bias.
- **Adaptive follow-up probes**: the interviewer model decides per-turn whether a follow-up question is warranted based on the respondent's reply.
- **Background workers**: long-running interviews (30 sec – 5 min each) run on a Redis/RQ worker so the API stays responsive.
- **Vector-indexed transcripts**: every answer is embedded into ChromaDB (`text-embedding-3-large`) for thematic search and report synthesis.
- **Document-grounded questionnaires**: upload a PDF/DOCX brief and the platform either extracts existing questions or generates a fresh questionnaire grounded in the document.
- **Reference correlation**: compare an interview corpus against a separate reference document to surface alignment and gaps.
- **Output formats**: download per-interview transcripts (HTML/DOCX), synthesized insight reports, and correlation analyses.
- **Identifier-risk-aware ML pipeline**: the dataset profiler infers PII/identifier risk per column and excludes high-risk fields from the clustering feature matrix automatically.

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

### Manual persona path

```
1. User uploads a brief (PDF/DOCX/TXT) to a project
   POST /projects/{id}/upload?mode=extract|generate
   → LLM extracts existing questions from the doc, or generates a fresh
     questionnaire grounded in the doc → saved as a Questionnaire row.

2. User adds personas — either:
   • POST /projects/{id}/personas         (in-project, form-based)
   • POST /personas/{id}/use/{project_id} (copy from library)

3. User triggers interviews
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

### ML persona path

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
- **Redis** running locally on the default port (6379)
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

## ML Persona Pipeline

The dataset → persona pipeline lives in `backend/ml/` and is structured as three stages:

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

TBD — repository owner to add a `LICENSE` file.
