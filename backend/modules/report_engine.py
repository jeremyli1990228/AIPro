"""报告生成引擎 —— 参考 SmartBrief (MIT) 的报告生成模式适配。

SmartBrief 原版模式：
    getGitLogs(projectPath, startDate, endDate) → AI 分析 → 生成报告
本模块适配为：
    accept_data(template, type, startDate, endDate, payload) → AI 分析 → 生成 HTML 报告

源项目：https://github.com/ch4nhm/SmartBrief  (MIT License, Copyright (c) 2024 jx&chm)
"""
from __future__ import annotations

import os
import random
from typing import Any

import httpx

# ===== 模板与类型映射（与前端 report.js 对齐） =====
TEMPLATE_NAMES = {"weekly": "周报", "monthly": "月报"}
TYPE_NAMES = {"energy": "能耗分析", "device": "设备运行", "security": "安防态势"}


def template_name(t: str) -> str:
    return TEMPLATE_NAMES.get(t, "综合")


def type_name(t: str) -> str:
    return TYPE_NAMES.get(t, "综合")


def rand_int(min_v: int, max_v: int) -> int:
    return random.randint(min_v, max_v)


# ===== 模拟数据生成（演示用，对应前端 generateMockData） =====
def generate_mock_data(template: str, report_type: str, start_date: str, end_date: str, campus: str = "智慧产业园") -> dict:
    data: dict[str, Any] = {
        "campusName": campus,
        "template": template,
        "type": report_type,
        "startDate": start_date,
        "endDate": end_date,
        "dateRange": f"{start_date} 至 {end_date}",
    }

    if report_type == "energy":
        data["total"] = rand_int(1200, 1800)
        data["compare"] = rand_int(-10, 10)
        data["byBuilding"] = [
            {"name": "A栋", "value": rand_int(300, 500)},
            {"name": "B栋", "value": rand_int(200, 400)},
            {"name": "C栋", "value": rand_int(150, 300)},
            {"name": "D栋", "value": rand_int(100, 200)},
        ]
        base = data["total"] * 0.9
        data["trend"] = [
            {"date": f"{i+1}日", "value": round(base + random.random() * base * 0.2)}
            for i in range(7)
        ]
    elif report_type == "device":
        data["total"] = rand_int(200, 300)
        data["normal"] = data["total"] - rand_int(5, 15)
        data["warning"] = rand_int(3, 8)
        data["error"] = data["total"] - data["normal"] - data["warning"]
        data["faultyDevices"] = [
            {"building": "A栋", "name": f"空调机组 #{rand_int(1, 5)}", "type": "暖通",
             "time": f"2026-08-{rand_int(10, 12)} {rand_int(8, 17)}:00"},
            {"building": "B栋", "name": f"照明系统 #{rand_int(1, 3)}", "type": "电气",
             "time": f"2026-08-{rand_int(10, 12)} {rand_int(8, 17)}:00"},
            {"building": "C栋", "name": f"电梯 #{rand_int(1, 2)}", "type": "电梯",
             "time": f"2026-08-{rand_int(10, 12)} {rand_int(8, 17)}:00"},
        ]
    elif report_type == "security":
        data["totalEvents"] = rand_int(50, 100)
        data["alarm"] = rand_int(5, 15)
        data["warning"] = rand_int(15, 30)
        data["normal"] = data["totalEvents"] - data["alarm"] - data["warning"]
        data["keyAreas"] = ["A栋大厅", "B栋机房", "C栋停车场", "D栋仓库"]
        data["keyEvents"] = [
            {"time": f"2026-08-{rand_int(10, 12)} 0{rand_int(1, 9)}:30",
             "area": data["keyAreas"][rand_int(0, 3)], "type": "异常人员", "desc": "非授权人员试图进入"},
            {"time": f"2026-08-{rand_int(10, 12)} 1{rand_int(0, 7)}:45",
             "area": data["keyAreas"][rand_int(0, 3)], "type": "设备异常", "desc": "监控摄像头离线"},
        ]
    return data


