// 知识库模块 —— 关键词匹配预设问答(对标 Fay 的 qa.csv)
(function (global) {
  "use strict";

  // 内置示例知识库(可按需扩展),命中关键词即返回预设答案,无需调用 LLM
  const KB = [
    {
      keywords: ["你好", "您好", "hi", "hello", "在吗"],
      answer: "你好!我是 AI 数字人,很高兴为您服务。您可以问我任何问题,也可以用语音和我对话。"
    },
    {
      keywords: ["你是谁", "介绍", "自我介绍"],
      answer: "我是一个基于开源技术构建的 AI 数字人,大脑是 DeepSeek 大模型,支持语音对话和形象切换,部署在 GitHub Pages 上完全免费运行。"
    },
    {
      keywords: ["功能", "能做什么", "会什么"],
      answer: "我能做这些:1) 智能问答,接入大模型回答各类问题;2) 语音对话,麦克风说话我语音回答;3) 形象切换,左侧可切换不同数字人形象;4) 知识库匹配,预设问答秒回。点击右上角设置可配置 API Key。"
    },
    {
      keywords: ["园区", "能耗", "设备"],
      answer: "【示例知识库】园区今日总能耗 1280 kWh,A 栋有 3 台设备离线(空调机组 2 台、传感器 1 台)。您可以在 js/knowledge.js 中替换为真实园区数据接口。"
    },
    {
      keywords: ["开源", "许可证", "license", "免费"],
      answer: "本 Demo 参考 Fay(GPL-3.0)开源框架构建,采用纯浏览器端实现。Fay、OpenAvatarChat、Linly-Talker 均为真正开源免费的数字人项目。"
    },
    {
      keywords: ["怎么用", "如何使用", "教程"],
      answer: "使用步骤:1) 点击右上角设置;2) 填入 DeepSeek API Key(前往 platform.deepseek.com 申请);3) 保存后即可文字或语音对话。麦克风按钮点击开始说话,再次点击结束。"
    }
  ];

  const Knowledge = {
    enabled: true,

    // 返回 { matched, answer }
    query(text) {
      if (!this.enabled) return { matched: false };
      const lower = text.toLowerCase();
      for (const item of KB) {
        if (item.keywords.some((k) => lower.includes(k.toLowerCase()))) {
          return { matched: true, answer: item.answer };
        }
      }
      return { matched: false };
    },

    all() {
      return KB;
    }
  };

  global.Knowledge = Knowledge;
})(window);
