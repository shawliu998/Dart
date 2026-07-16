# 第三方软件与许可证清单

本清单覆盖完整 MVP 的直接依赖类别，不替代包内许可证。发布以 lockfile、安装版本、镜像摘要和随附 LICENSE/NOTICE 为准，必须生成 SBOM。

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
| PostgreSQL / pgvector | 数据库与向量 | PostgreSQL License | 记录镜像、扩展版本和修改 |
| Redis | 队列/进度 | 版本相关 | 固定具体版本，按该版本许可法务复核 |
| MinIO | 本地 S3-compatible | AGPL-3.0（版本相关） | 网络部署/修改/分发前法务复核；StorageAdapter 可替换 |
| Docling | 文档解析 adapter 规划 | MIT（版本相关） | 实际引入后核实解析模型和资源 |
| PaddleOCR | OCR adapter 规划 | Apache-2.0（代码，模型另核） | 权重、字体和训练数据单独登记 |

## 资产来源

演示 PDF/DOCX/XLSX 由仓库 stdlib 脚本生成，只包含虚构企业/项目数据。未使用竞品品牌、文案、图片或真实企业证照。若引入字体、图标包外资源、OCR/Embedding 权重、模板或测试文档，必须建立独立资产台账。

## 发布流程

1. 锁定 Python/npm 依赖和容器镜像摘要，生成 SPDX 或 CycloneDX SBOM。
2. 使用 `pip-licenses`、npm license 工具和容器扫描器盘点直接/传递依赖。
3. 阻止未知许可证、商业限制或未经批准的 GPL/AGPL 风险进入发布。
4. 随发行物提供所需 LICENSE/NOTICE，记录修改和来源代码提供义务。
5. 每次依赖升级重新扫描漏洞和许可证；不能沿用旧版结论。
