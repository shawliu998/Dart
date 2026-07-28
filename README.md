<div align="center">

# Dart · BidEvidence

BidEvidence is a traceable bid workspace that keeps tender requirements, company evidence, response writing, and human review connected.

[Product tour](docs/FINAL_PRODUCT_AUDIT.md) · [Case study](docs/CASE_STUDY.md) · [Architecture](docs/ARCHITECTURE.md) · [Run locally](docs/PORTFOLIO_RUNNING_GUIDE.md)

</div>

![BidEvidence response workspace with the project outline, response editor, source requirement and accepted evidence](docs/assets/portfolio/hero-response-workbench.jpg)

BidEvidence is an independent product and engineering project. I defined the problem, studied the workflow, designed the product and interface, implemented the frontend and backend, built the demo data, and owned testing and delivery.

## What it does

Tender work rarely lives in one document. Requirements, amendments, company certificates, past projects, price sheets and response drafts all need to stay connected.

BidEvidence（标证通）keeps each important decision close to its source: the
document, page, excerpt, evidence, rule result and human review state. It gives
bid managers one structured workspace for the full path from file intake to final
review.

The demo uses synthetic Chinese tender files and defaults to `MockLLMProvider`.

The interface opens in English by default and can be switched to Chinese from the user menu. Project names, tender clauses, filenames, source excerpts and other Chinese business records stay in their original language.

The workspace model connection is configured from **Settings → Model connection**.
The built-in Mock provider works offline. A DeepSeek connection can be tested against
the same structured-output contract used by document analysis and applied without
restarting the app; API keys are never returned by the settings API.

## Product flow

```text
File intake → Compliance review → Evidence library → Response writing
            → Remediation → Package review → Final review
```

1. **File intake** — collect the main tender, appendices, amendments and clarifications; retry failed files individually.
2. **Compliance review** — review requirements beside their original page and excerpt.
3. **Evidence library** — turn certificates and project records into claims with owner, validity and source.
4. **Response writing** — write against each requirement using evidence that has already been accepted.
5. **Remediation** — assign missing or conflicting items and send them back for review.
6. **Package review** — check required files, naming, revisions and the package manifest before approval.
7. **Final review** — inspect risks, sources, evidence, responses, tasks and package state in one pass.

[See the seven production screens](docs/FINAL_PRODUCT_AUDIT.md)

The included project demonstrates the complete seven-step workflow with 24 sourced
requirements, 17 evidence claims, 24 responses, deterministic checks, remediation
tasks and delivery gates.

## Why it is designed this way

Every important conclusion links back to a document version, page, clause and excerpt. A response can cite evidence only after a reviewer has accepted it.

Language models help with classification, candidate extraction, ranking and explanation. Money, dates, counts, entity identity, validity periods, required files and hashes are checked by versioned code.

Generating a draft is not the same as approving a submission. The fixed demo
exercises the final review gate with controlled validation cases, showing how
sources, rule results and required follow-up remain visible to the reviewer.

The workflow can advance through bounded runs, while submission and other
consequential decisions stay under human control.

## Architecture

The product remains artifact-first rather than chat-first. Its background workflow can read persisted project state, choose one action from a closed tool registry, write a sourced artifact, verify it, and pause for review before continuing.

```mermaid
flowchart LR
    A[Persisted project state] --> B[Observe]
    B --> C[Select next bounded tool]
    C --> D[Write typed artifact]
    D --> E[Deterministic verification]
    E --> F{Human gate required?}
    F -->|No| B
    F -->|Review or revise| G[Product workbench]
    G --> B
    E --> H[Responses, remediation and package]
```

- **Web:** Next.js App Router and TypeScript.
- **API:** FastAPI, Pydantic v2, SQLAlchemy 2 and Alembic.
- **Rules:** amount, date, quantity, entity, validity, consistency, file and hash checks.
- **Workflow runtime:** durable runs, bounded iterations, a closed tool registry, typed artifacts, resumable failures and explicit approvals.
- **Model boundary:** a structured provider interface; local runs and tests default to `MockLLMProvider`.
- **Traceability:** document versions, page excerpts, claims, rule codes, review reasons and append-only records.

[Architecture notes](docs/ARCHITECTURE.md) · [Workflow loop, rules and human review](docs/AI_DESIGN.md)

## Download

BidEvidence v0.2.0 is available as a macOS Apple Silicon desktop app. It bundles
the FastAPI and Next.js runtimes, so the person evaluating the project does not
need Docker, Python or Node.

[Download the latest desktop release](https://github.com/shawliu998/Dart/releases/latest)

Open the DMG, drag BidEvidence to Applications, then use the built-in Mock
provider or configure DeepSeek from **Settings → Model connection**. See the
[desktop build notes](desktop/README.md) for the source-build workflow.

## Run locally

Requirements: Docker Compose v2 and Python 3.

```bash
make demo
```

Then open:

- Web: `http://localhost:3000/projects`
- API: `http://localhost:8000/docs`
- Demo account: `admin@demo.local` / `demo1234` (development only)
- Fixed project: `00000000-0000-0000-0000-000000000003`

Stop the services with:

```bash
make down
```

[Full running guide](docs/PORTFOLIO_RUNNING_GUIDE.md)

## Engineering verification

The release fixture contains:

- 24 requirements with document, page and clause sources;
- 7 evidence files and 17 structured claims;
- 14 deterministic checks with `rule_code`;
- 7 remediation tasks, 9 package entries and 24 responses.

Verification summary:

- ESLint, TypeScript and the production build pass;
- 21 test files, 115/115 tests pass, including locale persistence, source-language protection, response version history and model settings;
- Playwright E2E: 7 passed, 1 skipped;
- the packaged desktop build passes an isolated install, launch, health, shutdown
  and restart smoke test.

```bash
make verify-demo
make test
make lint
make verify
```

[Test evidence](docs/PORTFOLIO_TEST_EVIDENCE.md) · [Running guide](docs/PORTFOLIO_RUNNING_GUIDE.md)

## Project notes

I led the work from problem framing to acceptance:

- product scope, workflow research and the seven-step product flow;
- information architecture, interaction design and visual convergence;
- the Next.js frontend, FastAPI backend, domain model and deterministic rules;
- the bounded workflow loop, closed tool contracts, artifact model and human approval gates;
- synthetic PDF/DOCX/XLSX fixtures, the fixed oracle and automated tests;
- product review, technical acceptance, evidence capture and packaging.

AI tools helped with research, implementation and review. Product choices, capability boundaries, engineering judgment and final acceptance remained my responsibility.

[Case study](docs/CASE_STUDY.md) · [Authorship](docs/AUTHORSHIP.md) · [Architecture](docs/ARCHITECTURE.md) · [AGPL-3.0](LICENSE)
