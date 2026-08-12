// 数字人 SVG 头像模块 —— 8+ 种形象 + 口型/眨眼动画 + 自定义图片
(function (global) {
  "use strict";

  const SVG_KIDS = {
    // 形象模板: type 支持 male(男通用) / female(女通用) / glasses(眼镜男) / business(商务) / cuteGirl(长发女生) / techGuy(科技男) / oldMan(老年)
    male: (p) => `
      <!-- 后脑头发 -->
      <ellipse cx="150" cy="130" rx="82" ry="88" fill="url(#hairGrad)"/>
      <!-- 刘海 -->
      <path d="M 82 110 Q 100 70 150 72 Q 200 70 218 110 Q 200 95 175 100 Q 160 85 150 100 Q 140 85 125 100 Q 100 95 82 110 Z" fill="url(#hairGrad)"/>
    `,
    female: (p) => `
      <!-- 女生长发后层 -->
      <path d="M 70 120 Q 60 180 72 245 Q 110 255 150 250 Q 190 255 228 245 Q 240 180 230 120 Q 200 95 150 92 Q 100 95 70 120 Z" fill="url(#hairGrad)"/>
      <!-- 两侧长发 -->
      <path d="M 72 130 Q 66 200 80 255 L 100 252 Q 90 200 95 140 Z" fill="url(#hairGrad)" opacity="0.95"/>
      <path d="M 228 130 Q 234 200 220 255 L 200 252 Q 210 200 205 140 Z" fill="url(#hairGrad)" opacity="0.95"/>
      <!-- 刘海(齐刘海) -->
      <path d="M 88 108 Q 100 80 150 82 Q 200 80 212 108 L 210 125 Q 190 120 175 122 Q 170 118 150 122 Q 130 118 125 122 Q 110 120 90 125 Z" fill="url(#hairGrad)"/>
    `,
    glasses: (p) => `
      <!-- 男通用头发 -->
      <ellipse cx="150" cy="130" rx="82" ry="88" fill="url(#hairGrad)"/>
      <path d="M 82 110 Q 100 70 150 72 Q 200 70 218 110 Q 200 95 175 100 Q 160 85 150 100 Q 140 85 125 100 Q 100 95 82 110 Z" fill="url(#hairGrad)"/>
    `,
    business: (p) => `
      <!-- 背头短发 -->
      <path d="M 82 118 Q 80 78 120 68 Q 150 62 180 68 Q 220 78 218 118 Q 200 95 170 92 Q 150 88 130 92 Q 100 95 82 118 Z" fill="url(#hairGrad)"/>
      <!-- 侧边 -->
      <path d="M 78 118 Q 78 150 84 175 L 100 170 Q 96 140 98 115 Z" fill="${shade(p.hair, -25)}"/>
      <path d="M 222 118 Q 222 150 216 175 L 200 170 Q 204 140 202 115 Z" fill="${shade(p.hair, -25)}"/>
    `,
    cuteGirl: (p) => `
      <!-- 双马尾后层 -->
      <path d="M 70 125 Q 58 200 70 260 Q 100 270 150 262 Q 200 270 230 260 Q 242 200 230 125 Q 200 98 150 95 Q 100 98 70 125 Z" fill="url(#hairGrad)"/>
      <!-- 左侧马尾 -->
      <ellipse cx="64" cy="225" rx="24" ry="46" fill="url(#hairGrad)" transform="rotate(-15 64 225)"/>
      <!-- 右侧马尾 -->
      <ellipse cx="236" cy="225" rx="24" ry="46" fill="url(#hairGrad)" transform="rotate(15 236 225)"/>
      <!-- 空气刘海 -->
      <path d="M 90 112 Q 115 85 150 86 Q 185 85 210 112 Q 192 100 170 104 Q 150 98 130 104 Q 108 100 90 112 Z" fill="url(#hairGrad)"/>
      <!-- 蝴蝶结 -->
      <path d="M 138 78 L 128 70 L 130 86 Z" fill="${p.accent}"/>
      <path d="M 162 78 L 172 70 L 170 86 Z" fill="${p.accent}"/>
      <circle cx="150" cy="80" r="4" fill="${shade(p.accent, -20)}"/>
    `,
    techGuy: (p) => `
      <!-- 极客风:偏分 + 侧边剃短 -->
      <path d="M 82 115 Q 85 72 135 64 Q 160 62 180 68 Q 215 78 218 115 L 210 118 Q 200 96 178 92 Q 160 88 145 92 L 102 120 Q 92 125 82 115 Z" fill="url(#hairGrad)"/>
      <!-- 剃短阴影 -->
      <path d="M 82 120 Q 78 160 86 185 L 102 180 Q 96 150 98 122 Z" fill="${shade(p.skin, -20)}" opacity="0.5"/>
    `,
    oldMan: (p) => `
      <!-- 老年:灰白头发+秃顶 -->
      <ellipse cx="150" cy="150" rx="80" ry="82" fill="url(#hairGrad)" opacity="0.6"/>
      <path d="M 95 128 Q 100 140 110 138 Q 100 160 88 160 Q 80 145 88 130 Z" fill="url(#hairGrad)"/>
      <path d="M 205 128 Q 200 140 190 138 Q 200 160 212 160 Q 220 145 212 130 Z" fill="url(#hairGrad)"/>
      <!-- 眉毛变白 -->
      <path d="M 108 125 Q 122 118 136 124" stroke="${shade(p.hair, 40)}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M 164 124 Q 178 118 192 125" stroke="${shade(p.hair, 40)}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    `
  };

  const EYES = {
    default: (p) => `
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
    `,
    glasses: (p) => `
      ${EYES.default(p)}
      <!-- 眼镜框 -->
      <circle cx="122" cy="150" r="20" fill="none" stroke="${shade(p.hair, -30)}" stroke-width="3"/>
      <circle cx="178" cy="150" r="20" fill="none" stroke="${shade(p.hair, -30)}" stroke-width="3"/>
      <line x1="142" y1="150" x2="158" y2="150" stroke="${shade(p.hair, -30)}" stroke-width="3"/>
      <!-- 镜片反光 -->
      <path d="M 110 140 L 118 136" stroke="#fff" stroke-width="2" opacity="0.7"/>
      <path d="M 166 140 L 174 136" stroke="#fff" stroke-width="2" opacity="0.7"/>
    `,
    female: (p) => `
      <!-- 女生眼:略大 + 睫毛 -->
      <g class="blink">
        <ellipse cx="122" cy="149" rx="10" ry="12" fill="#fff"/>
        <circle cx="123" cy="151" r="7" fill="#4a3a6b"/>
        <circle cx="125.5" cy="149" r="2.5" fill="#fff"/>
        <!-- 睫毛 -->
        <path d="M 112 140 L 108 135 M 118 138 L 116 132 M 126 138 L 126 132" stroke="${shade(p.hair, -15)}" stroke-width="2" stroke-linecap="round"/>
      </g>
      <g class="blink">
        <ellipse cx="178" cy="149" rx="10" ry="12" fill="#fff"/>
        <circle cx="179" cy="151" r="7" fill="#4a3a6b"/>
        <circle cx="181.5" cy="149" r="2.5" fill="#fff"/>
        <path d="M 188 140 L 192 135 M 182 138 L 184 132 M 174 138 L 174 132" stroke="${shade(p.hair, -15)}" stroke-width="2" stroke-linecap="round"/>
      </g>
    `,
    wink: (p) => `
      <g class="blink">
        <ellipse cx="122" cy="148" rx="9" ry="11" fill="#fff"/>
        <circle cx="123" cy="150" r="6" fill="#2d2d4a"/>
        <circle cx="125" cy="148" r="2" fill="#fff"/>
      </g>
      <!-- 右眼眨眼 -->
      <path d="M 168 150 Q 178 146 188 150" stroke="#2d2d4a" stroke-width="3" fill="none" stroke-linecap="round"/>
    `
  };

  const MOUTHS = {
    default: (p) => `<ellipse class="mouth" cx="150" cy="198" rx="14" ry="6" fill="${shade(p.skin, -40)}"/>`,
    smile: (p) => `<path class="mouth" d="M 136 196 Q 150 208 164 196" stroke="${shade(p.skin, -45)}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    female: (p) => `
      <path class="mouth" d="M 136 198 Q 150 208 164 198 Q 150 202 136 198 Z" fill="#d65a6b"/>
      <path d="M 136 198 Q 150 194 164 198" stroke="#fff" stroke-width="1.5" fill="none" opacity="0.6"/>
    `,
    beard: (p) => `
      <!-- 胡子 -->
      <path d="M 120 190 Q 135 200 150 196 Q 165 200 180 190 Q 175 210 150 214 Q 125 210 120 190 Z" fill="${shade(p.hair, -10)}" opacity="0.85"/>
      <ellipse class="mouth" cx="150" cy="202" rx="10" ry="3" fill="${shade(p.skin, -45)}"/>
    `
  };

  const PERSONAS = [
    // 原 4 个保留
    { id: "tech",     name: "科技蓝", skin: "#ffe0c4", hair: "#2d3a5c", accent: "#6c8cff",  bg: "rgba(108,140,255,0.15)", type: "male" },
    { id: "cute",     name: "梦幻紫", skin: "#ffe6d5", hair: "#8b5cf6", accent: "#a06cff",  bg: "rgba(160,108,255,0.15)", type: "male" },
    { id: "natural",  name: "自然绿", skin: "#ffe0c4", hair: "#3d6b4a", accent: "#4ade80",  bg: "rgba(74,222,128,0.12)", type: "male" },
    { id: "energy",   name: "活力橙", skin: "#ffe6d5", hair: "#d97706", accent: "#fb923c",  bg: "rgba(251,146,60,0.12)", type: "male" },
    // 新增 5 个
    { id: "girl",     name: "少女粉", skin: "#ffe7dd", hair: "#b96798", accent: "#ec4899",  bg: "rgba(236,72,153,0.12)", type: "female",  eyeKind: "female", mouthKind: "female" },
    { id: "cuteGirl", name: "元气双马尾", skin: "#fff1df", hair: "#e6b800", accent: "#f59e0b",  bg: "rgba(245,158,11,0.15)", type: "cuteGirl", eyeKind: "female", mouthKind: "smile" },
    { id: "biz",      name: "商务精英", skin: "#ffdcc3", hair: "#1f2937", accent: "#0ea5e9",  bg: "rgba(14,165,233,0.12)", type: "business", mouthKind: "beard" },
    { id: "prof",     name: "学者教授", skin: "#ffe1c8", hair: "#e5e7eb", accent: "#14b8a6",  bg: "rgba(20,184,166,0.12)", type: "glasses", eyeKind: "glasses", mouthKind: "smile" },
    { id: "geek",     name: "极客少年", skin: "#ffdcb8", hair: "#1e293b", accent: "#f43f5e",  bg: "rgba(244,63,94,0.12)", type: "techGuy", eyeKind: "glasses" }
  ];

  function shade(hex, amt) {
    const h = String(hex).replace("#", "");
    if (h.length !== 6) return hex;
    const num = parseInt(h, 16);
    let r = (num >> 16) + amt;
    let g = ((num >> 8) & 0xff) + amt;
    let b = (num & 0xff) + amt;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
  }

  function renderSVG(persona) {
    const kind = persona.type || "male";
    const eyeKind = persona.eyeKind || "default";
    const mouthKind = persona.mouthKind || "default";
    const hairFn = SVG_KIDS[kind] || SVG_KIDS.male;
    const eyeFn = EYES[eyeKind] || EYES.default;
    const mouthFn = MOUTHS[mouthKind] || MOUTHS.default;
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

      <circle cx="150" cy="150" r="145" fill="url(#bgGrad)"/>
      <rect x="128" y="220" width="44" height="50" rx="14" fill="${shade(persona.skin, -15)}"/>

      <g class="head-group">
        ${hairFn(persona)}
        <!-- 耳朵 -->
        <ellipse cx="84" cy="150" rx="10" ry="16" fill="${shade(persona.skin, -10)}"/>
        <ellipse cx="216" cy="150" rx="10" ry="16" fill="${shade(persona.skin, -10)}"/>
        <!-- 脸 -->
        <ellipse cx="150" cy="148" rx="68" ry="74" fill="${persona.skin}"/>
        <!-- 眉毛(除了 oldMan 里覆盖) -->
        ${kind === "oldMan" ? "" : `
          <path d="M 108 125 Q 122 118 136 124" stroke="${shade(persona.hair, -10)}" stroke-width="${kind === 'female' || kind === 'cuteGirl' ? 2.5 : 3.5}" fill="none" stroke-linecap="round"/>
          <path d="M 164 124 Q 178 118 192 125" stroke="${shade(persona.hair, -10)}" stroke-width="${kind === 'female' || kind === 'cuteGirl' ? 2.5 : 3.5}" fill="none" stroke-linecap="round"/>
        `}
        ${eyeFn(persona)}
        <!-- 鼻子 -->
        <path d="M 148 158 Q 146 172 144 180 Q 148 184 154 182" stroke="${shade(persona.skin, -25)}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        ${mouthFn(persona)}
        <!-- 腮红 -->
        <ellipse cx="108" cy="178" rx="${kind === 'female' || kind === 'cuteGirl' ? 12 : 10}" ry="${kind === 'female' || kind === 'cuteGirl' ? 7 : 6}" fill="${persona.accent}" opacity="${kind === 'female' || kind === 'cuteGirl' ? 0.32 : 0.25}"/>
        <ellipse cx="192" cy="178" rx="${kind === 'female' || kind === 'cuteGirl' ? 12 : 10}" ry="${kind === 'female' || kind === 'cuteGirl' ? 7 : 6}" fill="${persona.accent}" opacity="${kind === 'female' || kind === 'cuteGirl' ? 0.32 : 0.25}"/>
      </g>
    </svg>`;
  }

  function renderCustomImage(url) {
    return `
    <div style="width:100%;height:100%;position:relative;border-radius:50%;overflow:hidden;box-shadow:0 0 40px rgba(108,140,255,0.25)">
      <img id="custom-avatar-img" src="${url}" style="width:100%;height:100%;object-fit:cover" alt="自定义头像" />
    </div>`;
  }

  const Avatar = {
    personas: PERSONAS,
    current: PERSONAS[0],
    customUrl: null,

    mount(containerId) {
      this.container = document.getElementById(containerId);
      this.render();
    },

    render() {
      if (this.customUrl) {
        this.container.innerHTML = renderCustomImage(this.customUrl);
        this.svg = null;
        return;
      }
      this.container.innerHTML = renderSVG(this.current);
      this.svg = document.getElementById("avatar-svg");
    },

    switchTo(personaId) {
      const p = PERSONAS.find((x) => x.id === personaId);
      if (!p) return;
      this.current = p;
      this.customUrl = null;
      this.render();
    },

    useCustomImage(url) {
      this.customUrl = url;
      this.render();
    },

    clearCustom() {
      this.customUrl = null;
      this.render();
    },

    setSpeaking(speaking) {
      if (!this.svg) return;
      this.svg.classList.toggle("speaking", speaking);
    },

    setThinking(thinking) {
      if (!this.svg) return;
      const head = this.svg.querySelector(".head-group");
      if (!head) return;
      head.style.transform = thinking ? "rotate(-2deg)" : "";
    }
  };

  global.Avatar = Avatar;
})(window);
