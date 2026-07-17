import { describe, expect, it } from "vitest";
import { DEMO_PROJECT_ID } from "@/lib/demo/data";
import { formatDeadlineRemaining, getProjectContext, projectIdFromPath } from "@/lib/product-context";

describe("product context", () => {
  it("does not leak project context onto global or creation routes", () => {
    expect(projectIdFromPath("/dashboard")).toBeNull();
    expect(projectIdFromPath("/projects/new")).toBeNull();
    expect(getProjectContext("/tasks")).toBeNull();
  });

  it("derives demo metrics and exposes their source", () => {
    const context = getProjectContext(`/projects/${DEMO_PROJECT_ID}/overview`);
    expect(context?.source).toBe("demo");
    expect(context?.fatalRiskCount).toBeGreaterThan(0);
    expect(context?.taskCount).toBeGreaterThan(0);
    expect(context?.packageBlockers).toBeGreaterThan(0);
  });

  it("calculates deadline labels from an explicit clock", () => {
    expect(formatDeadlineRemaining("2026-07-18 09:30", new Date("2026-07-16T09:30:00+08:00"))).toBe("2 天 0 小时");
  });
});
