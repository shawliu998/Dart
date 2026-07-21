# Design QA — 标证通 V4 正式前端迁移

日期：2026-07-19

## Comparison target

- Source visual truth:
  - `/Users/a1-6/Documents/投标/.data/design-qa/2026-07-19/bidevidence-v4/projects-final.png`
  - `/Users/a1-6/Documents/投标/.data/design-qa/2026-07-19/bidevidence-v4/compliance-final.png`
- Browser-rendered implementation:
  - `/Users/a1-6/Documents/投标/.data/design-qa/2026-07-19/bidevidence-v4-production/projects-production-final.png`
  - `/Users/a1-6/Documents/投标/.data/design-qa/2026-07-19/bidevidence-v4-production/compliance-production-final.png`
- Viewport: 1440×900 desktop.
- Secondary resilience viewport: 1024×768.
- State: deterministic demo project list; primary project compliance review with requirement `REQ-001` selected and source document positioned at page 8.
- Product constraint: production pages must keep the existing `Project` / `Requirement` data, API writes, manual-review boundary and audit behavior. Prototype-only rows and business facts are not copied into production.

## Full-view comparison evidence

- Projects, source left / implementation right: `/Users/a1-6/Documents/投标/.data/design-qa/2026-07-19/bidevidence-v4-production/projects-comparison-final.png`
- Compliance, source left / implementation right: `/Users/a1-6/Documents/投标/.data/design-qa/2026-07-19/bidevidence-v4-production/compliance-comparison-final.png`

The implementation preserves the approved 48 px tool rail, 188 px contextual navigation, 44 px topbar, dense project table and list/document/judgement composition. The project screen contains three real deterministic demo records instead of twelve prototype-only rows; the additional white space is expected data-state variance, not layout drift.

## Focused region comparison evidence

- Project table typography, controls and row rhythm: `/Users/a1-6/Documents/投标/.data/design-qa/2026-07-19/bidevidence-v4-production/projects-focus-final.png`
- Requirement list, source document and judgement pane: `/Users/a1-6/Documents/投标/.data/design-qa/2026-07-19/bidevidence-v4-production/compliance-focus-final.png`

Focused comparisons were required because table labels, status badges, source facts and document toolbar controls are not readable enough in the full-page montage.

## Findings

- No actionable P0/P1/P2 issue remains in the final desktop and tablet-width states.
- Fonts and typography: production uses `Inter`, SF Pro and the Chinese system UI stack defined by the approved prototype. Titles, compact controls, table metadata and PDF content retain the same restrained hierarchy and truncation behavior.
- Spacing and layout rhythm: the shell proportions match the source. Project rows are 48 px with 35 px headers; compliance uses 292 px / flexible / 344 px columns at 1440. Borders stay at 1 px and elevation is restricted to the document sheet and light table surface.
- Colors and tokens: neutral white/gray surfaces dominate; brand blue is reserved for selected navigation and primary action. Red, amber, green and blue statuses remain semantic rather than decorative.
- Image quality and asset fidelity: the user-supplied icon and wordmark were traced into transparent, reusable SVG masters under `frontend/public/brand/`, with monochrome, inverse, PNG and favicon derivatives. They are rendered as image assets rather than CSS art, emoji or text glyphs.
- Copy and content: persistent UI labels are tender-specific Chinese. Production table rows, requirements, documents, evidence and risk states all come from the existing data layer rather than the prototype fixture.
- Icons: shell, navigation and review actions use the Phosphor icon family from `@phosphor-icons/react`; filled weight is limited to active navigation. No emoji, hand-drawn SVG or CSS icon substitute is present.
- States and interactions: project view tabs, search, stage/risk filters and clear action work; project links preserve routing. Requirement selection updates the source document and detail; evidence tab and evidence file render correctly; the disqualification filter reduces the list and restores all 20 rows.
- Accessibility: buttons, tabs, labels, table semantics, visible focus and reduced motion remain present. Status badges include text in addition to color.
- Viewport resilience: at 1024 px the contextual sidebar now collapses, leaving the requirement, document and judgement panes usable. The workspace keeps a small internal horizontal overflow instead of creating page-level overflow. Evidence: `/Users/a1-6/Documents/投标/.data/design-qa/2026-07-19/bidevidence-v4-production/compliance-1024-final.png`.

## Comparison history

### Pass 1 — blocked

- [P2] At 1024×768 the 188 px contextual sidebar remained visible, compressing the core workspace and leaving most of the judgement pane outside the initial view.
  - Fix: collapse the contextual sidebar at `max-width: 1180px`, retain the 48 px global rail and allow only a 44 px internal workbench overflow.
  - Pre-fix evidence: `/Users/a1-6/Documents/投标/.data/design-qa/2026-07-19/bidevidence-v4-production/compliance-1024.png`.

### Pass 2 — passed

- The revised 1024 capture exposes the complete requirement list, document body and most of the judgement pane without page-level overflow.
- The 1440 shell and three-pane proportions are unchanged.
- A clean browser tab reports no console warnings or errors.

