// AI 报告助手模块 —— 模板选择、AI 生成、在线编辑、图表插入、Word/PDF 导出
(function (global) {
  "use strict";

  var Shared = global.Shared;
  var $ = Shared ? Shared.$ : function (id) { return document.getElementById(id); };

  // 模块状态
  var state = {
    template: "weekly", // weekly | monthly
    type: "energy",     // energy | device | security
    startDate: "",
    endDate: ""
  };

  // 保存编辑器光标位置(用于插入图表时恢复)
  var savedRange = null;

  // ========== 工具函数 ==========

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  // 日期格式化 YYYY-MM-DD
  function fmtDate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function todayStr() { return fmtDate(new Date()); }

  function daysAgoStr(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    return fmtDate(d);
  }

  function templateName(t) { return t === "monthly" ? "月报" : "周报"; }

  function typeName(t) {
    return ({ energy: "能耗分析", device: "设备运行", security: "安防态势" })[t] || "综合";
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function campusName() {
    return (Shared && Shared.cfg && Shared.cfg.campusName) || "智慧产业园";
  }

  // ========== 日期初始化 ==========

  function initDates() {
    var startEl = $("report-start");
    var endEl = $("report-end");
    if (startEl) {
      startEl.value = daysAgoStr(7);
      state.startDate = startEl.value;
      startEl.addEventListener("change", function () { state.startDate = startEl.value; });
    }
    if (endEl) {
      endEl.value = todayStr();
      state.endDate = endEl.value;
      endEl.addEventListener("change", function () { state.endDate = endEl.value; });
    }
  }

  // ========== 模板 / 类型选择 ==========

  function initTemplateCards() {
    var container = $("template-cards");
    if (!container) return;
    // 读取初始选中
    var active = container.querySelector(".template-card.active");
    if (active) state.template = active.dataset.template || "weekly";
    container.querySelectorAll(".template-card").forEach(function (card) {
      card.addEventListener("click", function () {
        container.querySelectorAll(".template-card").forEach(function (c) { c.classList.remove("active"); });
        card.classList.add("active");
        state.template = card.dataset.template || "weekly";
      });
    });
  }

  function initTypeCards() {
    var container = $("type-cards");
    if (!container) return;
    var active = container.querySelector(".type-card.active");
    if (active) state.type = active.dataset.type || "energy";
    container.querySelectorAll(".type-card").forEach(function (card) {
      card.addEventListener("click", function () {
        container.querySelectorAll(".type-card").forEach(function (c) { c.classList.remove("active"); });
        card.classList.add("active");
        state.type = card.dataset.type || "energy";
      });
    });
  }

  // ========== 生成步骤控制 ==========

  function resetSteps() {
    document.querySelectorAll(".gen-step").forEach(function (el) {
      el.classList.remove("active", "done");
    });
  }

  function setStep(step, status) {
    var el = document.querySelector('.gen-step[data-step="' + step + '"]');
    if (!el) return;
    el.classList.remove("active", "done");
    if (status) el.classList.add(status);
  }

  // ========== 模拟数据(供 LLM 参考与步骤展示) ==========

  function generateMockData(type) {
    var buildings = ["A栋", "B栋", "C栋", "D栋", "E栋"];
    var days = state.template === "monthly" ? 30 : 7;
    var dates = [];
    for (var i = 0; i < days; i++) dates.push(daysAgoStr(days - 1 - i));

    if (type === "energy") {
      return {
        total: randInt(8000, 15000),
        unit: "kWh",
        yoy: randInt(-8, 12),  // 同比 %
        mom: randInt(-5, 8),   // 环比 %
        buildings: buildings.map(function (b) { return { name: b, value: randInt(800, 3200) }; }),
        trend: dates.map(function (d) { return { date: d, value: randInt(1000, 2000) }; }),
        alerts: randInt(1, 5)
      };
    }
    if (type === "device") {
      var faultTypes = ["通讯中断", "温度异常", "电源故障", "感应失灵"];
      return {
        total: randInt(300, 500),
        online: randInt(280, 470),
        offline: randInt(5, 25),
        faultList: buildings.slice(0, 3).map(function (b) {
          return {
            building: b,
            name: "设备 #" + randInt(1, 8),
            type: ["暖通", "照明", "安防", "能耗"][randInt(0, 3)],
            fault: faultTypes[randInt(0, faultTypes.length - 1)],
            time: daysAgoStr(randInt(0, 6))
          };
        }),
        health: randInt(85, 98)
      };
    }
    // security
    return {
      alarms: randInt(10, 40),
      resolved: randInt(8, 35),
      pending: randInt(0, 5),
      areas: ["大门", "停车场", "A栋大堂", "B栋机房", "中心花园"],
      patrols: randInt(20, 50),
      cameras: { total: randInt(60, 100), online: randInt(55, 95) },
      access: { total: randInt(1000, 3000), denied: randInt(2, 15) }
    };
  }

  // ========== LLM 提示词 ==========

  function buildSystemPrompt(type, template) {
    var campus = campusName();
    var tmName = templateName(template);
    var base = "你是一位专业的园区运营分析师,擅长撰写结构清晰、数据详实的" + tmName +
      "。请直接输出 HTML 格式的报告正文(使用 <h2>、<h3>、<p>、<ul>、<table> 等标签)," +
      "不要输出 <!DOCTYPE>、<html>、<head>、<body> 等外层标签,不要使用 Markdown 代码块。" +
      "表格请使用:<table border=\"1\" cellpadding=\"6\" style=\"border-collapse:collapse;width:100%\">。" +
      "数据要具体合理,园区名称为「" + campus + "」。";
    var sections = {
      energy: "报告须包含以下章节:1) 能耗概览(总能耗、日均、同比环比);2) 同比环比分析;3) 各楼宇能耗排名(表格列出楼宇与能耗);4) 能耗趋势分析;5) 异常预警;6) 节能建议。",
      device: "报告须包含以下章节:1) 设备概况(总数、在线率);2) 运行状态统计(表格列出各类设备状态);3) 故障设备清单(表格列出设备、位置、故障、时间);4) 维护记录;5) 设备健康度分析;6) 维护建议。",
      security: "报告须包含以下章节:1) 安防概览;2) 告警事件统计(表格);3) 重点区域巡查情况;4) 视频监控状态;5) 门禁系统运行;6) 安全建议。"
    };
    return base + (sections[type] || sections.energy);
  }

  function buildUserMessage(type, template, startDate, endDate, mockData) {
    var campus = campusName();
    var tName = typeName(type);
    var tmName = templateName(template);
    var msg = "请为「" + campus + "」生成一份" + tName + tmName + ",报告周期为 " + startDate + " 至 " + endDate +
      "。请直接输出 HTML 格式报告正文,以 <h2> 标题开头。";
    if (mockData) {
      msg += "\n\n以下是参考数据(JSON),请据此撰写,数值可适当调整以使报告更合理:\n" + JSON.stringify(mockData);
    }
    return msg;
  }

  // 调用 LLM 生成报告
  function generateByLLM(type, template, startDate, endDate, mockData) {
    var systemPrompt = buildSystemPrompt(type, template);
    var userMsg = buildUserMessage(type, template, startDate, endDate, mockData);
    return Shared.llm({
      messages: [{ role: "user", content: userMsg }],
      temperature: 0.6,
      systemPrompt: systemPrompt
    });
  }

  // ========== 示例报告(无 API Key 时使用) ==========

  function buildSampleReport(type, template, startDate, endDate) {
    var campus = campusName();
    var tmName = templateName(template);
    var tName = typeName(type);
    var title = campus + tName + tmName;
    var meta = '<p style="color:#888;font-size:13px;margin:-4px 0 20px">报告周期:' + startDate + ' 至 ' + endDate +
      ' ｜ 生成时间:' + todayStr() + '</p>';

    if (type === "energy") {
      return '<h2>' + title + '</h2>' + meta +
        '<h3>一、能耗概览</h3>' +
        '<p>本周期园区总能耗为 <b>12,480 kWh</b>,较上一周期下降 3.2%。日均能耗 1,783 kWh,峰值出现在 8 月 8 日,达 2,050 kWh。整体能耗水平处于合理区间。</p>' +
        '<h3>二、同比环比分析</h3>' +
        '<ul>' +
        '<li>同比:较去年同期上升 5.6%(主要因新增 D 栋投产)</li>' +
        '<li>环比:较上一周期下降 3.2%,节能措施初见成效</li>' +
        '<li>单位面积能耗:1.45 kWh/㎡,优于行业平均水平</li>' +
        '</ul>' +
        '<h3>三、各楼宇能耗排名</h3>' +
        '<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%">' +
        '<tr style="background:#f0f4f8"><th>排名</th><th>楼宇</th><th>能耗(kWh)</th><th>占比</th><th>趋势</th></tr>' +
        '<tr><td>1</td><td>A 栋(研发中心)</td><td>3,420</td><td>27.4%</td><td>↑ 2.1%</td></tr>' +
        '<tr><td>2</td><td>B 栋(办公区)</td><td>2,850</td><td>22.8%</td><td>↓ 1.5%</td></tr>' +
        '<tr><td>3</td><td>C 栋(数据中心)</td><td>2,680</td><td>21.5%</td><td>↑ 0.8%</td></tr>' +
        '<tr><td>4</td><td>D 栋(生产车间)</td><td>2,130</td><td>17.1%</td><td>↓ 4.2%</td></tr>' +
        '<tr><td>5</td><td>E 栋(配套)</td><td>1,400</td><td>11.2%</td><td>→ 0.0%</td></tr>' +
        '</table>' +
        '<h3>四、能耗趋势分析</h3>' +
        '<p>本周期内工作日能耗显著高于周末,日均差距约 22%。8 月 8 日出现能耗峰值,经核查为数据中心扩容测试所致。周末基载能耗稳定在 1,200 kWh 左右。</p>' +
        '<h3>五、异常预警</h3>' +
        '<ul>' +
        '<li>⚠ A 栋 3 层能耗异常偏高,疑似空调机组未按时段休眠</li>' +
        '<li>⚠ D 栋夜间基载能耗上升 15%,建议排查照明与待机设备</li>' +
        '<li>⚠ C 栋数据中心 PUE 波动较大,冷塔效率需关注</li>' +
        '</ul>' +
        '<h3>六、节能建议</h3>' +
        '<ul>' +
        '<li>优化 A 栋空调分时段控制策略,预计可降耗 8%</li>' +
        '<li>D 栋推行夜间巡检断电制度,减少待机损耗</li>' +
        '<li>数据中心冷热通道隔离改造已立项,预计 Q4 完成</li>' +
        '<li>建议在 B 栋屋顶增设光伏,预估年发电 12 万 kWh</li>' +
        '</ul>';
    }

    if (type === "device") {
      return '<h2>' + title + '</h2>' + meta +
        '<h3>一、设备概况</h3>' +
        '<p>园区目前在册设备共 <b>386 台</b>,涵盖暖通、照明、能耗、安防、给排水五大类。本周在线率 96.9%,整体运行平稳。</p>' +
        '<h3>二、运行状态统计</h3>' +
        '<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%">' +
        '<tr style="background:#f0f4f8"><th>设备类别</th><th>总数</th><th>在线</th><th>离线</th><th>故障</th><th>在线率</th></tr>' +
        '<tr><td>暖通空调</td><td>82</td><td>79</td><td>2</td><td>1</td><td>96.3%</td></tr>' +
        '<tr><td>照明系统</td><td>120</td><td>118</td><td>2</td><td>0</td><td>98.3%</td></tr>' +
        '<tr><td>能耗计量</td><td>64</td><td>62</td><td>1</td><td>1</td><td>96.9%</td></tr>' +
        '<tr><td>安防设备</td><td>95</td><td>92</td><td>2</td><td>1</td><td>96.8%</td></tr>' +
        '<tr><td>给排水</td><td>25</td><td>24</td><td>1</td><td>0</td><td>96.0%</td></tr>' +
        '</table>' +
        '<h3>三、故障设备清单</h3>' +
        '<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%">' +
        '<tr style="background:#f0f4f8"><th>设备名称</th><th>位置</th><th>类别</th><th>故障描述</th><th>发生时间</th><th>状态</th></tr>' +
        '<tr><td>空调机组 #3</td><td>A 栋 5F</td><td>暖通</td><td>压缩机过热保护</td><td>08-09 14:20</td><td>维修中</td></tr>' +
        '<tr><td>温湿度传感器</td><td>B 栋 3F</td><td>能耗</td><td>通讯中断</td><td>08-10 09:05</td><td>已更换</td></tr>' +
        '<tr><td>门禁读卡器</td><td>D 栋 1F</td><td>安防</td><td>感应失灵</td><td>08-11 16:40</td><td>待处理</td></tr>' +
        '</table>' +
        '<h3>四、维护记录</h3>' +
        '<p>本周共完成预防性维护 18 次,故障维修 7 次,平均响应时间 1.5 小时,平均修复时间 4.2 小时。较上周维修量下降 12%。</p>' +
        '<h3>五、设备健康度分析</h3>' +
        '<p>全园区设备健康度综合评分 <b>92.4 分</b>(满分 100)。其中暖通系统健康度偏低(88 分),主要受空调机组 #3 故障影响;照明与安防系统健康度均达 95 分以上。</p>' +
        '<h3>六、维护建议</h3>' +
        '<ul>' +
        '<li>对 A 栋空调机组开展专项检修,排查压缩机老化问题</li>' +
        '<li>B 栋传感器批量更换电池,避免通讯中断复发</li>' +
        '<li>建立门禁设备月度巡检机制,提前发现感应衰减</li>' +
        '<li>建议引入设备预测性维护系统,基于振动与温度数据预警</li>' +
        '</ul>';
    }

    // security
    return '<h2>' + title + '</h2>' + meta +
      '<h3>一、安防概览</h3>' +
      '<p>本周期园区安防系统运行总体平稳,共发生告警事件 <b>23 起</b>,已处置 21 起,处置率 91.3%。未发生重大安全事故。</p>' +
      '<h3>二、告警事件统计</h3>' +
      '<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%">' +
      '<tr style="background:#f0f4f8"><th>告警类型</th><th>数量</th><th>已处理</th><th>待处理</th><th>主要区域</th></tr>' +
      '<tr><td>周界入侵</td><td>5</td><td>5</td><td>0</td><td>北侧围栏</td></tr>' +
      '<tr><td>门禁异常</td><td>8</td><td>7</td><td>1</td><td>D 栋</td></tr>' +
      '<tr><td>消防告警</td><td>2</td><td>2</td><td>0</td><td>B 栋厨房</td></tr>' +
      '<tr><td>视频异常</td><td>4</td><td>4</td><td>0</td><td>停车场</td></tr>' +
      '<tr><td>其他</td><td>4</td><td>3</td><td>1</td><td>—</td></tr>' +
      '</table>' +
      '<h3>三、重点区域巡查情况</h3>' +
      '<p>本周累计完成巡查 <b>42 次</b>,覆盖大门、停车场、各栋大堂、机房及中心花园等重点区域。巡查发现问题 6 项,均已整改闭环。</p>' +
      '<ul>' +
      '<li>大门:夜间外来人员登记规范,未发现异常</li>' +
      '<li>停车场:B2 层照明故障已修复</li>' +
      '<li>机房:温湿度正常,UPS 运行稳定</li>' +
      '</ul>' +
      '<h3>四、视频监控状态</h3>' +
      '<p>园区共部署摄像头 <b>86 路</b>,本周在线 83 路,在线率 96.5%。3 路离线设备已完成 2 路修复,1 路待配件更换。视频存储周期 30 天,符合合规要求。</p>' +
      '<h3>五、门禁系统运行</h3>' +
      '<p>本周门禁刷卡记录共 <b>2,156 次</b>,其中拒绝访问 8 次(均为非授权时段尝试)。系统运行正常,无异常闯入记录。</p>' +
      '<h3>六、安全建议</h3>' +
      '<ul>' +
      '<li>北侧围栏入侵告警频发,建议增设红外补光与智能分析摄像头</li>' +
      '<li>D 栋门禁异常待排查,建议升级读卡器固件</li>' +
      '<li>停车场监控离线路段建议加装无线中继,保障信号稳定</li>' +
      '<li>建议下月组织一次全园区消防联动演练</li>' +
      '</ul>';
  }

  // ========== 生成报告主流程 ==========

  async function generate() {
    var stepsEl = $("gen-steps");
    var editor = $("report-editor");
    var btn = $("btn-generate-report");
    if (!editor) return;

    // 读取最新日期
    var startEl = $("report-start");
    var endEl = $("report-end");
    state.startDate = startEl ? startEl.value : daysAgoStr(7);
    state.endDate = endEl ? endEl.value : todayStr();

    // 显示步骤区
    if (stepsEl) stepsEl.style.display = "";
    resetSteps();
    if (btn) { btn.disabled = true; btn.style.opacity = "0.6"; }

    try {
      // 步骤1:分析模板与参数
      setStep(1, "active");
      await sleep(300);
      setStep(1, "done");

      // 步骤2:采集数据(生成模拟数据)
      setStep(2, "active");
      await sleep(500);
      var mockData = generateMockData(state.type);
      setStep(2, "done");

      // 步骤3:AI 生成内容
      setStep(3, "active");
      var html = "";
      var useBackend = Shared && Shared.useBackend && Shared.useBackend();
      if (useBackend) {
        // 后端模式：调用 FastAPI /api/report/generate（参考 SmartBrief 报告生成模式）
        var campus = (Shared.cfg.campusName) || "智慧产业园";
        var result = await Shared.Backend.report.generate({
          template: state.template,
          type: state.type,
          startDate: state.startDate,
          endDate: state.endDate,
          campus: campus
        });
        html = result.content || buildSampleReport(state.type, state.template, state.startDate, state.endDate);
      } else {
        var hasKey = Shared && Shared.cfg && Shared.cfg.apiKey;
        if (hasKey) {
          html = await generateByLLM(state.type, state.template, state.startDate, state.endDate, mockData);
        } else {
          // 无 API Key,使用示例报告
          await sleep(600);
          html = buildSampleReport(state.type, state.template, state.startDate, state.endDate);
        }
      }
      setStep(3, "done");

      // 步骤4:渲染报告
      setStep(4, "active");
      await sleep(300);
      editor.innerHTML = html || "<p>(报告内容为空)</p>";
      setStep(4, "done");
    } catch (err) {
      // 出错时回退到示例报告
      var fallback = buildSampleReport(state.type, state.template, state.startDate, state.endDate);
      var errMsg = err && err.message ? err.message : "未知错误";
      editor.innerHTML = fallback +
        '<p style="color:#e53935;font-size:13px;margin-top:16px">⚠ AI 生成失败(' + errMsg + '),已使用示例报告替代。</p>';
      setStep(3, "done");
      setStep(4, "done");
    } finally {
      if (btn) { btn.disabled = false; btn.style.opacity = ""; }
    }
  }

  // ========== 在线编辑工具栏 ==========

  function initToolbar() {
    var editor = $("report-editor");
    if (!editor) return;

    // 阻止按钮抢焦点,保持编辑器内选区
    function keepFocus(handler) {
      return function (e) {
        e.preventDefault();
        editor.focus();
        if (typeof handler === "function") handler();
      };
    }

    var boldBtn = $("rt-bold");
    if (boldBtn) boldBtn.addEventListener("mousedown", keepFocus(function () {
      document.execCommand("bold", false, null);
    }));

    var italicBtn = $("rt-italic");
    if (italicBtn) italicBtn.addEventListener("mousedown", keepFocus(function () {
      document.execCommand("italic", false, null);
    }));

    var underlineBtn = $("rt-underline");
    if (underlineBtn) underlineBtn.addEventListener("mousedown", keepFocus(function () {
      document.execCommand("underline", false, null);
    }));

    var fontSizeSel = $("rt-fontsize");
    if (fontSizeSel) fontSizeSel.addEventListener("change", function () {
      editor.focus();
      document.execCommand("fontSize", false, fontSizeSel.value);
    });
  }

  // ========== 光标保存与恢复(用于插入图表) ==========

  function saveSelection() {
    var sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      var range = sel.getRangeAt(0);
      var editor = $("report-editor");
      if (editor && editor.contains(range.commonAncestorContainer)) {
        savedRange = range.cloneRange();
      }
    }
  }

  function restoreSelection() {
    var editor = $("report-editor");
    if (!editor) return;
    editor.focus();
    if (savedRange) {
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
  }

  function initSelectionSave() {
    var editor = $("report-editor");
    if (!editor) return;
    editor.addEventListener("mouseup", saveSelection);
    editor.addEventListener("keyup", saveSelection);
    editor.addEventListener("blur", saveSelection);
  }

  // ========== 插入图表(纯 SVG 生成) ==========

  function generateChartSVG() {
    // 随机选择柱状图或折线图
    var isLine = Math.random() > 0.5;
    var w = 480, h = 240;
    var pad = { top: 28, right: 24, bottom: 40, left: 50 };
    var count = 7;
    var data = [];
    var labels = [];
    for (var i = 0; i < count; i++) {
      data.push(randInt(40, 100));
      labels.push("D" + (i + 1));
    }
    var maxVal = Math.max.apply(null, data) * 1.15;
    var chartW = w - pad.left - pad.right;
    var chartH = h - pad.top - pad.bottom;
    var barW = (chartW / count) * 0.6;
    var step = chartW / count;

    var svg = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h +
      '" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto">';

    // 背景
    svg += '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="#fafbfc" rx="6"/>';
    // 标题
    svg += '<text x="' + (w / 2) + '" y="18" text-anchor="middle" font-size="13" font-weight="600" fill="#333">' +
      (isLine ? "趋势图(折线)" : "数据对比(柱状)") + '</text>';

    // Y 轴刻度线
    for (var yi = 0; yi <= 4; yi++) {
      var yy = pad.top + (chartH / 4) * yi;
      var yval = Math.round(maxVal - (maxVal / 4) * yi);
      svg += '<line x1="' + pad.left + '" y1="' + yy + '" x2="' + (w - pad.right) + '" y2="' + yy + '" stroke="#e8eaed" stroke-width="1"/>';
      svg += '<text x="' + (pad.left - 8) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="10" fill="#999">' + yval + '</text>';
    }

    // X 轴
    svg += '<line x1="' + pad.left + '" y1="' + (h - pad.bottom) + '" x2="' + (w - pad.right) + '" y2="' + (h - pad.bottom) + '" stroke="#ccc" stroke-width="1"/>';

    if (isLine) {
      // 折线图
      var points = "";
      var area = "";
      for (var li = 0; li < count; li++) {
        var lx = pad.left + step * li + step / 2;
        var ly = pad.top + chartH - (data[li] / maxVal) * chartH;
        points += (li === 0 ? "M" : "L") + lx + "," + ly + " ";
        area += (li === 0 ? "M" : "L") + lx + "," + ly + " ";
      }
      // 面积填充(闭合到底部)
      var lastX = pad.left + step * (count - 1) + step / 2;
      var firstX = pad.left + step / 2;
      var baseY = pad.top + chartH;
      area += "L" + lastX + "," + baseY + " L" + firstX + "," + baseY + " Z";
      svg += '<path d="' + area + '" fill="rgba(64,158,255,0.12)"/>';
      svg += '<path d="' + points + '" fill="none" stroke="#409eff" stroke-width="2" stroke-linejoin="round"/>';
      // 数据点
      for (var di = 0; di < count; di++) {
        var dx = pad.left + step * di + step / 2;
        var dy = pad.top + chartH - (data[di] / maxVal) * chartH;
        svg += '<circle cx="' + dx + '" cy="' + dy + '" r="3.5" fill="#fff" stroke="#409eff" stroke-width="2"/>';
        svg += '<text x="' + dx + '" y="' + (dy - 8) + '" text-anchor="middle" font-size="10" fill="#666">' + data[di] + '</text>';
      }
    } else {
      // 柱状图
      for (var bi = 0; bi < count; bi++) {
        var bx = pad.left + step * bi + (step - barW) / 2;
        var bh = (data[bi] / maxVal) * chartH;
        var by = pad.top + chartH - bh;
        svg += '<rect x="' + bx + '" y="' + by + '" width="' + barW + '" height="' + bh + '" fill="#409eff" rx="3"/>';
        svg += '<text x="' + (bx + barW / 2) + '" y="' + (by - 6) + '" text-anchor="middle" font-size="10" fill="#666">' + data[bi] + '</text>';
      }
    }

    // X 轴标签
    for (var xi = 0; xi < count; xi++) {
      var xt = pad.left + step * xi + step / 2;
      svg += '<text x="' + xt + '" y="' + (h - pad.bottom + 16) + '" text-anchor="middle" font-size="10" fill="#999">' + labels[xi] + '</text>';
    }

    svg += "</svg>";
    return svg;
  }

  function insertChart() {
    var editor = $("report-editor");
    if (!editor) return;
    restoreSelection();
    var svg = generateChartSVG();
    var html = '<div class="chart-block" style="text-align:center;margin:12px 0;padding:8px;background:#fff;border:1px dashed #d0d5dd;border-radius:6px">' +
      svg + '</div><p><br></p>';
    // 优先用 execCommand 在光标处插入,失败则追加到末尾
    try {
      if (!document.execCommand("insertHTML", false, html)) {
        editor.insertAdjacentHTML("beforeend", html);
      }
    } catch (e) {
      editor.insertAdjacentHTML("beforeend", html);
    }
    saveSelection();
  }

  // ========== 导出 Word ==========

  function exportWord() {
    var editor = $("report-editor");
    if (!editor || !editor.innerHTML.trim()) {
      alert("报告内容为空,请先生成报告。");
      return;
    }
    var content = editor.innerHTML;
    var campus = campusName();
    var title = campus + typeName(state.type) + templateName(state.template);
    var dateStr = todayStr().replace(/-/g, "");

    var html =
      "<!DOCTYPE html>" +
      "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>" +
      "<head><meta charset='utf-8'><title>" + title + "</title>" +
      "<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->" +
      "<style>" +
      "body{font-family:'宋体',SimSun,serif;font-size:12pt;line-height:1.6;}" +
      "h2{font-size:20pt;text-align:center;margin-bottom:6pt;}" +
      "h3{font-size:14pt;margin-top:14pt;}" +
      "table{border-collapse:collapse;width:100%;margin:8pt 0;}" +
      "td,th{border:1pt solid #000;padding:4pt 6pt;font-size:11pt;}" +
      "th{background:#e8eef5;font-weight:bold;}" +
      ".chart-block{text-align:center;margin:12pt 0;}" +
      "</style></head><body>" + content + "</body></html>";

    var blob = new Blob(["\ufeff", html], { type: "application/msword" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = typeName(state.type) + templateName(state.template) + "_" + dateStr + ".doc";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ========== 导出 PDF(新窗口打印) ==========

  function exportPDF() {
    var editor = $("report-editor");
    if (!editor || !editor.innerHTML.trim()) {
      alert("报告内容为空,请先生成报告。");
      return;
    }
    var content = editor.innerHTML;
    var campus = campusName();
    var title = campus + typeName(state.type) + templateName(state.template);

    var win = window.open("", "_blank");
    if (!win) {
      alert("请允许浏览器弹出窗口以导出 PDF。");
      return;
    }
    var doc = win.document;
    doc.open();
    doc.write(
      "<!DOCTYPE html><html><head><meta charset='utf-8'><title>" + title + "</title>" +
      "<style>" +
      "body{font-family:'Microsoft YaHei','微软雅黑',sans-serif;padding:32px;color:#222;line-height:1.7;}" +
      "h2{text-align:center;font-size:22px;margin-bottom:4px;}" +
      "h3{font-size:16px;margin-top:20px;border-left:3px solid #409eff;padding-left:8px;}" +
      "table{border-collapse:collapse;width:100%;margin:10px 0;}" +
      "td,th{border:1px solid #555;padding:6px 8px;font-size:13px;}" +
      "th{background:#f0f4f8;}" +
      ".chart-block{text-align:center;margin:16px 0;page-break-inside:avoid;}" +
      "@media print{body{padding:0;}}" +
      "</style></head><body>" + content +
      "<script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script>" +
      "</body></html>"
    );
    doc.close();
  }

  // ========== 初始化 ==========

  function init() {
    initDates();
    initTemplateCards();
    initTypeCards();
    initSelectionSave();
    initToolbar();

    var genBtn = $("btn-generate-report");
    if (genBtn) genBtn.addEventListener("click", generate);

    // 插入图表按钮:用 mousedown 阻止抢焦点,保持编辑器选区
    var chartBtn = $("btn-add-chart");
    if (chartBtn) chartBtn.addEventListener("mousedown", function (e) {
      e.preventDefault();
      insertChart();
    });

    var wordBtn = $("btn-export-word");
    if (wordBtn) wordBtn.addEventListener("click", exportWord);

    var pdfBtn = $("btn-export-pdf");
    if (pdfBtn) pdfBtn.addEventListener("click", exportPDF);
  }

  // 暴露全局对象
  var ReportApp = {
    state: state,
    init: init,
    generate: generate,
    insertChart: insertChart,
    exportWord: exportWord,
    exportPDF: exportPDF,
    buildSampleReport: buildSampleReport,
    generateChartSVG: generateChartSVG
  };
  global.ReportApp = ReportApp;

  // DOM 就绪后自动初始化
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
