# 响应版本历史与对比：执行包

## 本批范围

本批只补齐现有投标响应工作台中的内容版本历史和只读比较。它不新增路由、不创建第二套响应工作台，也不引入恢复版本、负责人、评论、通知、批量操作或 Agent 界面。

## 六项执行门槛

1. **竞品依据**
   - `docs/COMPETITOR_UI_AUDIT_2026-07-19.md` 中的 MyPitchFlow 登录态深测：结果页包含版本切换与历史。
   - 借鉴其“从当前编辑上下文进入历史”的任务结构；不复制品牌视觉，也不复刻无确认即创建新版本的行为。
2. **用户任务**
   - 投标编写人或复核人从当前响应条目查看先前保存内容。
   - 选择任意两个版本，核对正文差异、事件、时间和操作人。
   - 查看完成后返回同一条目的当前编辑，不离开工作台。
3. **当前差距**
   - 当前保存会覆盖 `edited_text`；界面显示的 `version` 是数据库行版本，不是可查看的内容历史。
   - 用户无法回答“改了什么、批准时是什么内容、由谁在何时形成”。
4. **可见结果**
   - 当前响应正文旁提供克制的“版本”入口。
   - 展开后显示不可变版本列表、From / To 选择和只读差异；默认比较最新版本与上一版本。
   - 只有一个版本时显示明确空状态；窄屏仍可完成选择和阅读。
5. **验收证据**
   - 一条响应依次经历基线、两次不同内容保存和批准后，形成连续的 v1–v4。
   - 刷新后历史仍存在；相同内容重复保存不产生新版本；无权限租户不可读取。
   - 后端 API/迁移测试、前端组件测试、production build 和桌面/窄屏截图均通过。
6. **复用决定**
   - 复用 `ResponseItem`、现有编辑/批准端点、`backend/app/services/responses.py`、`frontend/lib/api/responses.ts`、`ResponseWorkbench` 和原权限边界。
   - 精确缺失层是不可变正文快照及其只读呈现。
   - 仅新增 `ResponseRevision` 持久化模型、对应 Alembic 迁移、版本读取 DTO/API，以及两个职责单一的前端文件：版本面板和纯差异计算。

## 契约边界

- `ResponseItem.revision_number` 是用户可见的内容版本号，不复用行级 `version` 或生成批次 `generation_version`。
- `ResponseRevision` 只追加、不更新、不删除；保存、生成和批准与快照写入处于同一事务。
- 历史 API 只读：
  - `GET /api/responses/{response_id}/revisions`
  - `GET /api/responses/{response_id}/revisions/{revision_number}`
- 差异由前端对已读取的两个快照计算，后端不新增比较端点。
- 本批不提供恢复/回滚，避免把历史读取误变为新的写入工作流。

## 新文件必要性

- `backend/alembic/versions/0012_response_revisions.py`：已有数据库需要可重复升级、回填和回滚。
- `frontend/features/responses/response-version-panel.tsx`：版本选择和比较是独立、可测试的交互块，但仍由原工作台挂载。
- `frontend/features/responses/response-diff.ts`：差异算法保持纯函数，避免把非视觉逻辑嵌进大型工作台组件。

没有 V2、replacement、平行 API 或重复路由；原有响应编制链路继续作为唯一实现锚点。

## 验收结果

- 真实 API 顺序验证形成连续 `v1 generated → v2 edited → v3 edited → v4 approved`，批准事件与当时正文一并快照。
- 相同正文保存不生成伪版本；租户隔离、缺失版本和详情读取均由 API 测试覆盖。
- 原工作台中的“版本历史”按需加载；默认比较最新与上一版本，可切换任意版本。批准型版本无正文差异时显示中性说明，不暗示文本发生变化。
- `make lint`、`make test`、Next.js production build、迁移回填验证和桌面视觉检查均通过。
- Pro 终审结论：无 P0/P1，架构、事务、并发、租户权限和复用边界正确；界面符合克制的 B2B 工作台风格，结论为 `RESPONSE_VERSION_ACCEPT`。
- 视觉证据保存在本地 `.data/response-version-review/desktop-default.png` 与 `.data/response-version-review/desktop-changed.png`，不写入产品运行路径。
