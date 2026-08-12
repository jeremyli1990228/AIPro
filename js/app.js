// 主应用逻辑 v3 —— 统一平台（数字人/报告/办公助手）+ 视图切换 + 共享配置
(function () {
  "use strict";

  // 使用共享配置
  let cfg = Shared.cfg;
  const IS_MOBILE = window.IS_MOBILE || false;
  const IS_HTTPS = window.IS_HTTPS !== false;
  function saveCfg() {
    Shared.cfg = cfg;
    Shared.saveCfg(cfg);
  }

  let messages = [];
  const $ = Shared.$;
  const chatLog = $("chat-log");
  const textInput = $("text-input");
  const micBtn = $("btn-mic");
  const sendBtn = $("btn-send");
  const statusPill = $("status-pill");
  const statusText = $("status-text");
  const voiceHint = $("voice-hint");
  const modeIndicator = $("mode-indicator");

  // ===== 视图切换 =====
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      Shared.switchView(item.dataset.view);
    });
  });

  function setStatus(state, label) {
    statusPill.className = "status-pill " + state;
    statusText.textContent = label;
  }

  function addMsg(role, text, opts = {}) {
    const div = document.createElement("div");
    div.className = "msg msg-" + role;
    const av = document.createElement("div");
    av.className = "msg-avatar";
    av.textContent = role === "bot" ? cfg.name.slice(0, 2) : "我";
    const b = document.createElement("div");
    b.className = "msg-bubble";
    b.style.whiteSpace = "pre-wrap";
    b.textContent = text;
    div.appendChild(av);
    div.appendChild(b);
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
    return b;
  }

  // ===== 播报处理 =====
  function speak(text) {
    if (cfg.ttsEngine === "fay" && cfg.mode === "fay") {
      // Fay 模式下由后端返回音频（预留）
    }
    TTS.speak(text, { rate: cfg.rate });
  }

  TTS.onStart = () => {
    setStatus("speaking", "播报中");
    Avatar.setSpeaking(true);
  };
  TTS.onEnd = () => {
    Avatar.setSpeaking(false);
    setStatus("idle", "待命中");
  };

  // ===== 主流程：根据模式分流 =====
  async function handleUserInput(text) {
    text = text.trim();
    if (!text) return;
    addMsg("user", text);
    messages.push({ role: "user", content: text });
    textInput.value = "";

    // 1) 知识库（静态 + 园区 API 动态）
    if (cfg.kbEnabled) {
      const hit = await Knowledge.query(text);
      if (hit.matched) {
        await respond(hit.answer);
        return;
      }
    }

    // 2) 模式分流
    if (cfg.mode === "fay") {
      await callFayBackend(text);
    } else {
      await callBrowserLLM();
    }
  }

  async function respond(text) {
    setStatus("thinking", "生成中");
    const b = addMsg("bot", text);
    messages.push({ role: "assistant", content: text });
    setTimeout(() => speak(text), 100);
  }

  // ===== 浏览器端 LLM（流式） =====
  async function callBrowserLLM() {
    if (!cfg.apiKey) {
      await respond("尚未配置 API Key。请点击左侧设置 → 大脑/模式 → 选择浏览器端模式并填入 DeepSeek API Key。\n或切换到 Fay 后端模式(需本地运行 Fay)。");
      return;
    }
    setStatus("thinking", "思考中");
    Avatar.setThinking(true);
    const bubble = addMsg("bot", "");
    let full = "";
    try {
      const sysMsg = { role: "system", content: cfg.persona };
      await LLM.chat({
        baseURL: cfg.baseURL,
        apiKey: cfg.apiKey,
        model: cfg.model,
        messages: [sysMsg, ...messages],
        onDelta: (_d, f) => {
          full = f;
          bubble.textContent = full;
          chatLog.scrollTop = chatLog.scrollHeight;
        }
      });
      Avatar.setThinking(false);
      messages.push({ role: "assistant", content: full });
      speak(full);
    } catch (err) {
      Avatar.setThinking(false);
      setStatus("idle", "待命中");
      bubble.textContent = "调用失败:" + err.message + "\n(请检查网络、API Key 和 Base URL,或切换模式)";
      bubble.style.color = "#ff6b6b";
    }
  }

  // ===== Fay 后端 =====
  async function callFayBackend(text) {
    if (!cfg.fayURL) {
      await respond("Fay 后端地址未配置。请点击设置 → 大脑/模式 → Fay 后端模式,填入后端地址。");
      return;
    }
    setStatus("thinking", "Fay 处理中");
    Avatar.setThinking(true);
    const bubble = addMsg("bot", "");
    let full = "";
    FayClient.configure({ baseURL: cfg.fayURL, useWs: cfg.fayUseWs });
    FayClient.onText = (delta, f) => {
      full = f;
      bubble.textContent = full;
      chatLog.scrollTop = chatLog.scrollHeight;
    };
    try {
      const ans = await FayClient.sendText(text, { sessionId: "demo_" + Date.now().toString(36).slice(-4) });
      if (ans && !full) full = ans;
      if (!full) full = "⚠️ Fay 返回空响应,请检查后端日志。";
      bubble.textContent = full;
      Avatar.setThinking(false);
      messages.push({ role: "assistant", content: full });
      speak(full);
    } catch (err) {
      Avatar.setThinking(false);
      setStatus("idle", "待命中");
      bubble.textContent = "Fay 后端连接失败:" + err.message + "\n请确认 Fay 已启动且地址正确。";
      bubble.style.color = "#ff6b6b";
    }
  }

  // ===== 语音输入（移动端适配） =====
  let micLock = false;
  let micLockTimer = null;

  function startVoiceInput() {
    if (micLock) return;
    micLock = true;
    if (micLockTimer) { clearTimeout(micLockTimer); micLockTimer = null; }

    if (!ASR.supported) {
      showVoiceError("当前浏览器不支持语音识别。iOS 请使用 Safari，Android 请使用 Chrome。");
      micLock = false;
      return;
    }
    if (!IS_HTTPS) {
      showVoiceError("语音识别需要 HTTPS 或 localhost 环境。<br/>当前：" + location.protocol + "<br/><small>本地访问用 http://localhost:8000</small>");
      micLock = false;
      return;
    }

    if (ASR.listening) { ASR.stop(); return; }

    TTS.stop();
    Avatar.setSpeaking(false);
    setStatus("listening", "聆听中");
    micBtn.classList.add("recording");
    voiceHint.textContent = "正在聆听...再次点击结束录音";

    ASR.onResult = (t) => {
      if (t && t.trim()) {
        voiceHint.textContent = "识别到：" + t;
        handleUserInput(t);
      }
    };
    ASR.onError = (msg) => {
      showVoiceError(msg);
    };
    ASR.onEnd = () => {
      micBtn.classList.remove("recording");
      micLock = false;
      voiceHint.textContent = "点击下方麦克风开始语音对话，或直接文字输入";
      if (statusPill.classList.contains("listening")) setStatus("idle", "待命中");
    };

    const ok = ASR.start("zh-CN");
    if (!ok) {
      micLock = false;
      micBtn.classList.remove("recording");
      if (ASR.errorMsg) showVoiceError(ASR.errorMsg);
    }
  }

  function stopVoiceInput() {
    if (ASR.listening) {
      ASR.stop();
    } else {
      micLock = false;
      micBtn.classList.remove("recording");
      voiceHint.textContent = "点击下方麦克风开始语音对话，或直接文字输入";
      if (statusPill.classList.contains("listening")) setStatus("idle", "待命中");
    }
  }

  function showVoiceError(msg) {
    voiceHint.innerHTML = msg;
    voiceHint.style.color = "var(--danger)";
    setTimeout(() => { voiceHint.style.color = ""; }, 5000);
  }

  micBtn.addEventListener("click", () => {
    if (ASR.listening) {
      stopVoiceInput();
    } else {
      startVoiceInput();
    }
  });

  // 移动端：防止触摸时 click 事件延迟 / 双重触发
  if (IS_MOBILE) {
    let lastTouchTime = 0;
    micBtn.addEventListener("touchend", (e) => {
      e.preventDefault();
      const now = Date.now();
      if (now - lastTouchTime < 300) return;
      lastTouchTime = now;
      if (ASR.listening) {
        stopVoiceInput();
      } else {
        startVoiceInput();
      }
    }, { passive: false });
  }

  sendBtn.addEventListener("click", () => handleUserInput(textInput.value));
  textInput.addEventListener("keydown", (e) => { if (e.key === "Enter") handleUserInput(textInput.value); });

  $("btn-clear").addEventListener("click", () => {
    if (!confirm("确定清空所有对话?")) return;
    messages = [];
    chatLog.innerHTML = "";
    addMsg("bot", "对话已清空,可以重新开始。");
  });

  // ===== 形象切换按钮 =====
  function renderPersonaSwitcher() {
    const box = $("persona-switcher");
    box.innerHTML = "";
    Avatar.personas.forEach((p) => {
      const b = document.createElement("button");
      b.className = "persona-btn" + (cfg.personaId === p.id && !cfg.customAvatar ? " active" : "");
      b.textContent = p.name;
      b.addEventListener("click", () => {
        cfg.personaId = p.id;
        Avatar.switchTo(p.id);
        cfg.customAvatar = "";
        saveCfg();
        renderPersonaSwitcher();
      });
      box.appendChild(b);
    });
    if (cfg.customAvatar) {
      const tag = document.createElement("button");
      tag.className = "persona-btn active";
      tag.textContent = "自定义";
      box.appendChild(tag);
    }
  }

  // ===== 设置弹窗 =====
  const modal = $("settings-modal");
  $("btn-settings").addEventListener("click", openSettings);
  $("btn-close-settings").addEventListener("click", () => modal.classList.remove("show"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("show"); });

  // Tab 切换
  function switchSettingTab(tabId) {
    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tabId);
    });
    document.querySelectorAll(".tab-panel").forEach((p) => {
      p.style.display = p.id === tabId ? "block" : "none";
    });
  }
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchSettingTab(btn.dataset.tab));
  });

  // 模式 radio 切换
  document.querySelectorAll('input[name="mode"]').forEach((r) => {
    r.addEventListener("change", (e) => {
      const v = e.target.value;
      document.querySelectorAll(".radio-item").forEach((ri) => {
        ri.classList.toggle("active", ri.querySelector("input").checked);
      });
      $("browser-config").style.display = v === "browser" ? "block" : "none";
      $("backend-config").style.display = v === "backend" ? "block" : "none";
      $("fay-config").style.display = v === "fay" ? "block" : "none";
    });
  });

  // 自托管后端连通性测试
  $("btn-test-backend").addEventListener("click", async () => {
    const url = $("cfg-backend-url").value.trim();
    const span = $("backend-test-result");
    if (!url) { span.textContent = "请先填写后端地址"; span.style.color = "var(--warn)"; return; }
    span.textContent = "测试中..."; span.style.color = "var(--text-dim)";
    try {
      const resp = await fetch(url.replace(/\/+$/, "") + "/api/health");
      if (resp.ok) {
        const data = await resp.json();
        span.textContent = `✓ 连通成功 (${data.service || "OK"})`;
        span.style.color = "var(--ok)";
      } else {
        span.textContent = `✗ HTTP ${resp.status}`;
        span.style.color = "var(--danger)";
      }
    } catch (err) {
      span.textContent = "✗ " + err.message;
      span.style.color = "var(--danger)";
    }
  });

  // Fay 连接测试
  $("btn-fay-ping").addEventListener("click", async () => {
    const url = $("cfg-fay-url").value.trim() || Shared.DEFAULT_CFG.fayURL;
    FayClient.configure({ baseURL: url });
    const span = $("fay-ping-result");
    span.style.color = "#fbbf24";
    span.textContent = "测试中...";
    const r = await FayClient.ping();
    if (r.ok) {
      span.style.color = "#4ade80";
      span.textContent = `连接成功 (HTTP ${r.status}) ✓`;
    } else {
      span.style.color = "#ff6b6b";
      span.textContent = `连接失败: ${r.error || "未知错误"}`;
    }
  });

  // 语速滑块
  $("cfg-rate").addEventListener("input", (e) => {
    $("cfg-rate-val").textContent = parseFloat(e.target.value).toFixed(1);
  });

  // 语音试听
  $("btn-test-voice").addEventListener("click", () => {
    const name = $("cfg-voice").value;
    const rate = parseFloat($("cfg-rate").value);
    TTS.setVoice(name);
    TTS.rate = rate;
    TTS.speak(cfg.campusName ? `您好,我是${cfg.name},${cfg.campusName}的智能助手。` : "您好,这是数字人语音测试。", { rate });
  });

  // 自定义头像上传
  $("cfg-custom-avatar").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result;
      Avatar.useCustomImage(url);
      cfg.customAvatar = url;
      renderPersonaSwitcher();
    };
    reader.readAsDataURL(file);
  });
  $("btn-clear-custom").addEventListener("click", () => {
    Avatar.clearCustom();
    Avatar.switchTo(cfg.personaId);
    cfg.customAvatar = "";
    $("cfg-custom-avatar").value = "";
    renderPersonaSwitcher();
  });

  function openSettings(defaultTab) {
    if (defaultTab) switchSettingTab(defaultTab);
    // 回填
    document.querySelectorAll('input[name="mode"]').forEach((r) => {
      r.checked = r.value === cfg.mode;
    });
    document.querySelectorAll(".radio-item").forEach((ri) => {
      ri.classList.toggle("active", ri.querySelector("input").checked);
    });
    $("browser-config").style.display = cfg.mode === "browser" ? "block" : "none";
    $("backend-config").style.display = cfg.mode === "backend" ? "block" : "none";
    $("fay-config").style.display = cfg.mode === "fay" ? "block" : "none";

    $("cfg-baseurl").value = cfg.baseURL;
    $("cfg-apikey").value = cfg.apiKey;
    $("cfg-model").value = cfg.model;
    $("cfg-persona").value = cfg.persona;

    $("cfg-backend-url").value = cfg.backendURL || "";
    $("backend-test-result").textContent = "";

    $("cfg-fay-url").value = cfg.fayURL;
    $("cfg-fay-ws").checked = cfg.fayUseWs;
    $("fay-ping-result").textContent = "";

    $("cfg-campus-name").value = cfg.campusName;
    $("cfg-api-energy").value = cfg.campusApis.energy || "";
    $("cfg-api-energy-trend").value = cfg.campusApis.energyTrend || "";
    $("cfg-api-devices").value = cfg.campusApis.devices || "";
    $("cfg-api-park-info").value = cfg.campusApis.parkInfo || "";

    $("cfg-name").value = cfg.name;
    $("cfg-tts-engine").value = cfg.ttsEngine;
    $("cfg-rate").value = cfg.rate;
    $("cfg-rate-val").textContent = cfg.rate.toFixed(1);
    fillVoiceList();

    $("cfg-kb").checked = cfg.kbEnabled;
    renderKbRules();

    modal.classList.add("show");
  }

  function fillVoiceList() {
    const sel = $("cfg-voice");
    sel.innerHTML = "";
    const zh = TTS.voices.filter((v) => /zh|cmn/i.test(v.lang));
    const list = zh.length ? zh : TTS.voices;
    list.forEach((v) => {
      const o = document.createElement("option");
      o.value = v.name;
      o.textContent = `${v.name} (${v.lang})`;
      if (v.name === cfg.voice) o.selected = true;
      sel.appendChild(o);
    });
  }

  function renderKbRules() {
    const box = $("kb-rules-list");
    box.innerHTML = "";
    Knowledge.allStatic().forEach((item) => {
      const d = document.createElement("div");
      d.className = "rule-item";
      d.innerHTML = `<span class="rule-keywords">${item.keywords.join(" / ")}</span> ⇒ ${item.answer.length > 50 ? item.answer.slice(0, 50) + "..." : item.answer}`;
      box.appendChild(d);
    });
    Knowledge.allRules().forEach((rule) => {
      const d = document.createElement("div");
      d.className = "rule-item";
      d.innerHTML = `<span class="rule-keywords">[API] ${rule.keywords.join(" / ")}</span> ⇒ 园区数据接口 (${rule.apiKey})`;
      box.appendChild(d);
    });
  }

  $("btn-save-settings").addEventListener("click", () => {
    const prevMode = cfg.mode;
    cfg.mode = document.querySelector('input[name="mode"]:checked')?.value || "browser";

    cfg.baseURL = $("cfg-baseurl").value.trim() || Shared.DEFAULT_CFG.baseURL;
    cfg.apiKey = $("cfg-apikey").value.trim();
    cfg.model = $("cfg-model").value.trim() || Shared.DEFAULT_CFG.model;
    cfg.persona = $("cfg-persona").value.trim() || Shared.DEFAULT_CFG.persona;

    cfg.backendURL = $("cfg-backend-url").value.trim();

    cfg.fayURL = $("cfg-fay-url").value.trim() || Shared.DEFAULT_CFG.fayURL;
    cfg.fayUseWs = $("cfg-fay-ws").checked;

    cfg.campusName = $("cfg-campus-name").value.trim() || Shared.DEFAULT_CFG.campusName;
    cfg.campusApis = {
      energy: $("cfg-api-energy").value.trim(),
      energyTrend: $("cfg-api-energy-trend").value.trim(),
      devices: $("cfg-api-devices").value.trim(),
      parkInfo: $("cfg-api-park-info").value.trim()
    };
    Knowledge.setApis(cfg.campusApis);

    cfg.name = $("cfg-name").value.trim() || Shared.DEFAULT_CFG.name;
    cfg.ttsEngine = $("cfg-tts-engine").value || "browser";
    cfg.voice = $("cfg-voice").value;
    cfg.rate = parseFloat($("cfg-rate").value);
    cfg.kbEnabled = $("cfg-kb").checked;
    Knowledge.enabled = cfg.kbEnabled;

    TTS.setVoice(cfg.voice);
    TTS.rate = cfg.rate;

    // 若切换到 Fay 模式，预先配置客户端
    if (cfg.mode === "fay") {
      FayClient.configure({ baseURL: cfg.fayURL, useWs: cfg.fayUseWs });
    } else if (prevMode === "fay") {
      try { FayClient.wsDisconnect(); } catch {}
    }

    saveCfg();

    // UI 更新
    modeIndicator.textContent =
      cfg.mode === "fay" ? `Fay 后端模式 · ${cfg.fayURL.replace(/^https?:\/\//, "")}` :
      cfg.mode === "backend" ? `自托管后端模式 · ${(cfg.backendURL || "未配置").replace(/^https?:\/\//, "")}` :
      "浏览器端模式";
    chatLog.querySelectorAll(".msg-bot .msg-avatar").forEach((el) => { el.textContent = cfg.name.slice(0, 2); });

    modal.classList.remove("show");
    setStatus("idle", "待命中");
  });

  // ===== 初始化 =====
  Avatar.mount("avatar-stage");
  if (cfg.customAvatar) {
    Avatar.useCustomImage(cfg.customAvatar);
  } else {
    Avatar.switchTo(cfg.personaId);
  }
  renderPersonaSwitcher();
  Knowledge.enabled = cfg.kbEnabled;
  Knowledge.setApis(cfg.campusApis);
  TTS.rate = cfg.rate;
  if (cfg.voice) TTS.setVoice(cfg.voice);

  modeIndicator.textContent =
    cfg.mode === "fay" ? `Fay 后端模式 · ${cfg.fayURL.replace(/^https?:\/\//, "")}` :
    cfg.mode === "backend" ? `自托管后端模式 · ${(cfg.backendURL || "未配置").replace(/^https?:\/\//, "")}` :
    "浏览器端模式";

  if (cfg.mode === "fay") {
    FayClient.configure({ baseURL: cfg.fayURL, useWs: cfg.fayUseWs });
  }

  // 首次友好提示
  if (!cfg.apiKey && cfg.mode === "browser") {
    voiceHint.textContent = "未检测到 API Key → 点击左侧设置(也可试试:今日能耗 离线设备 园区介绍 等已内置示例)";
  }
})();
