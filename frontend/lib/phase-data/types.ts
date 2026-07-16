import type { RequirementStatus, RiskLevel } from "@/lib/types";

export type DataSource = "api" | "demo";
export interface DataResult<T> { data: T; source: DataSource; }

export interface EvidenceClaim {
  id: string;
  label: string;
  value: string;
  proves: string;
  page: number;
  confidence: number;
  conflict?: string;
}

export interface EvidenceAsset {
  id: string;
  name: string;
  type: string;
  legalEntity: string;
  status: "verified" | "review" | "expired" | "conflict";
  validUntil: string;
  expiryDays: number;
  claimCount: number;
  usageCount: number;
  owner: string;
  department: string;
  lastReviewed: string;
  tags: string[];
  pageCount: number;
  size: string;
  version: string;
  claims: EvidenceClaim[];
  usedBy: string[];
}

export interface EvidenceCandidate {
  id: string;
  evidenceId: string;
  name: string;
  score: number;
  reason: string[];
  legalEntity: string;
  validUntil: string;
  completeness: number;
  decision: "pending" | "accepted" | "rejected";
}

export interface EvidenceMatchGroup {
  id: string;
  requirementCode: string;
  requirementTitle: string;
  risk: RiskLevel;
  requirementStatus: RequirementStatus;
  page: number;
  selectedEvidenceIds: string[];
  candidates: EvidenceCandidate[];
}

export interface ConsistencySource {
  id: string;
  document: string;
  page: number;
  value: string;
  excerpt: string;
  modifiedAt: string;
}

export interface ConsistencyIssue {
  id: string;
  field: string;
  type: "amount" | "entity" | "date" | "person" | "commitment";
  discoveredValues: number;
  documents: number;
  risk: RiskLevel;
  suggestedValue: string;
  status: "open" | "review" | "resolved" | "reasonable";
  owner: string;
  reason: string;
  sources: ConsistencySource[];
}

export interface AmendmentChange {
  id: string;
  type: "modified" | "added" | "deleted";
  clause: string;
  before: string;
  after: string;
  impact: RiskLevel;
  affectedRequirements: string[];
  affectedEvidence: string[];
  affectedTasks: string[];
  affectsPrice: boolean;
  needsApproval: boolean;
  status: "pending" | "applied";
}

export interface Amendment {
  id: string;
  name: string;
  publishedAt: string;
  receivedAt: string;
  version: string;
  status: "analyzed" | "applied" | "review";
  changeCount: number;
  highImpactCount: number;
  changes: AmendmentChange[];
}

export interface RemediationTask {
  id: string;
  title: string;
  priority: "critical" | "high" | "medium" | "low";
  status: "todo" | "in_progress" | "review" | "done";
  owner: string;
  reviewer: string;
  dueDate: string;
  sourceType: "requirement" | "disqualification" | "consistency" | "amendment" | "package" | "manual";
  sourceLabel: string;
  reason: string;
  evidence: string;
  steps: string[];
  attachments: number;
  comments: number;
}

export interface PackageNode {
  id: string;
  packageItemId?: string;
  name: string;
  type: "folder" | "file";
  status: "valid" | "warning" | "missing";
  size?: string;
  version?: string;
  children?: PackageNode[];
}

export interface PackageCheck {
  id: string;
  packageItemId?: string;
  label: string;
  category: string;
  status: "passed" | "warning" | "failed";
  file: string;
  message: string;
  suggestion: string;
  sourceRequirement: string;
  humanConfirmed: boolean;
}

export interface AuditRecord {
  id: string;
  actor: string;
  actorType: "human" | "agent" | "rule";
  timestamp: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  before: string;
  after: string;
  modelOrRule: string;
  promptVersion: string;
  inputHash: string;
  outputHash: string;
  humanOverride: boolean;
  reason: string;
  risk: RiskLevel;
}
