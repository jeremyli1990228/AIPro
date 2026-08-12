"""工单管理模块 —— 演示用，localStorage 风格的本地 JSON 持久化。"""
from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Any

import httpx

DEFAULT_TICKETS = [
    {"id": "WO-2026-001", "title": "A栋3层空调不制冷", "type": "维修", "priority": "高",
     "status": "open", "location": "A栋3层", "desc": "中央空调出风口无冷风", "createTime": "2026-08-10 09:30"},
    {"id": "WO-2026-002", "title": "B栋大厅照明灯故障", "type": "维修", "priority": "中",
     "status": "in_progress", "location": "B栋1层", "desc": "大厅左侧照明灯不亮", "createTime": "2026-08-09 14:20"},
    {"id": "WO-2026-003", "title": "园区月度消防巡检", "type": "巡检", "priority": "中",
     "status": "closed", "location": "全园区", "desc": "消防设备月度检查", "createTime": "2026-08-05 10:00"},
    {"id": "WO-2026-004", "title": "C栋网络信号差", "type": "投诉", "priority": "紧急",
     "status": "open", "location": "C栋5层", "desc": "多户反映网络信号差", "createTime": "2026-08-11 16:45"},
]

STATUS_MAP = {"open": "待处理", "in_progress": "处理中", "closed": "已完成"}

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
TICKETS_FILE = os.path.join(DATA_DIR, "tickets.json")


def _ensure() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)


def load_tickets() -> list[dict]:
    _ensure()
    if not os.path.exists(TICKETS_FILE):
        save_tickets(DEFAULT_TICKETS)
        return list(DEFAULT_TICKETS)
    with open(TICKETS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_tickets(tickets: list[dict]) -> None:
    _ensure()
    with open(TICKETS_FILE, "w", encoding="utf-8") as f:
        json.dump(tickets, f, ensure_ascii=False, indent=2)


def list_tickets(filter_status: str = "all") -> list[dict]:
    tickets = load_tickets()
    if filter_status == "open":
        return [t for t in tickets if t["status"] in ("open", "in_progress")]
    if filter_status == "closed":
        return [t for t in tickets if t["status"] == "closed"]
    return tickets


def _next_id(tickets: list[dict]) -> str:
    year = datetime.now().year
    max_num = 0
    for t in tickets:
        try:
            num = int(t["id"].split("-")[2])
            max_num = max(max_num, num)
        except (IndexError, ValueError):
            pass
    return f"WO-{year}-{str(max_num + 1).zfill(3)}"


def create_ticket(ticket: dict) -> dict:
    tickets = load_tickets()
    new_ticket = {
        "id": _next_id(tickets),
        "title": ticket.get("title", ""),
        "type": ticket.get("type", "维修"),
        "priority": ticket.get("priority", "中"),
        "status": "open",
        "location": ticket.get("location", ""),
        "desc": ticket.get("desc", ""),
        "createTime": datetime.now().strftime("%Y-%m-%d %H:%M"),
    }
    tickets.insert(0, new_ticket)
    save_tickets(tickets)
    return new_ticket


# ===== NL → 工单结构化解析 =====
PARSE_PROMPT = """请解析以下工单请求，返回严格 JSON 格式（只返回 JSON，不要任何其他内容）：
{
  "title": "工单标题（简短）",
  "type": "维修|巡检|投诉|咨询",
  "priority": "低|中|高|紧急",
  "location": "位置（如 A栋3层）",
  "desc": "详细描述"
}

请求：{input}
"""

import re


async def parse_ticket_request(text: str) -> dict:
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
            pass
    return _parse_ticket_regex(text)


def _parse_ticket_regex(text: str) -> dict:
    location_match = re.search(r"([ABCD]栋\S*\d+层|[ABCD]栋\d+层|[ABCD]栋)", text)
    type_match = re.search(r"(维修|巡检|投诉|咨询)", text)
    priority_match = re.search(r"(紧急|高|中|低)", text)
    return {
        "title": text[:30],
        "type": type_match.group(1) if type_match else "维修",
        "priority": priority_match.group(1) if priority_match else "中",
        "location": location_match.group(0) if location_match else "",
        "desc": text,
    }


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
