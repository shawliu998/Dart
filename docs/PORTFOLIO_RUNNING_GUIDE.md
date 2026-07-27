# BidEvidence 求职作品运行指南

## 最快方式

要求：Docker Compose v2、Python 3。

```bash
make demo
```

打开：

- Web：`http://localhost:3000/projects`
- API：`http://localhost:8000/docs`
- 登录：`admin@demo.local` / `demo1234`（仅 development）

固定演示项目：`00000000-0000-0000-0000-000000000003`

停止：

```bash
make down
```

## 建议演示顺序

1. `/projects/new`
2. `/projects/00000000-0000-0000-0000-000000000003/requirements`
3. `/evidence`
4. `/projects/00000000-0000-0000-0000-000000000003/responses`
5. `/projects/00000000-0000-0000-0000-000000000003/tasks`
6. `/projects/00000000-0000-0000-0000-000000000003/package`
7. `/projects/00000000-0000-0000-0000-000000000003/review`

完整环境、非 Docker 开发命令和边界说明见根目录 `README.md`。