### Pass 3 — small-metric de-templating, passed

- User feedback identified the repeated “small card + colored top strip + icon tile + arrow” pattern as visibly AI-generated.
- Fixes:
  - replaced the six final-review cards with one continuous, six-segment operational summary;
  - removed all metric icons and colored top borders from final review, dashboard and project overview summaries;
  - removed colored top strips from disqualification summary cards;
  - changed mobile final review to a two-column summary so the six metrics occupy three compact rows;
  - raised the V4 shell and project-overview typography so no visible text is below 9 px at 1440×900.
- Source style reference: `/var/folders/21/lq2y7qwx7nz2czy8zxyyc6480000gn/T/codex-clipboard-b7450b6b-2f5b-4110-806b-c79884b79c74.png`.
- Browser-rendered implementation: `/Users/a1-6/Documents/投标/.data/product-audit/2026-07-19/formal-shell-round3/review-final-clean-build.png`.
- Full-view comparison: `/Users/a1-6/Documents/投标/.data/product-audit/2026-07-19/formal-shell-round3/govdash-review-comparison.png`.
- Focused metric comparison: `/Users/a1-6/Documents/投标/.data/product-audit/2026-07-19/formal-shell-round3/metrics-focused-comparison.png`.
- Mobile evidence, 390×844 viewport: `/Users/a1-6/Documents/投标/.data/product-audit/2026-07-19/formal-shell-round3/review-clean-mobile-2col.png`.
- Post-fix evidence: final-review metric section contains zero SVG icons, all six metric links have `0px` top borders, desktop and mobile document widths equal their viewports, and no persistent action is off-screen.

### Pass 4 — competitor-grounded intake flow, passed

- Public GovDash and Responsive workflow evidence was used to recheck the project intake path before editing it.
- Fixes:
  - replaced the oversized circular stepper with a compact three-segment process bar;
  - reduced the upload drop target to a single dense intake row;
  - introduced a real file table with explicit document-purpose selection for main tender, attachment, amendment and clarification documents;
  - removed repeated file and success icons from upload rows;
  - replaced four review cards with a continuous definition list;
  - added responsive table scrolling and stacked mobile review rows.
- GovDash public source capture: `/Users/a1-6/Documents/投标/.data/product-audit/2026-07-19/competitor-flow/govdash-compliance-public.png`.
- Browser-rendered implementation: `/Users/a1-6/Documents/投标/.data/product-audit/2026-07-19/competitor-flow/new-project-upload-empty.png`.
- Side-by-side visual comparison: `/Users/a1-6/Documents/投标/.data/product-audit/2026-07-19/competitor-flow/reference-comparison.png`.
- Focused project-wizard tests: 3 passed, including persistence of a manually selected amendment type into the upload API call.

### Pass 5 — table-first intake and real-flow verification, passed

- The interim three-step wizard was removed after a closer comparison with GovDash's solicitation-package workflow. Project metadata and document intake now share one compact, task-first page.
- The solicitation package is a real table with a file-type filter, multi-file chooser, per-file document-purpose control, remove action, semantic processing status and restrained file metadata. There is no oversized drop zone, decorative success screen, repeated file icon or nested summary-card stack.
- The primary action now creates the project, uploads every selected file with its chosen purpose, starts one analysis run and routes to the new project's overview. Demo mode routes to the deterministic demo overview instead of a generic Agent page.
- Browser-tested with three local synthetic files: `招标文件.pdf`, `技术需求附件.docx` and `补充公告01.pdf`. Adding, filtering, changing purpose, removing and submitting all produced visible state changes.
- GovDash public source contact sheet: `/Users/a1-6/Documents/投标/.data/product-audit/2026-07-19/competitor-deep-dive/govdash-upload/contact-sheet.png`.
- Final desktop intake: `/Users/a1-6/Documents/投标/.data/product-audit/2026-07-19/upload-flow-audit/09-final-desktop-files.png`.
- Focused package table: `/Users/a1-6/Documents/投标/.data/product-audit/2026-07-19/upload-flow-audit/09-final-package-crop.png`.
- Side-by-side visual comparison: `/Users/a1-6/Documents/投标/.data/product-audit/2026-07-19/upload-flow-audit/govdash-upload-comparison-final.png`.
- Final 390 px mobile intake: `/Users/a1-6/Documents/投标/.data/product-audit/2026-07-19/upload-flow-audit/08-mobile-files-390-fixed.png`; measured document width and viewport width are both 390 px.
- Post-submit project overview: `/Users/a1-6/Documents/投标/.data/product-audit/2026-07-19/upload-flow-audit/10-project-overview-result.png`.
- Focused tests: 5 passed. ESLint and TypeScript checks passed.

### Pass 6 — MyPitchFlow workflow audit and keyboard review, passed

