import { expect, test } from "@playwright/test";

const projectId = "8b6b7330-8fe3-4a95-85df-2a5a9183fe01";

test("legacy login route redirects to the project workbench", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "项目" })).toBeVisible();
});

test("evidence library and matching keep claims and human decisions visible", async ({ page }) => {
  await page.goto("/evidence");
  await expect(page.getByRole("heading", { name: "企业材料库" })).toBeVisible();
  await page.locator(".evidence-alerts").getByRole("button", { name: /存在冲突/ }).click();
  await expect(page.getByText("项目经理证书及履历.pdf")).toBeVisible();
  await page.goto(`/projects/${projectId}/evidence-matching`);
  await expect(page.getByRole("heading", { name: "证据匹配工作台" })).toBeVisible();
  await page.getByRole("button", { name: /统一社会信用代码一致/ }).click();
  await page.getByRole("button", { name: "接受证据" }).click();
  await expect(page.getByRole("status")).toContainText("本地演示已接受匹配");
});

test("consistency and amendment actions create an auditable demo flow", async ({ page }) => {
  await page.goto(`/projects/${projectId}/consistency`);
  await page.getByPlaceholder(/说明采用该值/).fill("已复核报价表和投标函，采用含税总价");
  await page.getByRole("button", { name: /采用标准值/ }).click();
  await expect(page.getByText("已解决")).toBeVisible();
  await page.goto(`/projects/${projectId}/amendments`);
  await page.getByRole("button", { name: /6.3.4 数据采集性能/ }).click();
  await page.getByRole("button", { name: /接受并应用变更/ }).click();
  await page.getByRole("button", { name: "接受并应用", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("本地演示已应用整份公告");
});

test("tasks, package blockers and audit remain source-linked", async ({ page }) => {
  await page.goto(`/projects/${projectId}/tasks`);
  await expect(page.getByRole("heading", { name: "整改任务" })).toBeVisible();
  await expect(page.locator(".task-source-chain").getByText("投标总报价不一致 · CI-001")).toBeVisible();
  await page.goto(`/projects/${projectId}/package`);
  await page.getByRole("button", { name: "生成最终 ZIP" }).click();
  await expect(page.getByText(/仍有 2 个阻塞问题/)).toBeVisible();
  await page.getByRole("button", { name: "关闭" }).click();
  await page.goto(`/projects/${projectId}/audit`);
  await expect(page.getByRole("heading", { name: "全过程审计" })).toBeVisible();
  await page.getByLabel("操作者类型").selectOption("agent");
  await expect(page.getByRole("heading", { name: "提取招标要求", level: 2 }).first()).toBeVisible();
  await expect(page.getByText("requirement_extract@1.2")).toBeVisible();
});
