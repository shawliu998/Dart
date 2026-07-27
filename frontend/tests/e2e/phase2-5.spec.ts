import { expect, test } from "@playwright/test";

const projectId = "8b6b7330-8fe3-4a95-85df-2a5a9183fe01";
const liveApiBaseUrl = process.env.E2E_LIVE_API_BASE_URL?.replace(/\/$/, "");
const demoIdentityHeaders = {
  "X-Tenant-ID": "00000000-0000-0000-0000-000000000001",
  "X-User-ID": "00000000-0000-0000-0000-000000000002",
  "X-Role": "admin",
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bidevidence.locale", "zh");
  });
});

test("legacy login route redirects to the project workbench", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "项目" })).toBeVisible();
});

test("evidence library and matching keep claims and human decisions visible", async ({
  page,
}) => {
  await page.goto("/evidence");
  await expect(page.getByRole("heading", { name: "企业材料库" })).toBeVisible();
  await page.getByLabel("材料状态筛选").selectOption("conflict");
  await expect(
    page.getByRole("button", { name: /项目经理证书及履历.pdf/ }),
  ).toBeVisible();
  await expect(page.getByLabel("材料复用提示")).toContainText(
    "存在冲突，需要先复核",
  );
  await page.goto(`/projects/${projectId}/evidence-matching`);
  await expect(
    page.getByRole("heading", { name: "证据匹配工作台" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /统一社会信用代码一致/ }).click();
  await page.getByRole("button", { name: "接受证据" }).click();
  await expect(page.getByRole("status")).toContainText("本地演示已接受匹配");
});

test("consistency and amendment actions create an auditable demo flow", async ({
  page,
}) => {
  await page.goto(`/projects/${projectId}/consistency`);
  await page
    .getByPlaceholder(/说明采用该值/)
    .fill("已复核报价表和投标函，采用含税总价");
  await page.getByRole("button", { name: /采用标准值/ }).click();
  await expect(page.getByText("已解决")).toBeVisible();
  await page.goto(`/projects/${projectId}/amendments`);
  await page.getByRole("button", { name: /6.3.4 数据采集性能/ }).click();
  await page.getByRole("button", { name: /接受并应用变更/ }).click();
  await page.getByRole("button", { name: "接受并应用", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "本地演示已应用整份公告",
  );
});

test("seeded response review keeps missing evidence and package blockers under human control", async ({
  page,
  request,
}) => {
  test.skip(
    !liveApiBaseUrl,
    "需要连接已启动的真实 API；纯前端演示不会伪造响应审批状态。",
  );

  const seedResponse = await request.post(`${liveApiBaseUrl}/api/dev/seed`, {
    headers: demoIdentityHeaders,
  });
  expect(seedResponse.ok()).toBeTruthy();
  const seed = (await seedResponse.json()) as { project_id: string };
  const liveProjectId = process.env.E2E_LIVE_PROJECT_ID ?? seed.project_id;

  await page.goto(`/projects/${liveProjectId}/responses`);
  await expect(
    page.getByRole("heading", { name: "投标响应工作台" }),
  ).toBeVisible();

  const missingResponse = page.getByRole("button", { name: /ISO 9001 证书/ });
  const supportedResponse = page.getByRole("button", {
    name: /ISO 27001 证书/,
  });
  await expect(missingResponse).toBeVisible();
  await expect(supportedResponse).toBeVisible();

  await missingResponse.click();
  await expect(
    page.getByRole("heading", { name: "ISO 9001 证书", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("尚缺材料，补充后再复核")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "批准响应", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("heading", { name: "要求与依据" })).toBeVisible();
  await expect(
    page.getByText("招标文件.pdf", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(/第 3 页/).first()).toBeVisible();
  await expect(page.getByText(/没有可展示的已接受证据/)).toBeVisible();

  await supportedResponse.click();
  await expect(
    page.getByRole("heading", { name: "ISO 27001 证书", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("ISO/IEC 27001 信息安全管理体系证书", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("已核验", { exact: true })).toBeVisible();
  await page
    .getByRole("textbox", { name: "投标响应内容" })
    .fill("我方已提供有效的 ISO/IEC 27001 证书，并按招标文件要求响应。");
  await page
    .getByRole("textbox", { name: /修改.*复核意见/ })
    .fill("已核对证书原件、有效期和要求来源");
  await page.getByRole("button", { name: /保存并复核/ }).click();
  await expect(page.getByRole("status")).toContainText("响应草稿已保存");
  await expect(
    page.getByRole("button", { name: "批准响应", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "批准响应", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("响应已批准");
  await expect(
    page.getByRole("button", { name: "已批准", exact: true }),
  ).toBeDisabled();

  await page.goto(`/projects/${liveProjectId}/package`);
  await expect(page.getByRole("heading", { name: "交付包检查" })).toBeVisible();
  await page.getByRole("button", { name: "生成最终 ZIP" }).click();
  const packageDialog = page.getByRole("dialog", { name: "生成最终投标 ZIP" });
  await expect(packageDialog.getByText(/仍有 \d+ 个阻塞问题/)).toBeVisible();
  await expect(
    packageDialog.getByRole("button", { name: "批准并生成 ZIP" }),
  ).toBeDisabled();

  const blockedPackage = await request.post(
    `${liveApiBaseUrl}/api/projects/${liveProjectId}/package/build`,
    {
      headers: demoIdentityHeaders,
      data: {
        approved: true,
        approval_reason: "作品演示：人工复核后尝试生成最终包",
      },
    },
  );
  expect(blockedPackage.status()).toBe(409);
  await expect(blockedPackage.json()).resolves.toMatchObject({
    detail: "package with failed validations cannot be approved",
  });
});

test("tasks, package blockers and audit remain source-linked", async ({
  page,
}) => {
  await page.goto(`/projects/${projectId}/tasks`);
  await expect(page.getByRole("heading", { name: "整改任务" })).toBeVisible();
  await page.getByLabel("按状态筛选").selectOption("review");
  await expect(
    page.getByRole("button", { name: /补充有效 ISO 27001 续证证明/ }),
  ).toBeVisible();
  await page.getByLabel("按状态筛选").selectOption("all");
  await page.getByRole("button", { name: "流程视图" }).click();
  await expect(page.getByLabel("待复核列")).toBeVisible();
  await page.getByRole("button", { name: "工作清单" }).click();
  await page
    .getByRole("button", { name: /统一四份文件中的投标总报价/ })
    .click();
  await expect(
    page.locator(".task-source-chain").getByText("投标总报价不一致 · CI-001"),
  ).toBeVisible();
  await page.goto(`/projects/${projectId}/package`);
  await page.getByRole("button", { name: "生成最终 ZIP" }).click();
  await expect(page.getByText(/仍有 2 个阻塞问题/)).toBeVisible();
  await page.getByRole("button", { name: "关闭" }).click();
  await page.goto(`/projects/${projectId}/review`);
  await expect(page.getByRole("heading", { name: "最终复核" })).toBeVisible();
  await expect(page.getByRole("link", { name: "处理风险" })).toHaveAttribute(
    "href",
    `/projects/${projectId}/disqualifications`,
  );
  await expect(page.getByRole("link", { name: "核对要求" })).toHaveAttribute(
    "href",
    `/projects/${projectId}/requirements`,
  );
  await expect(
    page.getByRole("link", { name: "查看 Agent" }),
  ).not.toBeVisible();
  await page.goto(`/projects/${projectId}/audit`);
  await expect(page.getByRole("heading", { name: "全过程审计" })).toBeVisible();
  await page.getByLabel("操作者类型").selectOption("agent");
  await expect(
    page.getByRole("heading", { name: "提取招标要求", level: 2 }).first(),
  ).toBeVisible();
  await expect(page.getByText("requirement_extract@1.2")).toBeVisible();
});
