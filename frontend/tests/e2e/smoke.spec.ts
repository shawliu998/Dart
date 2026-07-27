import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bidevidence.locale", "zh");
  });
});

test("project list opens the compliance workbench and source citation", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "项目" })).toBeVisible();
  await page.getByRole("link", { name: /智慧园区综合管理平台采购项目/ }).first().click();
  await expect(page.getByRole("heading", { name: "智慧园区综合管理平台采购项目" })).toBeVisible();
  await page.getByRole("link", { name: "复核招标要求", exact: true }).click();
  await expect(page.getByRole("heading", { name: "合规审阅" })).toBeVisible();
  await page.locator(".matrix-table tbody tr").filter({ hasText: "ISO 27001 证书在有效期内" }).click();
  await expect(page.locator(".document-footer strong")).toHaveText("第 21 页");
  await expect(page.locator(".source-highlight")).toContainText("ISO 27001");
});

test("new project intake uploads a tender file and starts the Agent workflow", async ({ page }) => {
  await page.goto("/projects/new");
  await expect(page.getByRole("heading", { name: "新建投标项目" })).toBeVisible();
  await page.getByRole("textbox", { name: /项目名称/ }).fill("本地 Agent 演示项目");
  const fileInput = page.getByLabel("添加文件");
  await fileInput.setInputFiles({ name: "招标文件.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF demo") });
  await expect(page.getByRole("cell", { name: "招标文件.pdf", exact: true })).toBeVisible();
  await expect(page.getByLabel("设置 招标文件.pdf 文档类型")).toHaveValue("tender_main");
  await expect(page.getByRole("button", { name: "创建并开始分析" })).toBeEnabled();
  await page.getByRole("button", { name: "创建并开始分析" }).click();
  await expect(page).toHaveURL(/\/projects\/8b6b7330-8fe3-4a95-85df-2a5a9183fe01\/overview$/);
  await expect(page.getByRole("heading", { name: "智慧园区综合管理平台采购项目" })).toBeVisible();
});

test("disqualification actions distinguish AI and human states", async ({ page }) => {
  await page.goto("/projects/8b6b7330-8fe3-4a95-85df-2a5a9183fe01/disqualifications");
  await expect(page.getByRole("heading", { name: "否决项中心" })).toBeVisible();
  const candidate = page.locator(".dq-item").filter({ hasText: "ISO 27001 证书已过有效期" });
  await candidate.locator(".dq-item-head").click();
  await expect(candidate.getByRole("button", { name: "人工确认" })).toBeVisible();
});
