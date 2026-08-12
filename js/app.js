// 主应用逻辑 —— 串联头像、语音、LLM、知识库
(function () {
  "use strict";

  // ===== 配置管理 =====
  const DEFAULT_CFG = {
    baseURL: "https://api.deepseek.com/v1",
    apiKey: "",
    model: "deepseek-chat",
    name: "小助",
    persona: "你是一个友好的 AI 数字人助手,性格开朗、回答简洁有条理,适合演示园区智能问答场景。",
    voice: "",
    rate: 1,
    kbEnabled: true,
    personaId: "tech"
  };

  function loadCfg() {
    try {
      const raw = localStorage.getItem("ai_dh_cfg");
      return raw ? { ...DEFAULT_CFG, ...JSON.parse(raw) } : { ...DEFAULT_CFG };
    } catch {
      return { ...DEFAULT_CFG };
    }
  }
  function saveCfg(cfg) {
    localStorage.setItem("ai_dh_cfg", JSON.stringify(cfg));
  }

  let cfg = loadCfg();
  let messages = []; // LLM 多轮对话历史

  // ===== DOM 引用 =====
  const $ = (id) => document.getElementById(id);
  const chatLog = $("chat-log");
  const textInput = $("text-input");
  const micBtn = $("btn-mic");
  const sendBtn = $("btn-send");
  const statusPill = $("status-pill");
  const statusText = $("status-text");
  const voiceHint = $("voice-hint");

  // ===== 状态指示 =====
  function setStatus(state, label) {
    statusPill.className = "status-pill " + state;
    statusText.textContent = label;
  }

  // ===== 聊天渲染 =====
  function addMsg(role, text, { streaming = false } = {}) {
    const div = document.createElement("div");
    div.className = "msg msg-" + role;
    const avatar = document.createElement("div");
    avatar.className = "msg-avatar";
    avatar.textContent = role === "bot" ? cfg.name.slice(0, 2) : "我";
    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.textContent = text;
    div.appendChild(avatar);
    div.appendChild(bubble);
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
    return bubble;
  }

  // ===== TTS 回调联动头像 =====
  TTS.onStart = () => {
    setStatus("speaking", "播报中");
    Avatar.setSpeaking(true);
  };
  TTS.onEnd = () => {
    Avatar.setSpeaking(false);
    setStatus("idle", "待命中");
  };

  // ===== 发送消息主流程 =====
  async function handleUserInput(text) {
    text = text.trim();
    if (!text) return;

    addMsg("user", text);
    messages.push({ role: "user", content: text });
    textInput.value = "";

    // 1) 知识库优先匹配
    if (cfg.kbEnabled) {
      const hit = Knowledge.query(text);
      if (hit.matched) {
        await respond(hit.answer);
        return;
      }
    }

    // 2) 检查 API Key
    if (!cfg.apiKey) {
      const tip = "尚未配置 API Key,请点击右上角设置按钮填入 DeepSeek API Key。";
      await respond(tip);
      return;
    }

    // 3) 调用 LLM(流式)
    setStatus("thinking", "思考中");
    Avatar.setThinking(true);
    const bubble = addMsg("bot", "", { streaming: true });
    let fullText = "";

    try {
      const sysMsg = { role: "system", content: cfg.persona };
      await LLM.chat({
        baseURL: cfg.baseURL,
        apiKey: cfg.apiKey,
        model: cfg.model,
        messages: [sysMsg, ...messages],
        onDelta: (_delta, full) => {
          fullText = full;
          bubble.textContent = full;
          chatLog.scrollTop = chatLog.scrollHeight;
        }
      });
      Avatar.setThinking(false);
      messages.push({ role: "assistant", content: fullText });
      // TTS 播报(取消未说完的内容,只播报最终结果)
      TTS.speak(fullText, { rate: cfg.rate });
    } catch (err) {
      Avatar.setThinking(false);
      setStatus("idle", "待命中");
      bubble.textContent = "调用失败:" + err.message;
      bubble.style.color = "#ff6b6b";
    }
  }

  // 直接回答(知识库/提示),不走 LLM
  async function respond(text) {
    setStatus("thinking", "生成中");
    const bubble = addMsg("bot", text);
    messages.push({ role: "assistant", content: text });
    setTimeout(() => {
      TTS.speak(text, { rate: cfg.rate });
    }, 100);
  }

  // ===== 语音输入 =====
  let micToggling = false;
  micBtn.addEventListener("click", () => {
    if (micToggling) return;
    micToggling = true;
    if (!ASR.supported) {
      alert("当前浏览器不支持语音识别。请使用 Chrome 或 Edge 浏览器。");
      micToggling = false;
      return;
    }
    if (ASR.listening) {
      ASR.stop();
      return;
    }
    // 开始识别前停止 TTS,避免自激
    TTS.stop();
    Avatar.setSpeaking(false);
    setStatus("listening", "聆听中");
    micBtn.classList.add("recording");
    voiceHint.textContent = "正在聆听...再次点击麦克风结束";

    ASR.onResult = (text) => {
      voiceHint.textContent = "识别到:" + text;
      handleUserInput(text);
    };
    ASR.onEnd = () => {
      micBtn.classList.remove("recording");
      micToggling = false;
      voiceHint.textContent = "点击下方麦克风开始语音对话,或直接文字输入";
      if (statusPill.classList.contains("listening")) {
        setStatus("idle", "待命中");
      }
    };
    ASR.start("zh-CN");
  });

  // ===== 文字输入 =====
  sendBtn.addEventListener("click", () => handleUserInput(textInput.value));
  textInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleUserInput(textInput.value);
  });

  // ===== 清空对话 =====
  $("btn-clear").addEventListener("click", () => {
    if (!confirm("确定清空所有对话?")) return;
    messages = [];
    chatLog.innerHTML = "";
    addMsg("bot", "对话已清空,可以重新开始。");
  });

  // ===== 形象切换 =====
  function renderPersonaSwitcher() {
    const box = $("persona-switcher");
    box.innerHTML = "";
    Avatar.personas.forEach((p) => {
      const btn = document.createElement("button");
      btn.className = "persona-btn" + (p.id === cfg.personaId ? " active" : "");
      btn.textContent = p.name;
      btn.addEventListener("click", () => {
        cfg.personaId = p.id;
        Avatar.switchTo(p.id);
        saveCfg(cfg);
        renderPersonaSwitcher();
      });
      box.appendChild(btn);
    });
  }

  // ===== 设置弹窗 =====
  const modal = $("settings-modal");
  $("btn-settings").addEventListener("click", openSettings);
  $("btn-close-settings").addEventListener("click", () => modal.classList.remove("show"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("show");
  });

  function openSettings() {
    $("cfg-baseurl").value = cfg.baseURL;
    $("cfg-apikey").value = cfg.apiKey;
    $("cfg-model").value = cfg.model;
    $("cfg-name").value = cfg.name;
    $("cfg-persona").value = cfg.persona;
    $("cfg-rate").value = cfg.rate;
    $("cfg-rate-val").textContent = cfg.rate.toFixed(1);
    $("cfg-kb").checked = cfg.kbEnabled;
    fillVoiceList();
    modal.classList.add("show");
  }

  function fillVoiceList() {
    const sel = $("cfg-voice");
    sel.innerHTML = "";
    const voices = TTS.voices.filter((v) => /zh|cmn/i.test(v.lang));
    const list = voices.length ? voices : TTS.voices;
    list.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.lang})`;
      if (v.name === cfg.voice) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  $("cfg-rate").addEventListener("input", (e) => {
    $("cfg-rate-val").textContent = parseFloat(e.target.value).toFixed(1);
  });

  $("btn-test-voice").addEventListener("click", () => {
    const name = $("cfg-voice").value;
    const rate = parseFloat($("cfg-rate").value);
    TTS.setVoice(name);
    TTS.rate = rate;
    TTS.speak("您好,这是数字人语音测试。", { rate });
  });

  $("btn-save-settings").addEventListener("click", () => {
    cfg.baseURL = $("cfg-baseurl").value.trim() || DEFAULT_CFG.baseURL;
    cfg.apiKey = $("cfg-apikey").value.trim();
    cfg.model = $("cfg-model").value.trim() || DEFAULT_CFG.model;
    cfg.name = $("cfg-name").value.trim() || DEFAULT_CFG.name;
    cfg.persona = $("cfg-persona").value.trim() || DEFAULT_CFG.persona;
    cfg.voice = $("cfg-voice").value;
    cfg.rate = parseFloat($("cfg-rate").value);
    cfg.kbEnabled = $("cfg-kb").checked;
    saveCfg(cfg);
    TTS.setVoice(cfg.voice);
    TTS.rate = cfg.rate;
    Knowledge.enabled = cfg.kbEnabled;
    modal.classList.remove("show");
    // 更新已有 bot 头像文字
    chatLog.querySelectorAll(".msg-bot .msg-avatar").forEach((el) => {
      el.textContent = cfg.name.slice(0, 2);
    });
  });

  // ===== 初始化 =====
  Avatar.mount("avatar-stage");
  Avatar.switchTo(cfg.personaId);
  renderPersonaSwitcher();
  Knowledge.enabled = cfg.kbEnabled;
  TTS.rate = cfg.rate;
  if (cfg.voice) TTS.setVoice(cfg.voice);

  // 首次访问提示
  if (!cfg.apiKey) {
    voiceHint.textContent = "首次使用请点击右上角设置,填入 DeepSeek API Key";
  }
})();
