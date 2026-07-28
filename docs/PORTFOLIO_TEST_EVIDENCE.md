# BidEvidence 测试证据

日期：2026-07-28

## 自动化基线

- ESLint：通过
- TypeScript：通过
- production build：通过
- 后端服务/API 测试：130/130
- 前端单元/组件测试：21 个文件，115/115
- 双语界面：英文默认、中文切换、刷新持久化和业务原文保护测试通过
- 响应版本历史：连续 v1–v4、相同正文不增版本、租户隔离、任意版本比较和批准事件无正文变化提示均通过
- Playwright E2E：7 passed，1 skipped
- Live API E2E：1 passed
- macOS DMG：隔离安装、启动、健康检查、项目创建、关闭和同数据重启烟测通过

## 复现方式

```bash
cd frontend
NEXT_PUBLIC_DEMO_MODE=false \
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 \
npm run build
```

完整验证使用临时 SQLite 数据库执行 `backend/scripts/seed.py`，生成固定演示数据，再启动 FastAPI 与 production Next.js，运行七条主旅程路由、Live API E2E 和 production build。

## 证据边界

- 数量来自合成 fixtures，不代表真实业务效果。
- `MockLLMProvider` 不是 DeepSeek 或其他真实模型的准确率证据。
- 截图证明当前可见状态，不替代键盘、读屏、性能或安全专项验收。