# ===== System Prompt 构造（参考 SmartBrief 的 prompt 工程） =====
def build_system_prompt(report_type: str, template: str) -> str:
    sections = ""
    if report_type == "energy":
        sections = """
1. 能耗概览：总能耗、同比环比分析
2. 各楼宇能耗排名：表格形式展示
3. 能耗趋势图：近7天能耗变化
4. 异常预警：能耗异常的楼宇或时间段
5. 节能建议：基于数据给出具体建议
"""
    elif report_type == "device":
        sections = """
1. 设备概况：总数、正常率、故障率
2. 运行状态统计：正常/警告/故障数量及占比
3. 故障设备清单：表格形式展示（楼宇、名称、类型、故障时间）
4. 维护记录：近期维护情况
5. 设备健康度分析：整体设备健康状况评估
6. 维护建议：基于故障情况给出维护计划
"""
    elif report_type == "security":
        sections = """
1. 安防概览：事件总数、告警级别分布
2. 告警事件统计：表格形式展示关键告警事件
3. 重点区域巡查情况：各重点区域安全状况
4. 视频监控状态：在线率、异常情况
5. 门禁系统运行：出入记录统计、异常访问
6. 安全建议：提升安防的具体措施
"""

    return f"""你是一位专业的{type_name(report_type)}报告生成专家。请根据提供的{template_name(template)}数据，生成一份结构清晰、内容详实的{type_name(report_type)}{template_name(template)}。

报告格式要求：
- 使用 HTML 格式，包含标题、章节、段落、表格
- 标题使用 <h1>，章节标题使用 <h2>，子标题使用 <h3>
- 表格使用 <table> 标签，包含表头和数据行
- 数据使用提供的模拟数据，不要编造额外数据
- 分析部分要基于数据，给出合理的解释和建议

报告结构必须包含以下章节：{sections}

请确保报告内容专业、客观，语言简洁明了。只返回 HTML 内容，不要包裹在 markdown 代码块中。"""


def build_user_prompt(data: dict) -> str:
    return f"""生成报告所需数据：
园区名称：{data.get('campusName', '智慧产业园')}
报告类型：{type_name(data['type'])}{template_name(data['template'])}
时间范围：{data.get('dateRange', '')}

数据：{data}"""


# ===== LLM 调用（OpenAI 兼容接口） =====
async def call_llm(messages: list[dict], temperature: float = 0.5) -> str:
    base_url = os.getenv("LLM_BASE_URL", "https://api.deepseek.com/v1").rstrip("/")
    api_key = os.getenv("LLM_API_KEY", "")
    model = os.getenv("LLM_MODEL", "deepseek-chat")

    if not api_key:
        raise RuntimeError("后端未配置 LLM_API_KEY")

    url = f"{base_url}/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "stream": False,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


