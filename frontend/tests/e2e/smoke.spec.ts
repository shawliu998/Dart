import { expect, test } from "@playwright/test";

test("project list opens the compliance workbench and source citation", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "投标项目" })).toBeVisible();
  await page.getByRole("link", { name: /智慧园区综合管理平台采购项目/ }).first().click();
  await expect(page.getByRole("heading", { name: "智慧园区综合管理平台采购项目" })).toBeVisible();
  await page.getByRole("link", { name: /继续要求确认/ }).click();
  await expect(page.getByRole("heading", { name: "招标要求工作台" })).toBeVisible();
  await page.locator(".matrix-table tbody tr").filter({ hasText: "ISO 27001 证书在有效期内" }).click();
  await expect(page.locator(".document-footer strong")).toHaveText("第 21 页");
  await expect(page.locator(".source-highlight")).toContainText("ISO 27001");
});

test("new project wizard completes local parsing flow", async ({ page }) => {
  await page.goto("/projects/new");
  await expect(page.getByRole("heading", { name: "新建投标项目" })).toBeVisible();
  for (let index = 0; index < 6; index += 1) {
    await page.getByRole("button", { name: /下一步/ }).click();
    await expect(page.getByText(`步骤 ${index + 2} / 7`)).toBeVisible();
  }
  await page.getByRole("button", { name: /确认并开始解析/ }).click();
  await expect(page.getByRole("heading", { name: "项目已创建，首批文件解析完成" })).toBeVisible();
  await expect(page.getByRole("link", { name: /进入要求工作台/ })).toBeVisible();
});

test("disqualification actions distinguish AI and human states", async ({ page }) => {
  await page.goto("/projects/8b6b7330-8fe3-4a95-85df-2a5a9183fe01/disqualifications");
  await expect(page.getByRole("heading", { name: "否决项中心" })).toBeVisible();
  const candidate = page.locator(".dq-item").filter({ hasText: "ISO 27001 证书已过有效期" });
  await candidate.locator(".dq-item-head").click();
  await expect(candidate.getByRole("button", { name: "人工确认" })).toBeVisible();
});
