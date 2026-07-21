# 第三方软件与许可证清单

标证通 BidEvidence 自身以 `AGPL-3.0-only` 发布，完整条款见仓库根目录 `LICENSE`。本清单覆盖完整 MVP 的直接依赖类别，不替代包内许可证。发布以 lockfile、安装版本、镜像摘要和随附 LICENSE/NOTICE 为准，必须生成 SBOM。

| 组件 | 用途 | 常见许可证 | 合规注意 |
|---|---|---|---|
| Next.js / React | Web 框架 | MIT | 保留版权与许可证，持续跟进安全版本 |
| TypeScript / Tailwind CSS | 开发与样式 | Apache-2.0 / MIT | Apache 组件保留 NOTICE（如有） |
| TanStack Table/Query | 表格与请求 | MIT | 保留许可证 |
| React Hook Form / Zod / Zustand | 表单、校验、状态 | MIT | 保留许可证 |
| Lucide | 图标 | ISC | 保留许可证，不复制竞品资产 |
| Playwright / Vitest / Testing Library | E2E 与单测 | Apache-2.0 / MIT | 测试工具通常不进入运行镜像 |
| FastAPI / Pydantic / Uvicorn | API 与 Schema | MIT / MIT / BSD-3-Clause | 保留许可证 |
| SQLAlchemy / Alembic / psycopg | ORM、迁移、驱动 | MIT / MIT / LGPL-3.0（psycopg，按版本核实） | 分发二进制驱动前核实对应条款 |
| pypdf | PDF 读取 | BSD-3-Clause | 保留许可证 |
| ReportLab | 确定性演示 PDF 生成 | BSD | 仅使用开源 PDF Toolkit，保留包内许可证 |
| Tesseract OCR | 可选本地 OCR 命令 | Apache-2.0 | 仅显式本地调用；分发时登记二进制及语言数据来源 |
| Poppler `pdftoppm` | 扫描 PDF 页渲染 | GPL-2.0-or-later（按发行版核实） | 当前仅调用系统命令；若随应用分发须单独完成 GPL 合规评估 |
| PostgreSQL / pgvector | 数据库与向量 | PostgreSQL License | 记录镜像、扩展版本和修改 |
| Redis | 队列/进度 | 版本相关 | 固定具体版本，按该版本许可法务复核 |
| MinIO | 本地 S3-compatible | AGPL-3.0（版本相关） | 网络部署/修改/分发前法务复核；StorageAdapter 可替换 |
| Docling | 文档解析 adapter 规划 | MIT（版本相关） | 实际引入后核实解析模型和资源 |
| PaddleOCR | 可替换 OCR adapter 规划 | Apache-2.0（代码，模型另核） | 实际引入时对权重、字体和训练数据单独登记 |

## 上游代码归属

| 上游项目 | 使用范围 | 固定版本 | 许可证与归属 |
|---|---|---|---|
| [Plane](https://github.com/makeplane/plane) | `frontend/components/ui/data-table.tsx` 表格原语及对应样式结构 | `7cef741c29cf61d3bca18dc892e6af11a1e7becc` | AGPL-3.0-only；保留 Plane Software, Inc. 原版权头和 SPDX 标识 |

## 资产来源

演示 PDF/DOCX/XLSX 由仓库确定性脚本生成，只包含虚构企业/项目数据。PDF 嵌入 `BidEvidence Fixture Sans` 字体子集，该字体由 Noto Sans SC 修改并重命名，依据 SIL Open Font License 1.1 分发；来源和完整许可证见 `demo/fonts/`。未使用竞品品牌、文案、图片或真实企业证照。若引入字体、图标包外资源、OCR/Embedding 权重、模板或测试文档，必须建立独立资产台账。

## 发布流程

1. 锁定 Python/npm 依赖和容器镜像摘要，生成 SPDX 或 CycloneDX SBOM。
2. 使用 `pip-licenses`、npm license 工具和容器扫描器盘点直接/传递依赖。
3. 阻止未知许可证和未经批准的商业限制进入发布；GPL/AGPL 组件须确认版本兼容性并履行源码提供、归属与修改声明义务。
4. 随发行物提供所需 LICENSE/NOTICE，记录修改和来源代码提供义务。
5. 每次依赖升级重新扫描漏洞和许可证；不能沿用旧版结论。
