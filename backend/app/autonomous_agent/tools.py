"""Closed tool registry.

The runtime binds these names to existing service calls.  Keeping registration separate makes
the planner incapable of requesting arbitrary code or document-instruction execution.
"""

from __future__ import annotations

from app.autonomous_agent.schemas import ToolName

TOOL_REGISTRY: dict[ToolName, str] = {
    "inspect_project": "Create the document inventory using the existing document service.",
    "parse_pending_documents": "Parse pending project documents through the existing parser job.",
    "extract_project_profile": "Create a source-bound project profile artifact.",
    "extract_requirements": "Run the existing requirement extraction service.",
    "match_evidence": "Run the existing deterministic evidence matcher.",
    "run_compliance_checks": "Run the existing deterministic compliance service.",
    "generate_responses": "Generate internal drafts through the response service.",
    "assemble_work_package": "Export the existing project artifact package.",
    "finish_run": "Request the single final work-package review.",
}
