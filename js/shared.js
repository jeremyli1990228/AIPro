// 共享模块 —— 配置管理、LLM 调用、视图切换（数字人/报告/办公三模块共用）
(function (global) {
  "use strict";

  const DEFAULT_CFG = {
    mode: "browser",
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
    // 同步外部对 cfg 的修改
    syncCfg() { cfg = Shared.cfg; }
  };

  global.Shared = Shared;
})(window);
