"""调度代理 —— 参考 open-schedule-agent (MIT) 的 AI 调度代理模式适配。

open-schedule-agent 原版模式：
    AI Agent 解析 NL → 查 calendar 可用性 → 预订 → 同步日历
本模块适配为：
    parse_meeting_request(text) → 查 rooms 可用性 → 推荐会议室 → 预订

源项目：https://github.com/anthroos/open-schedule-agent
       (MIT License, Copyright (c) 2026 Ivan Paschnyk / WeLabelData Inc.)

注：原项目依赖 Google Calendar OAuth，部署门槛高。本模块用本地 JSON 存储
    作为日历抽象（与原项目 calendar/base.py 的抽象接口对齐），便于演示。
"""
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timedelta
from typing import Any

import httpx

# ===== 会议室数据（演示用，与前端 office.js 对齐） =====
DEFAULT_ROOMS = [
    {"id": "A301", "name": "A栋3层-1号会议室", "capacity": 12,
     "equipment": ["投影仪", "白板", "视频会议"], "status": "available"},
    {"id": "A302", "name": "A栋3层-2号会议室", "capacity": 8,
     "equipment": ["投影仪", "白板"], "status": "available"},
    {"id": "B201", "name": "B栋2层-大会议室", "capacity": 30,
     "equipment": ["LED屏", "音响", "视频会议"], "status": "occupied"},
    {"id": "B202", "name": "B栋2层-小会议室", "capacity": 6,
     "equipment": ["白板"], "status": "available"},
    {"id": "C105", "name": "C栋1层-培训室", "capacity": 50,
     "equipment": ["投影仪", "音响", "LED屏"], "status": "available"},
]

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
ROOMS_FILE = os.path.join(DATA_DIR, "rooms.json")
BOOKINGS_FILE = os.path.join(DATA_DIR, "bookings.json")


def _ensure_data_dir() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)