# ===== 兜底示例报告（无 API Key 或调用失败时使用） =====
def build_sample_report(data: dict) -> str:
    t = data["type"]
    if t == "energy":
        building_rows = "".join(
            f"<tr><td>{b['name']}</td><td>{b['value']}</td>"
            f"<td>{round(b['value'] / data['total'] * 100)}%</td></tr>"
            for b in data["byBuilding"]
        )
        trend_points = " ".join(
            f"{50 + i * 70},{250 - d['value'] / 2000 * 200}"
            for i, d in enumerate(data["trend"])
        )
        trend_dots = "".join(
            f'<circle cx="{50 + i * 70}" cy="{250 - d["value"] / 2000 * 200}" r="5" fill="#6c8cff"/>'
            f'<text x="{50 + i * 70}" y="{250 - d["value"] / 2000 * 200 - 10}" '
            f'text-anchor="middle" fill="#e8eaf6" font-size="12">{d["value"]}</text>'
            for i, d in enumerate(data["trend"])
        )
        return f"""<h1>{data['campusName']}能耗分析{template_name(data['template'])}</h1>
<p><strong>时间范围：</strong>{data['dateRange']}</p>
<h2>1. 能耗概览</h2>
<p>本期总能耗为 <strong>{data['total']} kWh</strong>，与上期相比{'上升' if data['compare'] >= 0 else '下降'}{abs(data['compare'])}%。</p>
<h2>2. 各楼宇能耗排名</h2>
<table><tr><th>楼宇</th><th>能耗(kWh)</th><th>占比</th></tr>{building_rows}</table>
<h2>3. 能耗趋势图</h2>
<div class="chart-block"><svg width="600" height="300" viewBox="0 0 600 300">
<line x1="50" y1="250" x2="550" y2="250" stroke="#8a8fb5" stroke-width="1"/>
<line x1="50" y1="250" x2="50" y2="50" stroke="#8a8fb5" stroke-width="1"/>
<polyline points="{trend_points}" fill="none" stroke="#6c8cff" stroke-width="3"/>
{trend_dots}
</svg></div>
<h2>4. 异常预警</h2>
<p>{data['byBuilding'][0]['name']}能耗较高，建议检查设备运行情况。</p>
<h2>5. 节能建议</h2>
<ol><li>优化空调温度设置</li><li>加强照明系统管理</li><li>定期维护设备</li></ol>"""
    if t == "device":
        faulty_rows = "".join(
            f"<tr><td>{d['building']}</td><td>{d['name']}</td><td>{d['type']}</td><td>{d['time']}</td></tr>"
            for d in data["faultyDevices"]
        )
        return f"""<h1>{data['campusName']}设备运行{template_name(data['template'])}</h1>
<p><strong>时间范围：</strong>{data['dateRange']}</p>
<h2>1. 设备概况</h2>
<p>园区设备总数：<strong>{data['total']}台</strong>，正常率：<strong>{round(data['normal']/data['total']*100)}%</strong>，故障率：<strong>{round(data['error']/data['total']*100)}%</strong>。</p>
<h2>2. 运行状态统计</h2>
<table><tr><th>状态</th><th>数量</th><th>占比</th></tr>
<tr><td>正常</td><td>{data['normal']}</td><td>{round(data['normal']/data['total']*100)}%</td></tr>
<tr><td>警告</td><td>{data['warning']}</td><td>{round(data['warning']/data['total']*100)}%</td></tr>
<tr><td>故障</td><td>{data['error']}</td><td>{round(data['error']/data['total']*100)}%</td></tr>
</table>
<h2>3. 故障设备清单</h2>
<table><tr><th>楼宇</th><th>设备名称</th><th>类型</th><th>故障时间</th></tr>{faulty_rows}</table>
<h2>4. 维护建议</h2>
<ol><li>优先处理{data['faultyDevices'][0]['building']}的{data['faultyDevices'][0]['name']}故障</li><li>对警告状态设备进行预防性维护</li><li>制定设备定期维护计划</li></ol>"""
    if t == "security":
        area_rows = "".join(
            f"<tr><td>{a}</td><td>正常</td><td>{rand_int(5, 10)}</td></tr>"
            for a in data["keyAreas"]
        )
        event_rows = "".join(
            f"<tr><td>{e['time']}</td><td>{e['area']}</td><td>{e['type']}</td><td>{e['desc']}</td></tr>"
            for e in data["keyEvents"]
        )
        return f"""<h1>{data['campusName']}安防态势{template_name(data['template'])}</h1>
<p><strong>时间范围：</strong>{data['dateRange']}</p>
<h2>1. 安防概览</h2>
<p>本期安防事件总数：<strong>{data['totalEvents']}起</strong>，其中告警{data['alarm']}起，警告{data['warning']}起，正常{data['normal']}起。</p>
<h2>2. 重点区域巡查情况</h2>
<table><tr><th>区域</th><th>状态</th><th>巡查次数</th></tr>{area_rows}</table>
<h2>3. 关键告警事件</h2>
<table><tr><th>时间</th><th>区域</th><th>事件类型</th><th>描述</th></tr>{event_rows}</table>
<h2>4. 安全建议</h2>
<ol><li>加强{data['keyEvents'][0]['area']}的安保措施</li><li>检查异常设备</li><li>对安保人员进行专项培训</li></ol>"""
    return "<h1>示例报告</h1><p>请选择报告类型和模板。</p>"


# ===== 主入口：生成报告 =====
async def generate_report(
    template: str,
    report_type: str,
    start_date: str,
    end_date: str,
    campus: str = "智慧产业园",
) -> dict:
    """生成报告，返回 {'content': html, 'data': mock_data, 'source': 'ai'|'sample'}"""
    data = generate_mock_data(template, report_type, start_date, end_date, campus)

    api_key = os.getenv("LLM_API_KEY", "")
    if not api_key:
        return {"content": build_sample_report(data), "data": data, "source": "sample"}

    try:
        messages = [
            {"role": "system", "content": build_system_prompt(report_type, template)},
            {"role": "user", "content": build_user_prompt(data)},
        ]
        content = await call_llm(messages, temperature=0.5)
        # 去除可能存在的 markdown 包裹
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
        return {"content": content, "data": data, "source": "ai"}
    except Exception as e:
        return {
            "content": build_sample_report(data),
            "data": data,
            "source": "sample",
            "error": str(e),
        }
