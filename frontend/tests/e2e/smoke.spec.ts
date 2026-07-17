import { expect, test } from "@playwright/test";

test("project list opens the compliance workbench and source citation", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "投标项目" })).toBeVisible();
  await page.getByRole("link", { name: /智慧园区综合管理平台采购项目/ }).first().click();
  await expect(page.getByRole("heading", { name: "智慧园区综合管理平台采购项目" })).toBeVisible();
  await page.getByRole("link", { name: /复核招标要求/ }).click();
  await expect(page.getByRole("heading", { name: "招标要求工作台" })).toBeVisible();
  await page.locator(".matrix-table tbody tr").filter({ hasText: "ISO 27001 证书在有效期内" }).click();
  await expect(page.locator(".document-footer strong")).toHaveText("第 21 页");
  await expect(page.locator(".source-highlight")).toContainText("ISO 27001");
});

test("new project wizard starts the Agent workflow", async ({ page }) => {
  await page.goto("/projects/new");
  await expect(page.getByRole("heading", { name: "新建投标项目" })).toBeVisible();
  await page.getByRole("textbox", { name: /项目名称/ }).fill("本地 Agent 演示项目");
  await page.getByRole("button", { name: /下一步/ }).click();
  await expect(page.getByText("步骤 2 / 3")).toBeVisible();
  await page.getByLabel("选择文件").setInputFiles({ name: "招标文件.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF demo") });
  await page.getByRole("button", { name: /下一步/ }).click();
  await expect(page.getByText("步骤 3 / 3")).toBeVisible();
  await page.getByRole("button", { name: /确认并开始分析/ }).click();
  await expect(page.getByRole("heading", { name: "演示分析已准备完成" })).toBeVisible();
  await expect(page.getByRole("link", { name: /打开 Agent 工作台/ })).toBeVisible();
});

test("disqualification actions distinguish AI and human states", async ({ page }) => {
  await page.goto("/projects/8b6b7330-8fe3-4a95-85df-2a5a9183fe01/disqualifications");
  await expect(page.getByRole("heading", { name: "否决项中心" })).toBeVisible();
  const candidate = page.locator(".dq-item").filter({ hasText: "ISO 27001 证书已过有效期" });
  await candidate.locator(".dq-item-head").click();
  await expect(candidate.getByRole("button", { name: "人工确认" })).toBeVisible();
});
