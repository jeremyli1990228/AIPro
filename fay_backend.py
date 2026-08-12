# 简化版 Fay 后端(兼容 Fay 前端协议)
# Python 3.10 可运行,无需 3.12
# 安装依赖: pip install fastapi uvicorn websockets requests
# 启动: python fay_backend.py

import json
import asyncio
import uuid
import time
from typing import Optional

import requests
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ============ 配置 ============
DEEPSEEK_API_KEY = "sk-your-deepseek-api-key"  # 替换为您的 Key
DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"
SYSTEM_PROMPT = "你是一个友好的 AI 数字人助手,回答要简洁自然,像真人对话。"
# ================================

app = FastAPI(title="Fay Simplified Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SendTextRequest(BaseModel):
    content: str
    senderId: Optional[str] = "web_user"
    sessionId: Optional[str] = "default"


class SendTextResponse(BaseModel):
    data: dict


# ============ 调用 LLM ============
def call_llm(text: str, stream: bool = False) -> str:
    """调用 DeepSeek API,返回完整文本"""
    if DEEPSEEK_API_KEY.startswith("sk-your"):
        # 未配置 Key,返回模拟回答
        return f"你好!我是 Fay 数字人后端。您说的是「{text}」。请在 fay_backend.py 中配置 DEEPSEEK_API_KEY 以启用真实 AI 回答。"

    try:
        resp = requests.post(
            DEEPSEEK_API_URL,
            headers={
                "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "deepseek-chat",
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": text},
                ],
                "stream": stream,
            },
            timeout=30,
        )
        resp.raise_for_status()

        if stream:
            return ""  # stream 模式单独处理
        data = resp.json()
        return data["choices"][0]["message"]["content"]
    except Exception as e:
        return f"(LLM 调用失败: {e})"


def call_llm_stream(text: str):
    """流式调用,yield 增量文本"""
    if DEEPSEEK_API_KEY.startswith("sk-your"):
        # 模拟流式响应
        demo = f"你好!我是 Fay 数字人后端。关于「{text}」:"
        words = list(demo) + ["\n\n这是一个演示回答。配置真实 API Key 后将接入 DeepSeek。"]
        for w in words:
            time.sleep(0.03)
            yield w
        return

    try:
        resp = requests.post(
            DEEPSEEK_API_URL,
            headers={
                "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "deepseek-chat",
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": text},
                ],
                "stream": True,
            },
            timeout=60,
            stream=True,
        )
        resp.raise_for_status()

        for line in resp.iter_lines(decode_unicode=True):
            if not line:
                continue
            if line.startswith("data: "):
                line = line[6:]
                if line == "[DONE]":
                    break
                try:
                    chunk = json.loads(line)
                    delta = chunk["choices"][0].get("delta", {}).get("content", "")
                    if delta:
                        yield delta
                except json.JSONDecodeError:
                    continue
    except Exception as e:
        yield f"(流式 LLM 调用失败: {e})"


# ============ 路由 ============
@app.get("/")
async def root():
    return {"status": "ok", "service": "Fay Simplified Backend", "version": "0.1"}


@app.get("/api/ping")
async def ping():
    return {"status": "ok"}


@app.post("/api/sendText")
async def send_text(req: SendTextRequest):
    """HTTP 模式:发送文字,获取完整回答"""
    reply = call_llm(req.content, stream=False)
    return SendTextResponse(data={"text": reply})


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """WebSocket 模式:流式对话"""
    await ws.accept()
    print(f"[Fay WS] 新连接,远程: {ws.client}")

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                msg = {"type": "text", "content": raw}

            if msg.get("type") not in ("text", None):
                continue

            content = msg.get("content", "")
            request_id = msg.get("requestId", str(uuid.uuid4()))

            print(f"[Fay WS] 收到: {content[:50]}... (requestId={request_id})")

            # 发送确认
            await ws.send_json({
                "type": "ack",
                "requestId": request_id,
                "message": "正在思考..."
            })

            # 流式返回
            full_text = ""
            async for delta in _stream_llm(content):
                full_text += delta
                await ws.send_json({
                    "type": "delta",
                    "content": delta,
                    "requestId": request_id
                })

            # 结束
            await ws.send_json({
                "type": "end",
                "requestId": request_id
            })

    except WebSocketDisconnect:
        print("[Fay WS] 连接断开")
    except Exception as e:
        print(f"[Fay WS] 错误: {e}")


async def _stream_llm(text: str):
    """把同步 generator 包成 async generator"""
    loop = asyncio.get_event_loop()
    queue: asyncio.Queue = asyncio.Queue()
    sentinel = object()

    def run():
        try:
            for delta in call_llm_stream(text):
                loop.call_soon_threadsafe(queue.put_nowait, delta)
        except Exception as e:
            loop.call_soon_threadsafe(queue.put_nowait, f"(错误: {e})")
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, sentinel)

    import threading
    t = threading.Thread(target=run, daemon=True)
    t.start()

    while True:
        item = await queue.get()
        if item is sentinel:
            break
        yield item


if __name__ == "__main__":
    import uvicorn
    print("=" * 50)
    print("  Fay 简化版后端启动中...")
    print("  地址: http://127.0.0.1:5000")
    print("  WS:   ws://127.0.0.1:5000/ws")
    print("  按 Ctrl+C 停止")
    print("=" * 50)
    uvicorn.run(app, host="127.0.0.1", port=5000, log_level="info")