def load_rooms() -> list[dict]:
    """加载会议室列表（参考 open-schedule-agent 的 calendar 数据层）"""
    _ensure_data_dir()
    if not os.path.exists(ROOMS_FILE):
        save_rooms(DEFAULT_ROOMS)
        return list(DEFAULT_ROOMS)
    with open(ROOMS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_rooms(rooms: list[dict]) -> None:
    _ensure_data_dir()
    with open(ROOMS_FILE, "w", encoding="utf-8") as f:
        json.dump(rooms, f, ensure_ascii=False, indent=2)


def load_bookings() -> list[dict]:
    _ensure_data_dir()
    if not os.path.exists(BOOKINGS_FILE):
        save_bookings([])
        return []
    with open(BOOKINGS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_bookings(bookings: list[dict]) -> None:
    _ensure_data_dir()
    with open(BOOKINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(bookings, f, ensure_ascii=False, indent=2)


# ===== LLM 调用 =====
async def call_llm(messages: list[dict], temperature: float = 0.0) -> str:
    base_url = os.getenv("LLM_BASE_URL", "https://api.deepseek.com/v1").rstrip("/")
    api_key = os.getenv("LLM_API_KEY", "")
    model = os.getenv("LLM_MODEL", "deepseek-chat")
    if not api_key:
        raise RuntimeError("后端未配置 LLM_API_KEY")
    url = f"{base_url}/chat/completions"
    payload = {"model": model, "messages": messages, "temperature": temperature, "stream": False}
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


# ===== NL → 会议结构化解析（参考 open-schedule-agent 的 agent 解析逻辑） =====
PARSE_PROMPT = """请解析以下会议请求，返回严格 JSON 格式（只返回 JSON，不要任何其他内容）：
{
  "title": "会议主题",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "duration": 60,
  "attendees": ["张三", "李四"],
  "roomRequirement": "A栋3层会议室"
}

规则：
- date 必须是 YYYY-MM-DD 格式，"明天"=明天日期，"后天"=后天日期
- time 必须是 HH:MM 24小时制
- duration 单位分钟，默认 60
- attendees 是字符串数组
- roomRequirement 是用户对会议室的明确需求描述（楼宇/层数/设备等），无则空字符串

请求：{input}
"""


async def parse_meeting_request(text: str) -> dict:
    """NL → 会议结构化数据。优先用 LLM，失败回退到正则。"""
    api_key = os.getenv("LLM_API_KEY", "")
    if api_key:
        try:
            raw = await call_llm(
                [{"role": "user", "content": PARSE_PROMPT.format(input=text)}],
                temperature=0.0,
            )
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
                if raw.endswith("```"):
                    raw = raw[:-3]
                raw = raw.strip()
            return json.loads(raw)
        except Exception:
            pass  # 回退到正则
    return _parse_with_regex(text)


def _parse_with_regex(text: str) -> dict:
    """正则兜底解析"""
    title_match = re.search(r"(会议|评审会|研讨会|例会|讨论会)", text)
    date_match = re.search(r"明天|后天|(\d{4}-\d{2}-\d{2})", text)
    time_match = re.search(r"(\d{1,2}:\d{2})", text)
    attendees_match = re.search(r"参会人有([^，,；;。.]+)", text)
    room_match = re.search(r"([ABCD]栋\S*会议室|[ABCD]栋\d层)", text)

    today = datetime.now()
    if date_match:
        d = date_match.group(0)
        if d == "明天":
            date = (today + timedelta(days=1)).strftime("%Y-%m-%d")
        elif d == "后天":
            date = (today + timedelta(days=2)).strftime("%Y-%m-%d")
        else:
            date = d
    else:
        date = today.strftime("%Y-%m-%d")

    time_str = time_match.group(1) if time_match else "15:00"
    attendees = (
        [a.strip() for a in re.split(r"[、，,]", attendees_match.group(1))]
        if attendees_match else []
    )
    return {
        "title": title_match.group(0) if title_match else "项目会议",
        "date": date,
        "time": time_str,
        "duration": 60,
        "attendees": attendees,
        "roomRequirement": room_match.group(0) if room_match else "",
    }


# ===== 会议室推荐（参考 open-schedule-agent 的 availability check） =====
def recommend_rooms(meeting: dict) -> list[dict]:
    """根据会议需求推荐可用会议室，按容量匹配度+设备匹配度排序"""
    rooms = load_rooms()
    attendees_count = len(meeting.get("attendees", []))
    requirement = meeting.get("roomRequirement", "") or ""

    available = [r for r in rooms if r.get("status") == "available"]

    def score(room: dict) -> tuple[int, int]:
        # 容量匹配度：越接近需求人数越好
        capacity_score = abs(room["capacity"] - max(attendees_count, 1))
        # 设备匹配度
        equip_score = sum(1 for e in room["equipment"] if e in requirement) if requirement else 0
        return (capacity_score, -equip_score)  # 负号因为我们要降序 equip

    available.sort(key=score)
    return available


def book_room(meeting: dict, room_id: str) -> dict | None:
    """预订会议室。返回预订记录或 None（房间不可用）"""
    rooms = load_rooms()
    room = next((r for r in rooms if r["id"] == room_id), None)
    if not room or room.get("status") != "available":
        return None

    bookings = load_bookings()
    booking = {
        "id": f"MTG-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "title": meeting.get("title", "项目会议"),
        "date": meeting.get("date", ""),
        "time": meeting.get("time", ""),
        "duration": meeting.get("duration", 60),
        "attendees": meeting.get("attendees", []),
        "roomId": room["id"],
        "roomName": room["name"],
        "createTime": datetime.now().isoformat(),
    }
    bookings.insert(0, booking)
    # 只保留最近 100 条
    save_bookings(bookings[:100])
    return booking


def list_recent_bookings(limit: int = 10) -> list[dict]:
    return load_bookings()[:limit]
