// 知识库模块 —— 关键词匹配 + 园区数据 API 动态查询
(function (global) {
  "use strict";

  // 静态知识库(关键词匹配)
  const STATIC_KB = [
    {
      keywords: ["你好", "您好", "hi", "hello", "在吗"],
      answer: "你好!我是 AI 数字人,很高兴为您服务。您可以问我任何问题,也可以用语音和我对话。"
    },
    {
      keywords: ["你是谁", "介绍", "自我介绍"],
      answer: "我是一个基于开源技术构建的 AI 数字人,大脑支持 DeepSeek/通义千问,也可切换为 Fay 本地后端模式。支持语音对话、形象切换、园区数据查询,部署在 GitHub Pages 完全免费运行。"
    },
    {
      keywords: ["功能", "能做什么", "会什么"],
      answer: "我能做这些:1) 智能问答,接入大模型或 Fay 后端回答各类问题;2) 语音对话,麦克风说话我语音回答;3) 形象切换,左侧可切换 8+ 种数字人形象;4) 知识库匹配,预设问答秒回;5) 园区数据查询,实时接入能耗、设备等 API。点击右上角设置可配置。"
    },
    {
      keywords: ["开源", "许可证", "license", "免费"],
      answer: "本 Demo 参考 Fay(GPL-3.0)开源框架构建,前端纯浏览器实现。Fay、OpenAvatarChat、Linly-Talker 均为真正开源免费的数字人项目。如需完整 Fay 后端能力,可在设置中配置 Fay 后端地址(本地运行 python main.py)。"
    },
    {
      keywords: ["怎么用", "如何使用", "教程", "帮助"],
      answer: "使用步骤:1) 点击右上角设置;2) 选择模式——浏览器端模式需填入 DeepSeek API Key,Fay 模式需填入后端地址;3) 可选配置园区数据 API 地址(能耗、设备等);4) 保存后即可文字或语音对话。麦克风按钮点击开始说话,再次点击结束。"
    },
    {
      keywords: ["fay", "后端", "本地"],
      answer: "Fay 后端对接模式:1) 本地启动 Fay 项目,python main.py start;2) 在设置中勾选'启用 Fay 后端模式';3) 填入后端地址,默认 http://127.0.0.1:5000;4) 保存后,所有问答将通过 Fay 后端处理,包括 ASR、LLM、TTS、知识库等完整能力。"
    }
  ];

  // 园区 API 触发规则(匹配关键词后,动态调用真实接口)
  // 每个条目: { keywords, apiKey, method, template(query, jsonData, matchedBuilding) }
  // apiKey 对应配置中的 cfg.campusApis[key]
  const API_RULES = [
    {
      keywords: ["今日能耗", "总能耗", "今天能耗", "能耗多少", "能耗情况"],
      apiKey: "energy",
      template: (_q, data) => {
        const total = data?.total_kwh ?? data?.energy ?? data?.value ?? "—";
        const unit = data?.unit ?? "kWh";
        const compare = data?.compare_yesterday ?? null;
        const trend = compare == null ? "" : (compare > 0 ? `,较昨日上升 ${compare}%` : compare < 0 ? `,较昨日下降 ${Math.abs(compare)}%` : ",与昨日持平");
        const breakdown = data?.by_building
          ? `\n各楼栋:${data.by_building.map((b) => `${b.name} ${b.value}${unit}`).join("、")}`
          : "";
        return `园区今日总能耗为 ${total} ${unit}${trend}${breakdown}`;
      }
    },
    {
      keywords: ["能耗趋势", "近7天能耗", "本周能耗"],
      apiKey: "energyTrend",
      template: (_q, data) => {
        const list = data?.days || data?.series || [];
        if (!list.length) return "暂无能耗趋势数据。";
        return `近 ${list.length} 天能耗趋势:\n` + list.map((d) => `  ${d.date || d.day}: ${d.value}${d.unit || "kWh"}`).join("\n");
      }
    },
    {
      keywords: ["离线设备", "设备离线", "设备故障", "异常设备", "设备状态"],
      apiKey: "devices",
      template: (q, data) => {
        const all = data?.offline || data?.abnormal || data?.items || [];
        const building = matchBuilding(q);
        const list = building ? all.filter((d) => (d.building || d.location || "").includes(building)) : all;
        const total = data?.total_offline ?? list.length;
        if (!list.length) return building ? `${building}当前无离线设备。` : "当前所有设备运行正常。";
        const top = list.slice(0, 5);
        const more = list.length > top.length ? `等 ${list.length} 台` : "";
        const detail = top.map((d) => `- ${d.building || ""} ${d.name} (${d.type || "设备"})`).join("\n");
        return `${building || "园区"}当前共有 ${building ? list.length : total} 台设备离线${building ? "" : more}:\n${detail}`;
      }
    },
    {
      keywords: ["园区信息", "园区概况", "园区介绍"],
      apiKey: "parkInfo",
      template: (_q, data) => {
        const name = data?.name || "智慧园区";
        const area = data?.area ? `,占地面积 ${data.area}` : "";
        const buildings = data?.buildings ? `,共 ${data.buildings} 栋建筑` : "";
        const enterprises = data?.enterprises ? `,入驻企业 ${data.enterprises} 家` : "";
        const people = data?.people ? `,从业人员 ${data.people} 人` : "";
        return `${name}${area}${buildings}${enterprises}${people}。`;
      }
    }
  ];

  function matchBuilding(text) {
    const m = text.match(/([A-Za-z0-9一二三四五六七八九十]+)[栋号座楼]/);
    return m ? m[1] + (text[m.index + m[1].length]) : null;
  }

  // JSONP 包装(fallback 当 CORS 失败时)
  function jsonpFetch(url, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const cbName = "__cb_" + Math.random().toString(36).slice(2, 10);
      const script = document.createElement("script");
      let done = false;
      const clean = () => {
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
      };
      const timer = setTimeout(() => {
        if (!done) { done = true; clean(); reject(new Error("JSONP timeout")); }
      }, timeoutMs);
      window[cbName] = (data) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clean();
        resolve(data);
      };
      script.onerror = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clean();
        reject(new Error("JSONP script error"));
      };
      const sep = url.includes("?") ? "&" : "?";
      script.src = url + sep + "callback=" + cbName;
      document.head.appendChild(script);
    });
  }

  const Knowledge = {
    enabled: true,
    apis: {}, // { energy: 'http://.../energy', ... }

    setApis(cfgApis) {
      this.apis = cfgApis || {};
    },

    // 同步静态匹配,返回 { matched, answer, type:'static' } 或 { matched: false }
    queryStatic(text) {
      if (!this.enabled) return { matched: false };
      const lower = text.toLowerCase();
      for (const item of STATIC_KB) {
        if (item.keywords.some((k) => lower.includes(k.toLowerCase()))) {
          return { matched: true, answer: item.answer, type: "static" };
        }
      }
      return { matched: false };
    },

    // 异步 API 查询,返回 { matched, answer, type:'api' } 或 { matched: false }
    async queryApi(text) {
      if (!this.enabled) return { matched: false };
      const lower = text.toLowerCase();
      for (const rule of API_RULES) {
        const hit = rule.keywords.some((k) => lower.includes(k.toLowerCase()));
        if (!hit) continue;
        const url = this.apis[rule.apiKey];
        if (!url) {
          // 未配置接口 → 返回示例数据
          return {
            matched: true,
            type: "api",
            answer: this._mockAnswer(rule.apiKey, text)
          };
        }
        try {
          // 先尝试 fetch(CORS),失败则 JSONP,都失败返回示例
          let data;
          try {
            const r = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : null });
            if (!r.ok) throw new Error("HTTP " + r.status);
            data = await r.json();
          } catch (eFetch) {
            try {
              data = await jsonpFetch(url, 6000);
            } catch (eJsonp) {
              return {
                matched: true,
                type: "api",
                answer: this._mockAnswer(rule.apiKey, text)
              };
            }
          }
          return {
            matched: true,
            type: "api",
            answer: rule.template(text, data)
          };
        } catch (err) {
          return {
            matched: true,
            type: "api",
            answer: this._mockAnswer(rule.apiKey, text)
          };
        }
      }
      return { matched: false };
    },

    // 同步+异步统一入口:先静态匹配,再异步 API
    async query(text) {
      const s = this.queryStatic(text);
      if (s.matched) return s;
      return await this.queryApi(text);
    },

    // 未配置接口时返回的示例 Mock 数据
    _mockAnswer(key, q) {
      switch (key) {
        case "energy":
          return "【示例数据,请在设置中配置园区 API】园区今日总能耗 1,280 kWh,较昨日下降 3.2%。\n各楼栋:A栋 420 kWh、B栋 310 kWh、C栋 260 kWh、D栋 290 kWh。";
        case "energyTrend":
          return "【示例数据】近 7 天能耗趋势:\n  8/6:1150 kWh\n  8/7:1205 kWh\n  8/8:1320 kWh\n  8/9:1290 kWh\n  8/10:1340 kWh\n  8/11:1322 kWh\n  8/12:1280 kWh";
        case "devices": {
          const b = matchBuilding(q);
          if (b === "A") return "【示例数据】A栋当前离线设备 3 台:\n- A栋 空调机组 #1 (暖通)\n- A栋 空调机组 #4 (暖通)\n- A栋 温湿度传感器 A-12F (传感器)";
          if (b === "B") return "【示例数据】B栋当前离线设备 1 台:\n- B栋 电表 #2 (能耗)";
          return "【示例数据】园区当前共有 5 台设备离线:\n- A栋 空调机组 #1 (暖通)\n- A栋 传感器 A-12F (传感器)\n- B栋 电表 #2 (能耗)\n- C栋 照明控制 CC-3 (照明)\n- D栋 门禁 D-1F (安防)";
        }
        case "parkInfo":
          return "【示例数据】智慧产业园,占地面积 8.6 万㎡,共 6 栋建筑,入驻企业 42 家,从业人员约 2,800 人。";
        default:
          return "暂无数据。";
      }
    },

    allStatic() { return STATIC_KB; },
    allRules() { return API_RULES; }
  };

  global.Knowledge = Knowledge;
})(window);
