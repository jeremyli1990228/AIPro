// 共享模块 —— 配置管理、LLM 调用、视图切换（数字人/报告/办公三模块共用）
(function (global) {
  "use strict";

  const DEFAULT_CFG = {
    mode: "browser",
    // mode: "browser"  纯前端，浏览器直连 LLM API（GitHub Pages 演示用）
    // mode: "backend"  调用自托管 FastAPI 后端（完整功能，需部署 backend/）
    // mode: "fay"      对接 Fay 数字人后端
    backendURL: "",          // 后端模式时的 FastAPI 地址，如 https://aipro-xxxx.onrender.com
    baseURL: "https://api.deepseek.com/v1",
    apiKey: "",
    model: "deepseek-chat",
    persona: "你是一个友好的 AI 数字人助手,性格开朗、回答简洁有条理,擅长回答园区能耗、设备状态等业务问题。如果是园区数据类问题,优先给出数据;不确定时请说明。",
    fayURL: "http://127.0.0.1:5000",
    fayUseWs: false,
    campusName: "智慧产业园",
    campusApis: { energy: "", energyTrend: "", devices: "", parkInfo: "" },
    name: "小助",
    personaId: "tech",
    customAvatar: "",
    ttsEngine: "browser",
    voice: "",
    rate: 1,
    kbEnabled: true
  };

  function loadCfg() {
    try {
      const raw = localStorage.getItem("ai_platform_cfg");
      if (!raw) return { ...DEFAULT_CFG, campusApis: { ...DEFAULT_CFG.campusApis } };
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_CFG,
        ...parsed,
        campusApis: { ...DEFAULT_CFG.campusApis, ...(parsed.campusApis || {}) }
      };
    } catch {
      return { ...DEFAULT_CFG, campusApis: { ...DEFAULT_CFG.campusApis } };
    }
  }

  function saveCfg(cfg) {
    localStorage.setItem("ai_platform_cfg", JSON.stringify(cfg));
  }

  // 迁移旧配置
  function migrateOldCfg() {
    const old = localStorage.getItem("ai_dh_cfg");
    if (old && !localStorage.getItem("ai_platform_cfg")) {
      try {
        const parsed = JSON.parse(old);
        const newCfg = { ...DEFAULT_CFG, ...parsed, campusApis: { ...DEFAULT_CFG.campusApis, ...(parsed.campusApis || {}) } };
        saveCfg(newCfg);
        localStorage.removeItem("ai_dh_cfg");
        return newCfg;
      } catch {}
    }
    return null;
  }

  let cfg = migrateOldCfg() || loadCfg();

  // 简化的 LLM 调用（使用共享配置）
  async function llm({ messages, temperature = 0.7, onDelta, systemPrompt }) {
    if (!cfg.apiKey) {
      throw new Error("尚未配置 API Key，请点击设置填写。");
    }
    const msgs = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : messages;
    return await global.LLM.chat({
      baseURL: cfg.baseURL,
      apiKey: cfg.apiKey,
      model: cfg.model,
      messages: msgs,
      temperature,
      onDelta
    });
  }

  // 视图切换
  function switchView(name) {
    document.querySelectorAll(".nav-item").forEach((n) => {
      n.classList.toggle("active", n.dataset.view === name);
    });
    document.querySelectorAll(".view").forEach((v) => {
      v.classList.toggle("active", v.id === "view-" + name);
    });
  }

  // ===== 后端 API 封装（mode === "backend" 时使用） =====
  // 后端参考 SmartBrief (MIT) + open-schedule-agent (MIT) 实现，详见 backend/README.md
  function backendBase() {
    const u = (cfg.backendURL || "").trim().replace(/\/+$/, "");
    if (!u) throw new Error("尚未配置后端地址（设置 → 后端模式 → backendURL）");
    return u;
  }

  async function backendPost(path, body) {
    const url = backendBase() + path;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
    if (!resp.ok) {
      let detail = "";
      try { detail = (await resp.json()).detail || ""; } catch (_) {}
      throw new Error(`后端返回 ${resp.status}: ${detail || resp.statusText}`);
    }
    return await resp.json();
  }

  async function backendGet(path, query) {
    let url = backendBase() + path;
    if (query && typeof query === "object") {
      const qs = new URLSearchParams();
      Object.entries(query).forEach(([k, v]) => { if (v != null) qs.set(k, v); });
      const s = qs.toString();
      if (s) url += "?" + s;
    }
    const resp = await fetch(url, { method: "GET" });
    if (!resp.ok) {
      throw new Error(`后端返回 ${resp.status}: ${resp.statusText}`);
    }
    return await resp.json();
  }

  // 是否使用后端模式（用于 report.js / office.js 判断走哪条路径）
  function useBackend() {
    return cfg.mode === "backend" && !!(cfg.backendURL || "").trim();
  }

  // 后端 API 命名空间
  const Backend = {
    base: backendBase,
    post: backendPost,
    get: backendGet,
    useBackend,
    // 报告助手
    report: {
      generate: (payload) => backendPost("/api/report/generate", payload)
    },
    // 办公助手 - 会议
    schedule: {
      rooms: () => backendGet("/api/schedule/rooms"),
      parse: (text) => backendPost("/api/schedule/parse", { text }),
      book: (meeting, roomId) => backendPost("/api/schedule/book", { meeting, roomId }),
      bookings: () => backendGet("/api/schedule/bookings")
    },
    // 办公助手 - 工单
    tickets: {
      list: (status) => backendGet("/api/tickets", { status }),
      create: (ticket) => backendPost("/api/tickets", ticket),
      parse: (text) => backendPost("/api/tickets/parse", { text })
    },
    health: () => backendGet("/api/health")
  };

  // 工具
  const $ = (id) => document.getElementById(id);

  const Shared = {
    cfg,
    DEFAULT_CFG,
    loadCfg,
    saveCfg,
    llm,
    switchView,
    $,
    Backend,
    useBackend,
    // 同步外部对 cfg 的修改
    syncCfg() { cfg = Shared.cfg; }
  };

  global.Shared = Shared;
})(window);
