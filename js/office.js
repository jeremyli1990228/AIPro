// AI 办公助手模块 —— 会议安排 / 工单管理 / 自然语言对话（纯浏览器端）
(function (global) {
  "use strict";

  const $ = global.Shared.$;
  // cfg 是引用对象，运行时读取保证拿到最新值
  const cfg = () => global.Shared.cfg;

  // ===== 预置会议室数据 =====
  const ROOMS = [
    { id: "A301", name: "A栋3层-1号会议室", capacity: 12, equipment: ["投影仪", "白板", "视频会议"], status: "available" },
    { id: "A302", name: "A栋3层-2号会议室", capacity: 8, equipment: ["投影仪", "白板"], status: "available" },
    { id: "B201", name: "B栋2层-大会议室", capacity: 30, equipment: ["LED屏", "音响", "视频会议"], status: "occupied" },
    { id: "B202", name: "B栋2层-小会议室", capacity: 6, equipment: ["白板"], status: "available" },
    { id: "C105", name: "C栋1层-培训室", capacity: 50, equipment: ["投影仪", "音响", "LED屏"], status: "available" }
  ];

  // ===== 初始工单数据 =====
  const DEFAULT_TICKETS = [
    { id: "WO-2026-001", title: "A栋3层空调不制冷", type: "维修", priority: "高", status: "open", location: "A栋3层", desc: "中央空调出风口无冷风", createTime: "2026-08-10 09:30" },
    { id: "WO-2026-002", title: "B栋大厅照明灯故障", type: "维修", priority: "中", status: "in_progress", location: "B栋1层", desc: "大厅左侧照明灯不亮", createTime: "2026-08-09 14:20" },
    { id: "WO-2026-003", title: "园区月度消防巡检", type: "巡检", priority: "中", status: "closed", location: "全园区", desc: "消防设备月度检查", createTime: "2026-08-05 10:00" },
    { id: "WO-2026-004", title: "C栋网络信号差", type: "投诉", priority: "紧急", status: "open", location: "C栋5层", desc: "多户反映网络信号差", createTime: "2026-08-11 16:45" }
  ];

  // 工单状态映射
  const STATUS_MAP = { open: "待处理", in_progress: "处理中", closed: "已完成" };

  // localStorage key
  const LS_TICKETS = "office_tickets";
  const LS_MEETINGS = "office_meetings";

  // ===== 运行时状态 =====
  let tickets = [];
  let meetings = [];
  let currentMeeting = null;   // 当前正在编辑/确认的会议
  let selectedRoomId = null;   // 当前选中的会议室
  let sending = false;         // 防止重复发送

  // ===== 工具函数 =====
  function hasApiKey() {
    return !!(cfg() && cfg().apiKey);
  }

  // 简单 HTML 转义，避免动态文本注入
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function pad2(n) { return String(n).padStart(2, "0"); }
  function fmtDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

  // 从 LLM 文本中提取 JSON 对象
  function extractJSON(text) {
    if (!text) return null;
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const raw = fence ? fence[1] : text;
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) return null;
    try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
  }

  // ===== localStorage 持久化 =====
  function loadTickets() {
    try {
      const raw = localStorage.getItem(LS_TICKETS);
      if (raw) { tickets = JSON.parse(raw); return; }
    } catch {}
    tickets = DEFAULT_TICKETS.map((t) => ({ ...t }));
    saveTickets();
  }
  function saveTickets() {
    try { localStorage.setItem(LS_TICKETS, JSON.stringify(tickets)); } catch {}
  }
  function loadMeetings() {
    try {
      const raw = localStorage.getItem(LS_MEETINGS);
      meetings = raw ? JSON.parse(raw) : [];
    } catch { meetings = []; }
  }
  function saveMeetings() {
    try { localStorage.setItem(LS_MEETINGS, JSON.stringify(meetings)); } catch {}
  }

  // ===== 消息渲染 =====
  function botAvatarText() {
    const name = (cfg() && cfg().name) || "小助";
    return name.slice(0, 2);
  }

  // 添加一条消息，role: 'bot' | 'user'，返回 bubble 元素（便于流式更新）
  function addMsg(role, text) {
    const div = document.createElement("div");
    div.className = "msg msg-" + role;
    const av = document.createElement("div");
    av.className = "msg-avatar";
    av.textContent = role === "bot" ? botAvatarText() : "我";
    const b = document.createElement("div");
    b.className = "msg-bubble";
    b.style.whiteSpace = "pre-wrap";
    b.textContent = text || "";
    div.appendChild(av);
    div.appendChild(b);
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
    return b;
  }
  const addUserMsg = (t) => addMsg("user", t);
  const addBotMsg = (t) => addMsg("bot", t);

  // ===== 意图识别 =====
  // 返回: 'meeting' | 'ticket_create' | 'ticket_query' | 'chat'
  function detectIntent(text) {
    const t = text || "";
    const isMeeting = /会议|安排|预约|会议室|开会|开会啦|日程/.test(t);
    const isTicket = /工单|报修|维修|巡检|投诉|查询工单|创建工单|新建工单/.test(t);
    if (isMeeting && !isTicket) return "meeting";
    if (isTicket) {
      if (/查询|查看|列表|状态|进度|我的|所有|哪些|多少/.test(t) && !/创建|报修|新建|提交|登记|新增/.test(t)) {
        return "ticket_query";
      }
      return "ticket_create";
    }
    return "chat";
  }

  // ===== 本地解析：会议（无 API Key 降级） =====
  function resolveDate(text) {
    const now = new Date();
    if (/今天/.test(text)) return fmtDate(now);
    if (/明天/.test(text)) { const d = new Date(now); d.setDate(d.getDate() + 1); return fmtDate(d); }
    if (/后天/.test(text)) { const d = new Date(now); d.setDate(d.getDate() + 2); return fmtDate(d); }
    const m = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/);
    if (m) return `${now.getFullYear()}-${pad2(parseInt(m[1], 10))}-${pad2(parseInt(m[2], 10))}`;
    return fmtDate(now);
  }
  function resolveTime(text) {
    let hour = null, minute = 0;
    const m = text.match(/(\d{1,2})\s*[:：]\s*(\d{1,2})/);
    if (m) { hour = +m[1]; minute = +m[2]; }
    else {
      const m2 = text.match(/(上午|下午|早上|晚上|中午)?\s*(\d{1,2})\s*[点时]/);
      if (m2) {
        hour = +m2[2];
        const ap = m2[1] || "";
        if ((ap === "下午" || ap === "晚上" || ap === "中午") && hour < 12) hour += 12;
        if ((ap === "上午" || ap === "早上") && hour === 12) hour = 0;
      }
    }
    if (hour === null) return "14:00";
    return `${pad2(hour)}:${pad2(minute)}`;
  }
  function resolveDuration(text) {
    const mHour = text.match(/(\d+(?:\.\d+)?)\s*(小时|h|H)/);
    if (mHour) return parseFloat(mHour[1]);
    const mMin = text.match(/(\d+)\s*分钟/);
    if (mMin) return Math.round((+mMin[1] / 60) * 10) / 10;
    return 1;
  }
  function resolveAttendees(text) {
    let raw = "";
    const m = text.match(/(?:参会人|参加人员|参与者|参加|参与|出席)[:：]?\s*([^\s,，。；;。]+)/);
    if (m) raw = m[1];
    if (!raw) {
      const m2 = text.match(/([\u4e00-\u9fa5]{2,3}、[\u4e00-\u9fa5]{2,3}(?:、[\u4e00-\u9fa5]{2,3})*)/);
      if (m2) raw = m2[1];
    }
    if (!raw) return ["张三", "李四"];
    return raw.split(/[、,，\s]+/).map((s) => s.trim()).filter(Boolean);
  }
  function resolveRoomReq(text) {
    const reqs = [];
    if (/视频|远程|线上/.test(text)) reqs.push("视频会议");
    if (/投影/.test(text)) reqs.push("投影仪");
    if (/白板/.test(text)) reqs.push("白板");
    if (/LED|大屏|屏幕/.test(text)) reqs.push("LED屏");
    if (/音响|麦克风|话筒|扩音/.test(text)) reqs.push("音响");
    return reqs.length ? reqs.join("、") : "无特殊要求";
  }
  function resolveTitle(text) {
    const m = text.match(/(?:关于|主题[:：]?)\s*([^\s,，。；;]{2,20})/);
    if (m) return m[1];
    const m2 = text.match(/([\u4e00-\u9fa5]{2,15}(?:会|会议|评审|讨论|研讨|培训|对接|复盘))/);
    if (m2) return m2[1];
    return "临时会议";
  }
  function localParseMeeting(text) {
    return {
      title: resolveTitle(text),
      date: resolveDate(text),
      time: resolveTime(text),
      duration: resolveDuration(text),
      attendees: resolveAttendees(text),
      roomRequirement: resolveRoomReq(text)
    };
  }

  // ===== 本地解析：工单（无 API Key 降级） =====
  function localParseTicket(text) {
    let type = "维修";
    if (/巡检/.test(text)) type = "巡检";
    else if (/投诉/.test(text)) type = "投诉";
    else if (/咨询/.test(text)) type = "咨询";
    else if (/维修|故障|损坏|不制冷|不亮|漏水|断电|没电|信号差|异常|坏/.test(text)) type = "维修";

    let priority = "中";
    if (/紧急|马上|立刻|严重|十分/.test(text)) priority = "紧急";
    else if (/高|重要|尽快|优先/.test(text)) priority = "高";
    else if (/低|不急|方便时|有空/.test(text)) priority = "低";

    let location = "";
    const lm = text.match(/([\u4e00-\u9fa5]{1,2}栋[\u4e00-\u9fa50-9]{1,6}层?)/);
    if (lm) location = lm[0];
    if (!location) {
      const lm2 = text.match(/(?:位置|地点|地址)[:：]?\s*([^\s,，。；;]+)/);
      if (lm2) location = lm2[1];
    }
    if (!location) location = "未指定";

    let title = "";
    const tm = text.match(/(?:创建|报修|提交|登记|新建|工单)[:：]?\s*([^\s,，。；;]{4,30})/);
    if (tm) title = tm[1];
    if (!title) {
      const tm2 = text.match(/([\u4e00-\u9fa5]{4,20}(?:故障|问题|损坏|不制冷|不亮|漏水|信号差|异常))/);
      if (tm2) title = tm2[1];
    }
    if (!title) title = text.slice(0, 20).trim() || "新工单";

    return { title, type, priority, location, desc: text };
  }

  // ===== LLM 解析：会议 / 工单 =====
  async function llmParseMeeting(text) {
    const systemPrompt =
      "你是会议信息解析助手。从用户输入中提取会议安排信息，严格返回 JSON，格式为：" +
      '{"title":"会议主题","date":"YYYY-MM-DD","time":"HH:mm","duration":1,' +
      '"attendees":["姓名"],"roomRequirement":"设备要求"}。duration 为小时数(数字)。' +
      "若用户未提及的字段，请合理推断默认值。只返回 JSON，不要输出任何其他文字。";
    const resp = await global.Shared.llm({
      messages: [{ role: "user", content: text }],
      temperature: 0.2,
      systemPrompt
    });
    return extractJSON(resp);
  }
  async function llmParseTicket(text) {
    const systemPrompt =
      "你是工单信息解析助手。从用户描述中提取工单信息，严格返回 JSON，格式为：" +
      '{"title":"标题","type":"维修|巡检|投诉|咨询","priority":"低|中|高|紧急",' +
      '"location":"位置","desc":"详细描述"}。只返回 JSON，不要输出任何其他文字。';
    const resp = await global.Shared.llm({
      messages: [{ role: "user", content: text }],
      temperature: 0.2,
      systemPrompt
    });
    return extractJSON(resp);
  }

  // ===== 会议室推荐 =====
  function recommendRooms(meeting) {
    const need = String(meeting.roomRequirement || "")
      .split(/[、,，\s]+/)
      .filter((s) => s && s !== "无特殊要求");
    const count = (meeting.attendees || []).length || 1;
    const scored = ROOMS.map((r) => {
      let score = 0;
      if (r.status === "available") score += 100;
      if (r.capacity >= count) score += 30; else score -= 20;
      need.forEach((eq) => { if (r.equipment.indexOf(eq) !== -1) score += 15; });
      // 容量刚好够的优先（避免浪费大会议室）
      if (r.capacity >= count && r.capacity <= count + 10) score += 5;
      return Object.assign({}, r, { _score: score });
    });
    scored.sort((a, b) => b._score - a._score);
    return scored;
  }

  // ===== 会议详情渲染 =====
  function renderMeetingDetail(meeting) {
    currentMeeting = meeting;
    selectedRoomId = null;

    // 切换到会议 Tab，显示详情、隐藏空状态
    switchOTab("meeting");
    $("meeting-empty").style.display = "none";
    $("meeting-detail").style.display = "block";

    // 会议信息网格
    const grid = $("meeting-info");
    const items = [
      { label: "主题", value: meeting.title },
      { label: "日期", value: meeting.date },
      { label: "时间", value: meeting.time },
      { label: "时长", value: meeting.duration + " 小时" },
      { label: "会议室要求", value: meeting.roomRequirement || "无特殊要求" }
    ];
    grid.innerHTML = items.map((it) =>
      `<div class="detail-item"><div class="di-label">${esc(it.label)}</div><div class="di-value">${esc(it.value)}</div></div>`
    ).join("");

    // 参会人
    const attWrap = $("meeting-attendees");
    const attendees = meeting.attendees || [];
    attWrap.innerHTML = attendees.map((name) => {
      const initial = esc((name || "").slice(0, 1));
      return `<div class="attendee-chip"><div class="attendee-avatar">${initial}</div>${esc(name)}</div>`;
    }).join("") || '<span style="color:var(--text-dim);font-size:13px">暂无参会人</span>';

    // 推荐会议室
    renderRoomList(meeting);
  }

  function renderRoomList(meeting) {
    const wrap = $("meeting-rooms");
    const list = recommendRooms(meeting);
    // 默认选中评分最高且可用的房间
    const topAvailable = list.find((r) => r.status === "available");
    if (topAvailable && !selectedRoomId) selectedRoomId = topAvailable.id;

    wrap.innerHTML = list.map((r) => {
      const statusText = r.status === "available" ? "可用" : "占用中";
      const selected = r.id === selectedRoomId ? " selected" : "";
      const disabled = r.status === "occupied" ? ' style="opacity:0.55;cursor:not-allowed"' : "";
      return (
        `<div class="room-card${selected}" data-room="${esc(r.id)}"${disabled}>` +
        `<div class="room-info">` +
        `<div class="room-name">${esc(r.name)}</div>` +
        `<div class="room-meta">容纳 ${r.capacity} 人 · ${esc(r.equipment.join("、"))}</div>` +
        `</div>` +
        `<div class="room-status ${r.status}">${statusText}</div>` +
        `</div>`
      );
    }).join("");

    // 绑定点击选择（仅可用房间可选）
    wrap.querySelectorAll(".room-card").forEach((card) => {
      card.addEventListener("click", () => {
        const id = card.getAttribute("data-room");
        const room = ROOMS.find((r) => r.id === id);
        if (!room || room.status !== "available") return;
        selectedRoomId = id;
        wrap.querySelectorAll(".room-card").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
      });
    });
  }

  function resetMeetingPanel() {
    currentMeeting = null;
    selectedRoomId = null;
    $("meeting-detail").style.display = "none";
    $("meeting-empty").style.display = "block";
    $("meeting-info").innerHTML = "";
    $("meeting-attendees").innerHTML = "";
    $("meeting-rooms").innerHTML = "";
  }

  // 确认会议并发送邀约
  function confirmMeeting() {
    if (!currentMeeting) {
      addBotMsg("当前没有待确认的会议。您可以在对话框中告诉我会议安排需求。");
      return;
    }
    if (!selectedRoomId) {
      addBotMsg("请先在右侧推荐会议室列表中选择一间会议室。");
      switchOTab("meeting");
      return;
    }
    const room = ROOMS.find((r) => r.id === selectedRoomId);
    const m = Object.assign({}, currentMeeting, { room: room ? room.name : "", roomId: selectedRoomId });
    meetings.unshift(m);
    saveMeetings();
    renderMeetingList();

    const summary =
      `✅ 会议邀约已发送！\n` +
      `主题：${m.title}\n` +
      `时间：${m.date} ${m.time}（${m.duration} 小时）\n` +
      `会议室：${m.room}\n` +
      `参会人：${(m.attendees || []).join("、")}`;
    addBotMsg(summary);

    resetMeetingPanel();
  }

  function renderMeetingList() {
    const wrap = $("meeting-list");
    if (!meetings.length) {
      wrap.innerHTML = '<div style="color:var(--text-dim);font-size:13px;text-align:center;padding:12px">暂无近期会议</div>';
      return;
    }
    wrap.innerHTML = meetings.slice(0, 20).map((m) =>
      `<div class="meeting-item">` +
      `<div class="mi-title">${esc(m.title)}</div>` +
      `<div class="mi-time">${esc(m.date)} ${esc(m.time)} · ${esc(m.room || "未分配会议室")}</div>` +
      `</div>`
    ).join("");
  }

  // ===== 工单渲染 =====
  function getFilteredTickets() {
    const filter = $("ticket-filter").value;
    if (filter === "open") return tickets.filter((t) => t.status !== "closed");
    if (filter === "closed") return tickets.filter((t) => t.status === "closed");
    return tickets;
  }

  function renderTickets() {
    const wrap = $("ticket-list");
    const list = getFilteredTickets();
    if (!list.length) {
      wrap.innerHTML = '<div style="color:var(--text-dim);font-size:13px;text-align:center;padding:20px">暂无工单</div>';
      return;
    }
    wrap.innerHTML = list.map((t) => {
      const statusText = STATUS_MAP[t.status] || t.status;
      return (
        `<div class="ticket-item" data-id="${esc(t.id)}">` +
        `<div class="ticket-header">` +
        `<span class="ticket-id">${esc(t.id)}</span>` +
        `<span class="ticket-status ${t.status}">${statusText}</span>` +
        `</div>` +
        `<div class="ticket-title">${esc(t.title)}</div>` +
        `<div class="ticket-meta">` +
        `<span>${esc(t.type)}</span>` +
        `<span class="ticket-priority ${esc(t.priority)}">${esc(t.priority)}</span>` +
        `<span>${esc(t.location)}</span>` +
        `<span>${esc(t.createTime)}</span>` +
        `</div>` +
        `</div>`
      );
    }).join("");
  }

  // 生成新工单 ID
  function genTicketId() {
    const year = new Date().getFullYear();
    let max = 0;
    tickets.forEach((t) => {
      const m = /WO-\d{4}-(\d+)/.exec(t.id || "");
      if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
    });
    return `WO-${year}-${pad2(max + 1)}`;
  }

  function nowStr() {
    const d = new Date();
    return `${fmtDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  // 打开 / 关闭工单表单
  function openTicketForm(data) {
    data = data || {};
    $("tf-title").value = data.title || "";
    $("tf-type").value = data.type || "维修";
    $("tf-priority").value = data.priority || "中";
    $("tf-location").value = data.location || "";
    $("tf-desc").value = data.desc || "";
    $("ticket-form-modal").style.display = "flex";
    switchOTab("ticket");
  }
  function closeTicketForm() {
    $("ticket-form-modal").style.display = "none";
  }

  function submitTicket() {
    const title = $("tf-title").value.trim();
    if (!title) { alert("请填写工单标题"); return; }
    const ticket = {
      id: genTicketId(),
      title,
      type: $("tf-type").value,
      priority: $("tf-priority").value,
      status: "open",
      location: $("tf-location").value.trim() || "未指定",
      desc: $("tf-desc").value.trim(),
      createTime: nowStr()
    };
    tickets.unshift(ticket);
    saveTickets();
    renderTickets();
    closeTicketForm();
    addBotMsg(
      `✅ 工单已创建成功！\n` +
      `工单号：${ticket.id}\n` +
      `标题：${ticket.title}\n` +
      `类型：${ticket.type} · 优先级：${ticket.priority}\n` +
      `位置：${ticket.location}\n` +
      `创建时间：${ticket.createTime}`
    );
  }

  // ===== Tab 切换 =====
  function switchOTab(name) {
    document.querySelectorAll(".office-tab").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-otab") === name);
    });
    ["meeting", "ticket"].forEach((t) => {
      const el = $("otab-" + t);
      if (!el) return;
      el.style.display = ""; // 清除内联 display，交由 active 类控制
      el.classList.toggle("active", t === name);
    });
  }

  // ===== 通用对话（本地降级） =====
  function localChatReply(text) {
    const t = (text || "").toLowerCase();
    if (/你好|您好|hi|hello|在吗/.test(t)) return "您好！我是 AI 办公助手，可以帮您安排会议或管理工单，请问有什么可以帮您？";
    if (/谢谢|感谢|thx|thanks/.test(t)) return "不客气，很高兴能帮到您！";
    if (/你是谁|介绍|你是|功能|能做什么|帮忙/.test(t)) return "我是 AI 办公助手，擅长会议安排和工单管理。\n您可以试试：\n· \"帮我安排明天下午3点的项目评审会\"\n· \"查询所有未完成的工单\"\n· \"创建工单：A栋3层空调不制冷\"";
    if (/再见|拜拜|bye|88/.test(t)) return "再见！祝您工作顺利。";
    if (/天气|几点|日期/.test(t)) return "抱歉，我主要擅长会议安排与工单管理。您可以让我帮您安排会议或处理工单。";
    return "我已收到您的消息。您可以让我帮您安排会议（如\"安排明天下午3点项目评审会\"）或管理工单（如\"创建工单：A栋空调故障\"）。";
  }

  // ===== 意图处理 =====
  async function handleMeetingIntent(text) {
    const thinking = addBotMsg("正在为您解析会议信息，请稍候...");
    let meeting = null;
    try {
      if (hasApiKey()) {
        meeting = await llmParseMeeting(text);
      }
    } catch (err) {
      // LLM 调用失败，降级到本地解析
      console.warn("[OfficeApp] 会议解析 LLM 失败，降级本地解析:", err);
    }
    if (!meeting || !meeting.title) {
      meeting = localParseMeeting(text);
    }
    // 规整字段
    meeting.attendees = Array.isArray(meeting.attendees) ? meeting.attendees.filter((s) => s) : [];
    if (!meeting.duration) meeting.duration = 1;

    renderMeetingDetail(meeting);

    const roomHint = (meeting.roomRequirement && meeting.roomRequirement !== "无特殊要求")
      ? `，设备要求：${meeting.roomRequirement}` : "";
    thinking.textContent =
      `已为您解析到以下会议信息，请在右侧面板确认：\n` +
      `📅 ${meeting.title}\n` +
      `🕐 ${meeting.date} ${meeting.time}（${meeting.duration} 小时）\n` +
      `👥 参会人：${(meeting.attendees.length ? meeting.attendees.join("、") : "暂无")}${roomHint}\n` +
      `已为您推荐可用会议室，选择后点击"确认并发送邀约"即可。`;
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  async function handleTicketCreateIntent(text) {
    const thinking = addBotMsg("正在为您解析工单信息，请稍候...");
    let data = null;
    try {
      if (hasApiKey()) {
        data = await llmParseTicket(text);
      }
    } catch (err) {
      console.warn("[OfficeApp] 工单解析 LLM 失败，降级本地解析:", err);
    }
    if (!data || !data.title) {
      data = localParseTicket(text);
    }
    openTicketForm(data);
    thinking.textContent =
      `已为您预填工单信息，请在右侧表单中确认后提交：\n` +
      `📝 标题：${data.title || ""}\n` +
      `🏷 类型：${data.type || "维修"} · 优先级：${data.priority || "中"}\n` +
      `📍 位置：${data.location || "未指定"}`;
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function handleTicketQueryIntent(text) {
    const list = getFilteredTickets();
    if (!list.length) {
      addBotMsg("当前没有符合条件的工单。");
      switchOTab("ticket");
      return;
    }
    const open = list.filter((t) => t.status !== "closed").length;
    const closed = list.filter((t) => t.status === "closed").length;
    const summary =
      `为您找到 ${list.length} 条工单（待处理/处理中 ${open} 条，已完成 ${closed} 条）：\n` +
      list.slice(0, 8).map((t) =>
        `· [${t.id}] ${t.title}（${STATUS_MAP[t.status]} · ${t.priority}）`
      ).join("\n") +
      (list.length > 8 ? `\n...还有 ${list.length - 8} 条，详见右侧工单列表。` : "");
    addBotMsg(summary);
    switchOTab("ticket");
  }

  async function handleChatIntent(text) {
    if (!hasApiKey()) {
      addBotMsg(localChatReply(text));
      return;
    }
    // 流式通用对话
    const bubble = addBotMsg("");
    let full = "";
    try {
      const systemPrompt = "你是一个智能办公助手，可以帮助安排会议和管理工单。回答简洁有条理。";
      full = await global.Shared.llm({
        messages: [{ role: "user", content: text }],
        temperature: 0.7,
        systemPrompt,
        onDelta: (_d, f) => {
          full = f;
          bubble.textContent = full;
          chatLog.scrollTop = chatLog.scrollHeight;
        }
      });
      if (!full) bubble.textContent = "（未收到回复，请重试）";
    } catch (err) {
      bubble.textContent = "调用失败：" + err.message + "\n（已切换为本地回复）\n\n" + localChatReply(text);
      bubble.style.color = "#ff6b6b";
    }
  }

  // ===== 发送主流程 =====
  async function handleSend() {
    if (sending) return;
    const input = $("office-input");
    const text = (input.value || "").trim();
    if (!text) return;
    sending = true;
    $("office-send").disabled = true;
    try {
      addUserMsg(text);
      input.value = "";
      const intent = detectIntent(text);
      switch (intent) {
        case "meeting": await handleMeetingIntent(text); break;
        case "ticket_create": await handleTicketCreateIntent(text); break;
        case "ticket_query": handleTicketQueryIntent(text); break;
        default: await handleChatIntent(text);
      }
    } catch (err) {
      console.error("[OfficeApp] 处理异常:", err);
      addBotMsg("处理您的请求时出现异常：" + (err && err.message ? err.message : "未知错误") + "\n请稍后重试。");
    } finally {
      sending = false;
      $("office-send").disabled = false;
    }
  }

  // ===== DOM 引用（在 init 中绑定） =====
  let chatLog = null;

  // ===== 初始化 =====
  function init() {
    chatLog = $("office-chat-log");
    if (!chatLog) return; // 容错：DOM 不存在则跳过

    // 加载持久化数据
    loadTickets();
    loadMeetings();

    // 渲染初始列表
    renderTickets();
    renderMeetingList();

    // 规整 Tab 初始状态（清除内联 display，交由 active 类控制）
    switchOTab("meeting");

    // 输入与发送
    const input = $("office-input");
    const sendBtn = $("office-send");
    if (sendBtn) sendBtn.addEventListener("click", handleSend);
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      });
    }

    // 清空对话
    const clearBtn = $("office-clear");
    if (clearBtn) clearBtn.addEventListener("click", () => {
      if (!confirm("确定清空所有对话？")) return;
      chatLog.innerHTML = "";
      const welcome =
        "您好！我是 AI 办公助手，可以帮您：\n" +
        "📅 安排会议：如\"帮我安排明天下午3点的项目评审会，参会人张三、李四\"\n" +
        "🎫 管理工单：如\"查询我名下所有未完成的工单\"或\"创建工单：A栋3层空调故障\"\n" +
        "请直接输入您的需求。";
      addBotMsg(welcome);
      resetMeetingPanel();
    });

    // Tab 切换
    document.querySelectorAll(".office-tab").forEach((btn) => {
      btn.addEventListener("click", () => switchOTab(btn.getAttribute("data-otab")));
    });

    // 工单筛选
    const filter = $("ticket-filter");
    if (filter) filter.addEventListener("change", renderTickets);

    // 新建工单
    const newBtn = $("btn-new-ticket");
    if (newBtn) newBtn.addEventListener("click", () => openTicketForm({}));

    // 工单表单按钮
    const cancelBtn = $("btn-cancel-ticket");
    if (cancelBtn) cancelBtn.addEventListener("click", closeTicketForm);
    const submitBtn = $("btn-submit-ticket");
    if (submitBtn) submitBtn.addEventListener("click", submitTicket);

    // 确认会议
    const confirmBtn = $("btn-confirm-meeting");
    if (confirmBtn) confirmBtn.addEventListener("click", confirmMeeting);

    // 点击弹窗遮罩关闭
    const modal = $("ticket-form-modal");
    if (modal) modal.addEventListener("click", (e) => {
      if (e.target === modal) closeTicketForm();
    });
  }

  // ===== 暴露全局对象 =====
  global.OfficeApp = {
    init,
    // 暴露部分方法便于外部调用 / 调试
    renderTickets,
    renderMeetingList,
    switchOTab,
    detectIntent
  };

  // 脚本在 body 末尾加载，DOM 已就绪，直接初始化
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
