export type RiskLevel = "fatal" | "high" | "medium" | "low";
export type RequirementStatus = "met" | "missing" | "review" | "failed" | "conflict";

export interface Project {
  id: string;
  name: string;
  buyerName: string;
  projectCode: string;
  stage: string;
  progress: number;
  highRiskCount: number;
  taskCount: number;
  deadline: string;
  owner: string;
  updatedAt: string;
  risk: RiskLevel;
}

export interface Requirement {
  id: string;
  code: string;
  title: string;
  category: string;
  mandatory: boolean;
  disqualification: boolean;
  risk: RiskLevel;
  status: RequirementStatus;
  evidence: string | null;
  confidence: number;
  owner: string;
  dueDate: string;
  page: number;
  clause: string;
  originalText: string;
  normalizedText: string;
  expectedEvidence: string;
  actualValue: string;
  rule: string;
  reasoning: string;
  sourceDocument: string;
  sourceVersion: string;
}

export interface DisqualificationItem {
  id: string;
  title: string;
  status: "candidate" | "rule_hit" | "confirmed" | "resolved" | "waived";
  risk: RiskLevel;
  source: string;
  page: number;
  trigger: string;
  evidence: string;
  response: string;
  remediation: string;
  owner: string;
  dueDate: string;
  approver: string;
}