- The logged-in competitor audit covered proposal creation, generation, editing, status changes, version history, expiring read-only sharing, source files, AI review, questionnaires, Knowledge Center, settings and analytics with synthetic data only.
- The visual language was rejected as a production source because repeated accent-top cards, shadows and excess whitespace reproduce the same templated AI character the user asked to remove.
- The response empty state was changed from a centered icon tile inside a 310 px promotional card to a compact, left-aligned workbench header and empty row with the two real next actions. Evidence: `.data/product-audit/2026-07-19/mypitchflow-local/response-empty-compact.png`.
- The response workbench now has an explicit keyboard review mode. `J` / `ArrowDown` selects the next filtered response, `K` / `ArrowUp` selects the previous one, and `Escape` exits. Focused inputs keep native typing behavior.
- Existing save, approval and API-error tests were preserved; the new keyboard navigation test was added alongside them.
- Focused response tests: 4 passed. ESLint and TypeScript checks passed.
- Competitor evidence and failure observations are recorded in `docs/COMPETITOR_UI_AUDIT_2026-07-19.md`.

### Pass 7 — dashboard de-templating, passed

- User evidence identified the remaining AI-template cues in the dashboard: repeated colored icon tiles, boxed risk badges, nested card borders, tiny typography and arrows attached to nearly every action and row.
- Risk language now uses the tender-specific term “否决风险”; risk badges are plain semantic text without warning/shield/question icons, borders or tinted boxes.
- Priority items, Agent gates and activity actors now use aligned text columns and definition-list semantics instead of icon tiles and nested mini-cards.
- The dashboard surface is flattened into operational sections separated by table rules. Section cards, project initials, decorative Agent sparkles and repeated row arrows were removed.
- The date is part of the page description rather than a repeated eyebrow. Persistent UI type was raised from 8–9 px to 10–12 px in the dense desktop dashboard.
- Reference supplied by the user: `/var/folders/21/lq2y7qwx7nz2czy8zxyyc6480000gn/T/codex-clipboard-1c3404c0-b260-492d-b8da-cb07cf71dd6a.png`.
- Browser evidence at 2048×922: `.data/product-audit/2026-07-19/dashboard-polish/no-ai-dashboard-2048.png`.
- At the time of pass 7, Plane, Twenty and Documenso were used only for interaction and information-architecture study while the repository license decision remained open. Pass 8 records the later AGPL-compatible source migration.
- The repository-wide UI detector no longer reports side-tab accents or layout-width animations in production styles. Its only remaining warning is Arial inside the isolated `govdash-strict` visual reference, where it is intentionally preserved for source fidelity.

### Pass 8 — AGPL source-level table migration, passed

- The repository now uses `AGPL-3.0-only`, allowing compatible upstream reuse with preserved attribution and network-source obligations.
- The dashboard table primitive is directly adapted from Plane `packages/ui/src/tables/table.tsx` at commit `7cef741c29cf61d3bca18dc892e6af11a1e7becc`; its original Plane Software copyright and SPDX header are preserved.
- The dashboard was restructured from independent metric/card rows into a dense project-and-task workbench with a constrained operational side rail.
- Browser checks passed at 2048×922, 1366×768 and 720×900. Body width matched viewport width at every size; tables stayed within their scroll containers.
- Refresh state, 30-day range selection, export feedback and project-detail navigation were exercised in the browser. No console errors were recorded.
- The production UI detector reported no findings in the new dashboard and data-table files.
- Full verification: 17 test files and 80 tests passed; Next.js production build passed.

## Browser verification

- Project directory rendered at 1440×900 with page scroll size exactly 1440×900.
- Compliance grid resolved to `292px 568px 344px` at 1440×900.
- Selecting `ISO 27001 证书在有效期内` updated the detail title and source context.
- Selecting the `证据` tab exposed `ISO27001证书.pdf` and correctly changed the selected tab state.
- `仅看否决项` reduced the visible requirement rows from 20 to 3; clearing the filter restored 20.
- Final-review “招标要求” summary navigated to the requirements workbench.
- Final-review metrics render as six desktop segments and two mobile columns; the metric area contains no SVG icons or colored top accents.
- Final browser console errors/warnings: none.
- Lint: passed.
- TypeScript `tsc --noEmit`: passed.
- Vitest: 16 files, 74 tests passed.
- Next.js production build: passed; all application routes generated successfully.

## Figma sync

- Project directory: `https://www.figma.com/design/2cEC2Ocqb8bazhQF5H4wxB?node-id=10-2`
- Compliance review: `https://www.figma.com/design/2cEC2Ocqb8bazhQF5H4wxB?node-id=11-2`
- Captured Figma evidence:
  - `/Users/a1-6/Documents/投标/.data/design-qa/2026-07-19/bidevidence-v4-production/figma-projects-node-10-2.png`
  - `/Users/a1-6/Documents/投标/.data/design-qa/2026-07-19/bidevidence-v4-production/figma-compliance-node-11-2.png`

## Follow-up polish

- P3: HTML-to-Figma capture leaves native `<select>` text blank in a few editable capture layers. The production browser UI is correct; the Figma capture remains suitable for layout review and annotation.
- P3: the remaining full-page height on final review comes from real work-package rows, not repeated metric cards; a later pass could add progressive disclosure if operators prefer a shorter first screen.

final result: passed
