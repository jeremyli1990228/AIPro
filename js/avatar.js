// 数字人 SVG 头像模块 —— 多形象切换 + 口型/眨眼动画
(function (global) {
  "use strict";

  // 形象预设:不同配色与发型
  const PERSONAS = [
    {
      id: "tech",
      name: "科技蓝",
      skin: "#ffe0c4",
      hair: "#2d3a5c",
      accent: "#6c8cff",
      bg: "rgba(108,140,255,0.15)"
    },
    {
      id: "cute",
      name: "梦幻紫",
      skin: "#ffe6d5",
      hair: "#8b5cf6",
      accent: "#a06cff",
      bg: "rgba(160,108,255,0.15)"
    },
    {
      id: "natural",
      name: "自然绿",
      skin: "#ffe0c4",
      hair: "#3d6b4a",
      accent: "#4ade80",
      bg: "rgba(74,222,128,0.12)"
    },
    {
      id: "energy",
      name: "活力橙",
      skin: "#ffe6d5",
      hair: "#d97706",
      accent: "#fb923c",
      bg: "rgba(251,146,60,0.12)"
    }
  ];

  function renderSVG(persona) {
    return `
    <svg class="avatar-svg" id="avatar-svg" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bgGrad" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="${persona.accent}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${persona.accent}" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="hairGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="${persona.hair}"/>
          <stop offset="100%" stop-color="${shade(persona.hair, -20)}"/>
        </linearGradient>
      </defs>

      <!-- 背景光晕 -->
      <circle cx="150" cy="150" r="145" fill="url(#bgGrad)"/>

      <!-- 颈部 -->
      <rect x="128" y="220" width="44" height="50" rx="14" fill="${shade(persona.skin, -15)}"/>

      <!-- 头部主体 -->
      <g class="head-group">
        <!-- 后脑头发 -->
        <ellipse cx="150" cy="130" rx="82" ry="88" fill="url(#hairGrad)"/>

        <!-- 脸 -->
        <ellipse cx="150" cy="148" rx="68" ry="74" fill="${persona.skin}"/>

        <!-- 刘海 -->
        <path d="M 82 110 Q 100 70 150 72 Q 200 70 218 110 Q 200 95 175 100 Q 160 85 150 100 Q 140 85 125 100 Q 100 95 82 110 Z" fill="url(#hairGrad)"/>

        <!-- 耳朵 -->
        <ellipse cx="84" cy="150" rx="10" ry="16" fill="${shade(persona.skin, -10)}"/>
        <ellipse cx="216" cy="150" rx="10" ry="16" fill="${shade(persona.skin, -10)}"/>

        <!-- 眉毛 -->
        <path d="M 108 125 Q 122 118 136 124" stroke="${shade(persona.hair, -10)}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        <path d="M 164 124 Q 178 118 192 125" stroke="${shade(persona.hair, -10)}" stroke-width="3.5" fill="none" stroke-linecap="round"/>

        <!-- 眼睛 (含眨眼动画) -->
        <g class="blink">
          <ellipse cx="122" cy="148" rx="9" ry="11" fill="#fff"/>
          <circle cx="123" cy="150" r="6" fill="#2d2d4a"/>
          <circle cx="125" cy="148" r="2" fill="#fff"/>
        </g>
        <g class="blink">
          <ellipse cx="178" cy="148" rx="9" ry="11" fill="#fff"/>
          <circle cx="179" cy="150" r="6" fill="#2d2d4a"/>
          <circle cx="181" cy="148" r="2" fill="#fff"/>
        </g>

        <!-- 鼻子 -->
        <path d="M 148 158 Q 146 172 144 180 Q 148 184 154 182" stroke="${shade(persona.skin, -25)}" stroke-width="2.5" fill="none" stroke-linecap="round"/>

        <!-- 嘴巴 (说话动画) -->
        <ellipse class="mouth" cx="150" cy="198" rx="14" ry="6" fill="${shade(persona.skin, -40)}"/>

        <!-- 腮红 -->
        <ellipse cx="108" cy="178" rx="10" ry="6" fill="${persona.accent}" opacity="0.25"/>
        <ellipse cx="192" cy="178" rx="10" ry="6" fill="${persona.accent}" opacity="0.25"/>
      </g>
    </svg>`;
  }

  // 简易颜色变暗工具
  function shade(hex, amt) {
    const h = hex.replace("#", "");
    const num = parseInt(h, 16);
    let r = (num >> 16) + amt;
    let g = ((num >> 8) & 0xff) + amt;
    let b = (num & 0xff) + amt;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
  }

  const Avatar = {
    personas: PERSONAS,
    current: PERSONAS[0],

    mount(containerId) {
      this.container = document.getElementById(containerId);
      this.render();
    },

    render() {
      this.container.innerHTML = renderSVG(this.current);
      this.svg = document.getElementById("avatar-svg");
    },

    switchTo(personaId) {
      const p = PERSONAS.find((x) => x.id === personaId);
      if (!p) return;
      this.current = p;
      this.render();
    },

    setSpeaking(speaking) {
      if (!this.svg) return;
      this.svg.classList.toggle("speaking", speaking);
    },

    // 思考时的轻微晃动
    setThinking(thinking) {
      if (!this.svg) return;
      const head = this.svg.querySelector(".head-group");
      if (!head) return;
      head.style.transform = thinking ? "rotate(-2deg)" : "";
    }
  };

  global.Avatar = Avatar;
})(window);
