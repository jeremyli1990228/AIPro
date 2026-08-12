"""AI 平台 FastAPI 后端 —— 统一提供 AI 报告助手 + AI 办公助手能力。

参考开源项目：
- 报告生成引擎参考 SmartBrief (MIT)   https://github.com/ch4nhm/SmartBrief
- 调度代理参考 open-schedule-agent (MIT) https://github.com/anthroos/open-schedule-agent

部署：Render / Railway / 本地
启动：uvicorn main:app --host 0.0.0.0 --port $PORT
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# 确保能导入 modules 包
sys.path.insert(0, str(Path(__file__).parent))

load_dotenv()

from modules import report_engine, schedule_agent, ticket_manager  # noqa: E402

app = FastAPI(title="AI Platform Backend", version="1.0.0")

# ===== CORS =====
allowed = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in allowed],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    import traceback
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "trace": traceback.format_exc() if os.getenv("DEBUG") == "true" else None},
    )


# ===== 健康检查 =====
@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "ai-platform-backend", "version": "1.0.0"}


# ===== AI 报告助手 API =====
class ReportRequest(BaseModel):
    template: str = "weekly"  # weekly | monthly
    type: str = "energy"      # energy | device | security
    startDate: str
    endDate: str
    campus: str = "智慧产业园"


@app.post("/api/report/generate")
async def api_generate_report(req: ReportRequest):
    result = await report_engine.generate_report(
        template=req.template,
        report_type=req.type,
        start_date=req.startDate,
        end_date=req.endDate,
        campus=req.campus,
    )
    return result


# ===== AI 办公助手 - 会议安排 API =====
class MeetingParseRequest(BaseModel):
    text: str


class BookRequest(BaseModel):
    meeting: dict
    roomId: str


@app.get("/api/schedule/rooms")
async def api_list_rooms():
    """列出所有会议室（参考 open-schedule-agent 的 availability check）"""
    return {"rooms": schedule_agent.load_rooms()}


@app.post("/api/schedule/parse")
async def api_parse_meeting(req: MeetingParseRequest):
    """NL → 会议结构化数据"""
    try:
        meeting = await schedule_agent.parse_meeting_request(req.text)
        rooms = schedule_agent.recommend_rooms(meeting)
        return {"meeting": meeting, "recommendedRooms": rooms}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/schedule/book")
async def api_book_meeting(req: BookRequest):
    """预订会议室"""
    booking = schedule_agent.book_room(req.meeting, req.roomId)
    if not booking:
        raise HTTPException(status_code=409, detail="会议室不可用或不存在")
    return {"booking": booking}


@app.get("/api/schedule/bookings")
async def api_list_bookings():
    return {"bookings": schedule_agent.list_recent_bookings()}


# ===== AI 办公助手 - 工单管理 API =====
class TicketCreateRequest(BaseModel):
    title: str
    type: str = "维修"
    priority: str = "中"
    location: str = ""
    desc: str = ""


class TicketParseRequest(BaseModel):
    text: str


@app.get("/api/tickets")
async def api_list_tickets(status: str = "all"):
    return {"tickets": ticket_manager.list_tickets(status)}


@app.post("/api/tickets")
async def api_create_ticket(req: TicketCreateRequest):
    ticket = ticket_manager.create_ticket(req.model_dump())
    return {"ticket": ticket}


@app.post("/api/tickets/parse")
async def api_parse_ticket(req: TicketParseRequest):
    """NL → 工单结构化数据"""
    try:
        ticket = await ticket_manager.parse_ticket_request(req.text)
        return {"ticket": ticket}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ===== 启动入口（兼容 Render/Railway） =====
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
