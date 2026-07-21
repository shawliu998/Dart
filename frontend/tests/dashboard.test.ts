const mocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  loadTasks: vi.fn(),
  loadAudit: vi.fn(),
  loadAgent: vi.fn(),
}));

vi.mock("@/lib/api/projects", () => ({ projectApi: { list: mocks.listProjects } }));
vi.mock("@/lib/api/phase2", () => ({ phaseApi: { tasks: mocks.loadTasks, audit: mocks.loadAudit } }));
vi.mock("@/lib/api/agent", () => ({ agentApi: { getRun: mocks.loadAgent } }));

import { getDashboardData } from "@/lib/dashboard";

describe("getDashboardData", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads project-scoped dashboard data and treats a missing Agent run as an idle state", async () => {
    mocks.listProjects.mockResolvedValue([{ id: "project-api", name: "API 项目", deadline: "2026-07-30 17:00", stage: "整改处理", risk: "high", highRiskCount: 1 }]);
    mocks.loadTasks.mockResolvedValue({ source: "api", data: [], error: null });
    mocks.loadAudit.mockResolvedValue({ source: "api", data: [], error: null });
    mocks.loadAgent.mockResolvedValue({ source: "empty", data: null, error: null });

    const data = await getDashboardData();

    expect(mocks.loadTasks).toHaveBeenCalledWith("project-api");
    expect(mocks.loadAudit).toHaveBeenCalledWith("project-api");
    expect(mocks.loadAgent).toHaveBeenCalledWith("project-api");
    expect(data).toMatchObject({ source: "api", sourceLabel: "API 聚合", agentState: "idle", agent: null });
  });
});
