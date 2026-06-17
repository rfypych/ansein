# AnseIn v3.0 — Advanced Neural Security Extractor Intelligence

> A CTI/OSINT platform that extracts, enriches, and visualises threat intelligence — then writes the report for you.

[![Tests](https://img.shields.io/badge/tests-165%20passing-emerald)]() [![Coverage](https://img.shields.io/badge/coverage-86%25-emerald)]() [![Python](https://img.shields.io/badge/python-3.12%2B-blue)]() [![License](https://img.shields.io/badge/license-MIT-blue)]()

---

## Highlights

- **Hybrid extraction pipeline**: Regex → GLiNER → LLM. Catches IOCs, malware families, threat actors, vulnerabilities — degrades gracefully when optional dependencies are missing.
- **Multi-tenant SaaS**: Each user supplies their own API keys (BYOK), encrypted at rest with Fernet. Investigations, sources, and chat sessions are isolated per user.
- **Plug-and-play setup wizard**: First-run UI walks through DB connection + admin creation. No CLI required.
- **cPanel/MySQL-friendly**: Designed for shared hosting. Uses PyMySQL, environment-variable config, Passenger WSGI entrypoint.
- **Cognitive analysis**: LLM-generated threat narratives, actor hypotheses, severity scores 0-100, admiralty reliability codes, actionable recommendations.
- **Interactive knowledge graph**: D3 force-directed visualisation of entities and relationships.
- **Investigation Copilot**: RAG-style chat grounded strictly in your investigation's data, with per-session memory.
- **Professional export**: STIX 2.1 bundle, raw JSON, or polished PDF — one click.
- **Modular architecture**: Clean separation of `engines` (pure logic), `services` (DB orchestration), `api` (HTTP layer). Easy to extend.

---

## Architecture

```
ansein-v3/
├── backend/
│   ├── app/
│   │   ├── core/           # config, security (JWT, hashing)
│   │   ├── db/             # SQLAlchemy session/engine
│   │   ├── models/         # ORM models (MySQL-friendly)
│   │   ├── schemas/        # Pydantic request/response contracts
│   │   ├── engines/        # Pure logic: extraction, enrichment, graph, analysis, copilot, llm
│   │   ├── services/       # DB orchestration: user, investigation, copilot, setup, export, crypto
│   │   ├── api/v1/endpoints/  # FastAPI routers (12 files)
│   │   ├── middleware/      # Rate limiter
│   │   └── main.py         # FastAPI app factory + lifespan
│   ├── alembic/            # DB migrations
│   ├── tests/              # 165 tests, 86% coverage
│   ├── passenger_wsgi.py   # cPanel WSGI entrypoint
│   ├── run.py              # Local dev entrypoint
│   ├── requirements.txt
│   ├── .env.example
│   └── alembic.ini
├── frontend/
│   ├── src/
│   │   ├── components/    # Layout, UI primitives, GraphView (D3)
│   │   ├── contexts/      # Auth store (Zustand)
│   │   ├── lib/           # Axios client, utilities
│   │   ├── pages/         # Landing, Login, Register, SetupWizard, Dashboard,
│   │   │                  # InvestigationList, NewInvestigation, InvestigationDetail,
│   │   │                  # CopilotPage, Settings
│   │   ├── styles/        # Tailwind v4
│   │   └── App.jsx        # Routes
│   ├── package.json
│   └── vite.config.js
└── docs/
    └── DEPLOYMENT.md      # cPanel + general deployment guide
```

---

## Quick Start (Local Dev)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Copy env template (no need to fill anything for first run — setup wizard handles it)
cp .env.example .env

# Run
python run.py
# → API at http://localhost:8000, docs at /api/docs
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# → UI at http://localhost:5173 (proxies /api to :8000)
```

### First-Run Setup

1. Open http://localhost:5173 — you'll be auto-redirected to `/setup`.
2. **Step 1**: Enter your DATABASE_URL (use the "SQLite (dev only)" preset for a quick test).
3. **Step 2**: Create your admin account.
4. **Step 3**: Log in and start investigating.

---

## Deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for:

- cPanel shared hosting (Passenger WSGI + MySQL)
- Docker Compose (MySQL + Redis + App)
- VPS / bare metal (systemd + nginx + MySQL)

---

## Configuration

All settings live in `backend/.env`. Key options:

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | _(empty → setup wizard)_ | MySQL: `mysql+pymysql://user:pass@host:3306/db?charset=utf8mb4` |
| `SECRET_KEY` | `dev-insecure-…` | JWT signing + Fernet key derivation. **Set in production!** |
| `SETUP_MODE` | `auto` | `auto` (wizard when DB empty) / `always` / `never` |
| `OPENAI_API_KEY` | _(empty)_ | System-level OpenAI key (BYOK overrides per-user) |
| `GROQ_API_KEY` | _(empty)_ | System-level Groq key |
| `VIRUSTOTAL_API_KEY` | _(empty)_ | System-level VT key |
| `ABUSEIPDB_API_KEY` | _(empty)_ | System-level AbuseIPDB key |
| `SHODAN_API_KEY` | _(empty)_ | System-level Shodan key |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Comma-separated allowed origins |
| `RATE_LIMIT_PER_MINUTE` | `120` | Per-IP rate limit |
| `REDIS_URL` | _(empty → sync mode)_ | Redis for Celery (optional) |

---

## API Reference

Interactive docs available at `/api/docs` (Swagger) and `/api/redoc` (ReDoc) once the server is running.

Key endpoints:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Self-register (first user → admin) |
| `POST` | `/api/v1/auth/login` | Login |
| `POST` | `/api/v1/auth/refresh` | Refresh access token |
| `GET` | `/api/v1/auth/me` | Current user |
| `GET`/`PUT` | `/api/v1/settings` | Get/update BYOK keys |
| `GET`/`POST` | `/api/v1/investigations` | List/create investigations |
| `GET`/`PATCH`/`DELETE` | `/api/v1/investigations/{id}` | CRUD one investigation |
| `POST` | `/api/v1/investigations/{id}/pipeline` | Run extract → enrich → analyze |
| `POST` | `/api/v1/ingest/{id}/sources` | Add text source |
| `POST` | `/api/v1/ingest/{id}/sources/upload` | Upload file source |
| `GET` | `/api/v1/entities/{id}` | List extracted entities |
| `GET` | `/api/v1/graph/{id}` | Get graph as D3 JSON |
| `GET` | `/api/v1/analysis/{id}` | Get latest analysis run |
| `GET`/`POST` | `/api/v1/copilot/sessions` | List/create chat sessions |
| `POST` | `/api/v1/copilot/ask` | Ask the Copilot |
| `GET` | `/api/v1/export/{id}/json` | Export as JSON |
| `GET` | `/api/v1/export/{id}/stix` | Export as STIX 2.1 bundle |
| `GET` | `/api/v1/export/{id}/pdf` | Export as PDF report |
| `GET`/`POST` | `/api/v1/setup/*` | Setup wizard endpoints |

---

## Testing

```bash
cd backend
python -m pytest tests/ -v
python -m pytest tests/ --cov=app --cov-report=term-missing
```

165 tests across 9 test files. Coverage: 86%.

Test files:
- `test_auth.py` — registration, login, refresh, token validation
- `test_investigations.py` — CRUD, sources, pipeline, multi-tenant isolation
- `test_extraction.py` — regex extractor + dedup + relationship inference
- `test_enrichment.py` — Admiralty scoring, no-keys behavior, BYOK override
- `test_graph.py` — graph construction, queries, STIX export, D3 truncation
- `test_analysis.py` — heuristic analysis, severity scoring, recommendations
- `test_copilot.py` — chat sessions, ask, isolation, graceful LLM-unavailable
- `test_export.py` — JSON / STIX / PDF exports + ownership checks
- `test_setup_health.py` — health check, setup wizard, admin creation
- `test_security.py` — password hashing, JWT, Fernet crypto
- `test_settings.py` — BYOK encryption, per-user isolation
- `test_mocked_engines.py` — LLM + HTTP-mocked enrichment/analysis/copilot paths

---

## Roadmap

- [ ] Real-time collaboration (WebSocket-based)
- [ ] Neo4j backend option for >1M-entity graphs
- [ ] MISP feed import/export
- [ ] Sigma rule generation from extracted IOCs
- [ ] Scheduled enrichments (Celery beat)
- [ ] 2FA / WebAuthn login

---

## License

MIT © 2026 rfypych. See [`LICENSE`](LICENSE).
