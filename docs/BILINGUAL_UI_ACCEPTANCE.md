# Bilingual UI acceptance

Date: 2026-07-27
Scope: existing BidEvidence shell and seven-step tender workflow

## Result

Accepted for portfolio packaging.

- English is the default interface language.
- `English / 中文` is available in the existing user menu.
- The selected language persists after reload.
- Navigation, controls, status labels, empty states and core workbench chrome switch language without changing route or project state.
- Chinese project names, tender filenames, source clauses, evidence excerpts and business records remain unchanged.
- The language control remains usable at 390 × 844.

## Reuse decision

The implementation extends the existing `AppShell`, workbenches and API-backed state. It adds one locale provider and one focused test file; it does not add language-specific routes, a second navigation system or replacement workbenches.

## Evidence

- English desktop: `.data/github-presentation-reference/bilingual-requirements-en-final.png`

Browser checks covered:

1. English initial render.
2. User-menu switch to Chinese.
3. Reload with Chinese retained and `<html lang="zh-CN">`.
4. Switch back to English and `<html lang="en">`.
5. Chinese tender source text and project data unchanged in both modes.

## Automated verification

- TypeScript: passed.
- ESLint: passed.
- Vitest: 20 files, 109/109 tests passed.
- Production build: see the final packaging record.
