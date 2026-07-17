"use client";

import { useState } from "react";
import type { AgentRunBundle } from "@/lib/agent";
import { AgentRunDrawer } from "./agent-run-drawer";
import { AgentStatusButton } from "./agent-status-button";

export function AgentStatusControl({ bundle, source }: { bundle: AgentRunBundle; source: "api" | "demo" }) {
  const [open, setOpen] = useState(false);
  const pendingApprovalCount = bundle.approvals.filter((item) => item.status === "pending").length;
  return <><AgentStatusButton run={bundle.run} pendingApprovalCount={pendingApprovalCount} onClick={() => setOpen(true)} /><AgentRunDrawer bundle={bundle} source={source} open={open} onClose={() => setOpen(false)} /></>;
}
