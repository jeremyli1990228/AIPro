// LLM 调用模块 —— OpenAI 兼容接口(DeepSeek 等)
(function (global) {
  "use strict";

  const LLM = {
    // 调用 /chat/completions 接口,支持流式
    async chat({ baseURL, apiKey, model, messages, temperature = 0.7, onDelta }) {
      const url = baseURL.replace(/\/$/, "") + "/chat/completions";
      const headers = {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey
      };
      const body = JSON.stringify({
        model,
        messages,
        temperature,
        stream: !!onDelta
      });

      const resp = await fetch(url, { method: "POST", headers, body });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`API ${resp.status}: ${txt.slice(0, 200)}`);
      }

      if (!onDelta) {
        const data = await resp.json();
        return data.choices?.[0]?.message?.content || "";
      }

      // 流式读取
      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const t = line.trim();
          if (!t || !t.startsWith("data:")) continue;
          const data = t.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content || "";
            if (delta) {
              full += delta;
              onDelta(delta, full);
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
      return full;
    }
  };

  global.LLM = LLM;
})(window);
