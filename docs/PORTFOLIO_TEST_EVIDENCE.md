# BidEvidence 求职作品测试证据

日期：2026-07-27

## 自动化基线

- ESLint：通过
- TypeScript：通过
- production build：通过
- 前端单元/组件测试：20 个文件，109/109
- 双语界面：英文默认、中文切换、刷新持久化和业务原文保护测试通过
- Playwright E2E：7 passed，1 skipped
- Batch 05 最终复核聚焦测试：3/3

逐批命令、截图尺寸和交互断言见：

- `BATCH01_EXECUTION_EVIDENCE.md`
- `BATCH02_EXECUTION_EVIDENCE.md`
- `BATCH03_EXECUTION_EVIDENCE.md`
- `BATCH04_EXECUTION_EVIDENCE.md`
- `BATCH05_EXECUTION_EVIDENCE.md`
- `BILINGUAL_UI_ACCEPTANCE.md`

## 当前终验

```bash
cd frontend
NEXT_PUBLIC_DEMO_MODE=false \
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 \
npm run build
```

本轮使用全新临时 SQLite 数据库执行 `backend/scripts/seed.py`，生成完整固定演示数据，再启动 FastAPI 与 production Next.js，逐页访问七条主旅程路由并采集截图。

## 证据边界

- 数量来自合成 fixtures，不代表真实业务效果。
- `MockLLMProvider` 不是 DeepSeek 或其他真实模型的准确率证据。
- 截图证明当前可见状态，不替代键盘、读屏、性能或安全专项验收。
- 旧持久库重复 seed 冲突记录为 P2；干净库运行与本轮作品封装不受影响。
