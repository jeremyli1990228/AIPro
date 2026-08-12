# AI 平台后端

统一提供 **AI 报告助手** 和 **AI 办公助手** 能力的 FastAPI 服务。

## 开源项目致谢

本后端参考以下真开源项目的架构与设计模式重写：

| 模块 | 参考开源项目 | License | GitHub |
|---|---|---|---|
| 报告生成引擎 (`modules/report_engine.py`) | **SmartBrief** 智能简报 | MIT | https://github.com/ch4nhm/SmartBrief |
| 调度代理 (`modules/schedule_agent.py`) | **open-schedule-agent** schedulebot | MIT | https://github.com/anthroos/open-schedule-agent |

- SmartBrief 原为 Electron + Vue 桌面应用，本后端将其"Git log + 模板 + 时间范围 + AI 生成"的核心模式适配为接受用户数据输入的 HTTP API。
- open-schedule-agent 原依赖 Google Calendar OAuth + MCP，部署门槛高。本后端保留其"NL 解析 → 查可用性 → 推荐 → 预订"的代理模式，使用本地 JSON 存储替代日历抽象层，便于演示。

## API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| POST | `/api/report/generate` | 生成报告（模板+类型+时间范围） |
| GET | `/api/schedule/rooms` | 列出所有会议室 |
| POST | `/api/schedule/parse` | NL → 会议结构化数据 + 推荐会议室 |
| POST | `/api/schedule/book` | 预订会议室 |
| GET | `/api/schedule/bookings` | 最近预订记录 |
| GET | `/api/tickets?status=all\|open\|closed` | 工单列表 |
| POST | `/api/tickets` | 创建工单 |
| POST | `/api/tickets/parse` | NL → 工单结构化数据 |

## 本地运行

```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # macOS/Linux
pip install -r requirements.txt

copy .env.example .env  # Windows
# cp .env.example .env  # macOS/Linux
# 编辑 .env 填入 LLM_API_KEY

python main.py
# 或：uvicorn main:app --reload --port 8001
```

默认监听 http://127.0.0.1:8001，Swagger 文档 http://127.0.0.1:8001/docs

## 部署到 Render（免费层）

1. 在 https://render.com 创建账户
2. New → Web Service → 连接 GitHub 仓库 `jeremyli1990228/AIPro`
3. 配置：
   - **Root Directory**: `backend`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Environment Variables**:
     - `LLM_API_KEY` = 你的 DeepSeek API Key
     - `LLM_BASE_URL` = https://api.deepseek.com/v1
     - `LLM_MODEL` = deepseek-chat
     - `ALLOWED_ORIGINS` = https://jeremyli1990228.github.io,http://localhost:8000
4. 部署完成后获得形如 `https://aipro-xxxx.onrender.com` 的地址
5. 在前端设置弹窗中填入该地址，切换到 "后端模式"

## 部署到 Railway（免费层）

```bash
# 安装 Railway CLI
npm i -g @railway/cli
railway login
cd backend
railway init       # 关联到 AIPro 仓库
railway up         # 部署
railway open       # 打开管理面板，设置环境变量
```

## 部署到本地 / 内网

直接 `python main.py` 启动即可，前端通过设置面板填入 `http://<内网IP>:8001`。

## 数据持久化

- `data/rooms.json` - 会议室列表
- `data/bookings.json` - 预订记录（最多保留 100 条）
- `data/tickets.json` - 工单列表

Render/Railway 免费层的文件系统是**临时**的，重启会丢失数据。生产环境建议挂载持久化卷或替换为数据库（PostgreSQL/SQLite）。
