import { resolveAgentProjectId } from "@/lib/agent";

describe("resolveAgentProjectId", () => {
  it("accepts deterministic UUID-shaped project identifiers", () => {
    expect(resolveAgentProjectId("00000000-0000-0000-0000-000000000003")).toBe("00000000-0000-0000-0000-000000000003");
  });

  it("rejects malformed identifiers and uses the explicit fallback", () => {
    expect(resolveAgentProjectId("../../../other", "fallback-project")).toBe("fallback-project");
  });
});
