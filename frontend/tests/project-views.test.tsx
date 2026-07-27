import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectList } from "@/features/projects/project-list";
import { getProjectViews, isProjectInView, projectViewHref } from "@/features/projects/project-views";
import { projects } from "@/lib/demo/data";

const push = vi.fn();
let search = "";

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects",
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(search),
}));

describe("project saved views", () => {
  beforeEach(() => {
    search = "";
    push.mockReset();
  });

  it("calculates each saved-view count from the displayed project collection", () => {
    expect(getProjectViews(projects)).toEqual([
      { key: "active", label: "进行中", count: 3 },
      { key: "review", label: "待处理", count: 3 },
      { key: "due", label: "7 天内截止", count: 0 },
      { key: "high-risk", label: "高风险", count: 2 },
    ]);
    expect(projectViewHref("active")).toBe("/projects");
    expect(projectViewHref("high-risk")).toBe("/projects?view=high-risk");
    expect(isProjectInView(projects[0], "high-risk")).toBe(true);
    expect(isProjectInView(projects[2], "high-risk")).toBe(false);
  });

  it("applies a selected view and writes its query parameter", async () => {
    const user = userEvent.setup();
    const rendered = render(<ProjectList initialProjects={projects} source="demo" />);

    await user.click(screen.getByRole("button", { name: /高风险 2/ }));

    expect(push).toHaveBeenCalledWith("/projects?view=high-risk");
    search = "view=high-risk";
    rendered.rerender(<ProjectList initialProjects={projects} source="demo" />);
    expect(screen.getByText("智慧园区综合管理平台采购项目")).toBeInTheDocument();
    expect(screen.getByText("城市数据中台升级服务")).toBeInTheDocument();
    expect(screen.queryByText("政务云安全运营项目")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /高风险 2/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("normalizes an unsupported saved-view query to the active project view", () => {
    search = "view=archived";
    render(<ProjectList initialProjects={projects} source="demo" />);

    expect(screen.getByText("智慧园区综合管理平台采购项目")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /进行中 3/ })).toHaveAttribute("aria-pressed", "true");
  });
});
