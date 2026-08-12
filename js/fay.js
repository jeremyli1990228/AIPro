// Fay 后端对接模块
// 参考 Fay 官方文档接口:
//   HTTP:  POST {base}/api/sendText   —— 发送文字,获取回答
//   WS:    ws://{host}/ws             —— 流式文字/语音
//   TTS:   可用 Fay 内建 TTS 合成音频,也可继续浏览器端 TTS
(function (global) {
  "use strict";

  const FayClient = {
    baseURL: "http://127.0.0.1:5000",
    useWs: false,
    ws: null,
    wsConnected: false,
    onText: null,       // 收到增量文本 (delta, full)
    onAudio: null,      // 收到音频 (Blob/Base64)
    onEnd: null,        // 本次回答结束
    onError: null,
    _pending: {},       // ws requestId -> {resolve, reject, buffer}

    configure({ baseURL, useWs }) {
      if (baseURL) this.baseURL = baseURL.replace(/\/$/, "");
      if (useWs !== undefined) this.useWs = !!useWs;
    },

    // —— 健康检查 ——
    async ping() {
      try {
        const r = await fetch(this.baseURL + "/", {
          method: "GET",
          signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : null
        });
        return { ok: r.ok, status: r.status };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    // —— 发送文字(HTTP) ——
    async sendText(text, opts = {}) {
      if (this.useWs && this.wsConnected) {
        return this._wsSendText(text, opts);
      }
      const url = this.baseURL + "/api/sendText";
      const body = JSON.stringify({
        content: text,
        senderId: opts.senderId || "web_demo_user",
        sessionId: opts.sessionId || "default"
      });
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : null
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(`Fay ${resp.status}: ${txt.slice(0, 200) || resp.statusText}`);
      }
      const data = await resp.json().catch(() => null);
      // Fay 返回格式通常: { data: { text: "..." } } 或 { reply: "..." } 或 { content: "..." }
      const reply = data?.data?.text || data?.reply || data?.content || (typeof data === "string" ? data : JSON.stringify(data || {}));
      // 若有音频字段,可回调
      if (data?.audio || data?.audioBase64) {
        if (this.onAudio) this.onAudio(data.audio || data.audioBase64);
      }
      if (this.onText) this.onText(reply, reply);
      if (this.onEnd) this.onEnd();
      return reply;
    },

    // —— WebSocket 通道 ——
    wsConnect() {
      return new Promise((resolve, reject) => {
        if (this.wsConnected) return resolve();
        // 将 http:// -> ws://
        const wsUrl = this.baseURL.replace(/^http/, "ws") + "/ws";
        try {
          this.ws = new WebSocket(wsUrl);
        } catch (e) {
          return reject(e);
        }
        const to = setTimeout(() => reject(new Error("连接超时")), 6000);
        this.ws.onopen = () => {
          clearTimeout(to);
          this.wsConnected = true;
          resolve();
        };
        this.ws.onerror = (e) => {
          clearTimeout(to);
          this.wsConnected = false;
          if (this.onError) this.onError(e);
          reject(e);
        };
        this.ws.onclose = () => {
          this.wsConnected = false;
        };
        this.ws.onmessage = (ev) => this._handleWsMsg(ev.data);
      });
    },

    wsDisconnect() {
      if (this.ws) { try { this.ws.close(); } catch {} }
      this.wsConnected = false;
    },

    _handleWsMsg(raw) {
      let msg;
      try { msg = typeof raw === "string" ? JSON.parse(raw) : raw; }
      catch { msg = { type: "text", content: raw }; }
      const reqId = msg.requestId || msg.id;
      const p = reqId ? this._pending[reqId] : null;

      switch (msg.type || msg.event) {
        case "text":
        case "delta":
        case "chunk": {
          const d = msg.content || msg.text || msg.delta || "";
          if (p && typeof d === "string") {
            p.buffer += d;
            if (this.onText) this.onText(d, p.buffer);
          } else if (this.onText && typeof d === "string") {
            this.onText(d, d);
          }
          break;
        }
        case "audio":
        case "tts": {
          if (this.onAudio) this.onAudio(msg.audio || msg.data || msg.base64);
          break;
        }
        case "end":
        case "done":
        case "finish": {
          if (p) {
            const ans = p.buffer;
            delete this._pending[reqId];
            if (this.onEnd) this.onEnd(ans);
            p.resolve(ans);
          } else if (this.onEnd) {
            this.onEnd();
          }
          break;
        }
        case "error": {
          const err = new Error(msg.message || msg.content || "Fay WS 错误");
          if (p) { p.reject(err); delete this._pending[reqId]; }
          else if (this.onError) this.onError(err);
          break;
        }
        default:
          // 其他事件忽略
          break;
      }
    },

    async _wsSendText(text, opts) {
      await this.wsConnect();
      const reqId = String(Date.now()) + Math.random().toString(36).slice(2, 6);
      return new Promise((resolve, reject) => {
        this._pending[reqId] = { resolve, reject, buffer: "" };
        const to = setTimeout(() => {
          delete this._pending[reqId];
          reject(new Error("Fay WS 响应超时"));
        }, 60000);
        const origResolve = resolve;
        this._pending[reqId].resolve = (ans) => {
          clearTimeout(to);
          origResolve(ans);
        };
        const origReject = reject;
        this._pending[reqId].reject = (err) => {
          clearTimeout(to);
          origReject(err);
        };
        this.ws.send(JSON.stringify({
          type: "text",
          content: text,
          requestId: reqId,
          senderId: opts.senderId || "web_demo_user",
          sessionId: opts.sessionId || "default"
        }));
      });
    }
  };

  global.FayClient = FayClient;
})(window);
