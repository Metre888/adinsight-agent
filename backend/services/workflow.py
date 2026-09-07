import asyncio
import json
from pathlib import Path
import time
from uuid import uuid4
from agents.brief_parser import parse_brief
from agents.market_insight_agent import generate_market_insight
from agents.competitor_agent import analyze_competitors
from agents.campaign_agent import DIRECTIONS, generate_campaign_brief
from agents.quality_agent import check_campaign
from services.mcp_gateway import ToolGateway

ACTIVE = {"researching", "generating"}
TERMINAL = {"completed", "failed", "cancelled", "interrupted"}
STEPS = [
    ("parser", "Brief Parser", "用户 Brief", "解析目标与约束", "结构化需求与信息缺口"),
    ("market", "Market Insight", "Brief + 市场知识", "检索用户与本地化证据", "用户洞察与待验证风险"),
    ("competitor", "Competitor Analysis", "Brief + 竞品案例", "对比卖点与内容表达", "差异化假设"),
    ("review", "Review Optimization", "合成投放原始数据", "计算指标与实验样本量", "复盘诊断与测试计划"),
    ("campaign", "Campaign Brief", "研究结果 + 人工确认", "整合策略与复盘建议", "结构化 Brief"),
    ("quality", "Quality Review", "最终 Brief + 来源", "规则检查与风险提示", "质检清单与未决问题"),
]


class Workflow:
    def __init__(self, llm, directory=None):
        self.llm = llm
        self.gateway = ToolGateway()
        self.directory = Path(directory or Path(__file__).resolve().parents[1] / ".runtime" / "runs")
        self.directory.mkdir(parents=True, exist_ok=True)
        self.runs, self.tasks = {}, {}
        for path in sorted(self.directory.glob("*.json"), key=lambda p: p.stat().st_mtime)[-50:]:
            try:
                run = json.loads(path.read_text(encoding="utf-8"))
                if run["status"] in ACTIVE:
                    run["status"] = "interrupted"
                    run["error"] = "服务已重启；请从当前 Brief 创建新任务。"
                    for step in run["steps"]:
                        if step["status"] == "running":
                            step["status"] = "interrupted"
                self.runs[run["id"]] = run
            except (ValueError, KeyError):
                continue

    def commit(self, run, message=None):
        run["revision"] += 1
        run["updated_at"] = time.time()
        if message:
            run["events"].append({"time": run["updated_at"], "message": message})
        path = self.directory / f"{run['id']}.json"
        temp = path.with_suffix(".tmp")
        temp.write_text(json.dumps(run, ensure_ascii=False, allow_nan=False), encoding="utf-8")
        temp.replace(path)

    def get(self, run_id):
        if run_id not in self.runs:
            raise KeyError("任务不存在")
        return self.runs[run_id]

    def capacity(self):
        if sum(r["status"] in ACTIVE for r in self.runs.values()) >= 3:
            raise ValueError("最多同时运行 3 个任务，请稍后再试")

    def create(self, brief):
        self.capacity()
        if len(self.runs) >= 50:
            raise ValueError("已达到本地 50 个任务上限，请先删除不再需要的历史任务")
        run = {
            "id": str(uuid4()), "status": "researching", "revision": 0, "created_at": time.time(),
            "brief": brief, "sources": [], "research": {}, "review": None, "experiment": None,
            "campaign_brief": None, "quality": None, "approval": None, "directions": DIRECTIONS,
            "tool_calls": [], "events": [], "is_mock_data": True, "configured_mode": self.llm.mode,
            "steps": [{"id": key, "name": name, "input": inp, "task": task, "output": out, "status": "pending"}
                      for key, name, inp, task, out in STEPS],
        }
        self.runs[run["id"]] = run
        self.commit(run, "任务已创建，开始解析 Brief")
        self.tasks[run["id"]] = asyncio.create_task(self.guard(run, self.research))
        return run

    async def guard(self, run, work):
        try:
            await work(run)
        except asyncio.CancelledError:
            for step in run["steps"]:
                if step["status"] == "running":
                    step["status"] = "cancelled"
            run["status"] = "cancelled"
            self.commit(run, "任务已取消")
            raise
        except Exception as exc:
            for step in run["steps"]:
                if step["status"] == "running":
                    step["status"] = "failed"
            run["status"] = "failed"
            run["error"] = f"工作流执行失败（{type(exc).__name__}）。检查执行记录后可重新创建任务。"
            self.commit(run, "执行中断，已保留阶段结果")

    async def step(self, run, key, work):
        step = next(s for s in run["steps"] if s["id"] == key)
        step.update(status="running", started_at=time.time())
        self.commit(run, step["name"] + " 开始")
        result, meta = await work()
        step.update(status="completed", ended_at=time.time(), meta=meta)
        step["duration_ms"] = round((step["ended_at"] - step["started_at"]) * 1000)
        self.commit(run, step["name"] + " 完成")
        return result

    def trace(self, run, entry):
        found = next((i for i, old in enumerate(run["tool_calls"]) if old["id"] == entry["id"]), None)
        if found is None:
            run["tool_calls"].append(entry)
        else:
            run["tool_calls"][found] = entry
        self.commit(run)

    async def search(self, run, agent, collection):
        async def work(call, definitions):
            b = run["brief"]
            result = await call("search_knowledge", {"product_type": b["product_type"],
                "region": b["target_region"], "query": b.get("current_challenges", ""), "collection": collection})
            for source in result["sources"]:
                if not any(s["id"] == source["id"] for s in run["sources"]):
                    run["sources"].append(source)
            self.commit(run)
            return result["sources"]
        return await self.gateway.session("knowledge", agent, lambda e: self.trace(run, e), work)

    async def research(self, run):
        async def parser():
            return parse_brief(run["brief"]), {"mode": "rules"}
        run["parse"] = await self.step(run, "parser", parser)

        async def market():
            sources = await self.search(run, "market", "market_knowledge")
            result, meta = await generate_market_insight(run["brief"], sources, self.llm)
            run["research"]["market"] = result
            return result, meta

        async def competitor():
            sources = await self.search(run, "competitor", "competitor_case")
            result, meta = await analyze_competitors(run["brief"], sources, self.llm)
            run["research"]["competitor"] = result
            return result, meta

        async def review():
            review_sources = await self.search(run, "review", "review_case")
            async def tools(call, definitions):
                sample = await call("sample_performance", {"scenario": run["brief"]["scenario"]})
                run["review"] = await call("calculate_metrics", {"metrics": sample["metrics"]})
                run["review"]["historical_context"] = [
                    {"source_id": source["id"], "summary": source["summary"]} for source in review_sources]
                run["experiment"] = await call("plan_experiment", {"baseline_cvr": (run["review"]["values"]["CVR"] or 0) / 100})
                return run["review"]
            result = await self.gateway.session("measurement", "review", lambda e: self.trace(run, e), tools)
            return result, {"mode": "rules"}

        # Siblings share evidence and metrics, not model conversation history.
        async with asyncio.TaskGroup() as group:
            group.create_task(self.step(run, "market", market))
            group.create_task(self.step(run, "competitor", competitor))
            group.create_task(self.step(run, "review", review))
        run["status"] = "awaiting_approval"
        self.commit(run, "研究与复盘完成，等待人工确认创意方向")

    def approve(self, run_id, approval):
        run = self.get(run_id)
        if run["status"] != "awaiting_approval":
            raise ValueError("该任务当前不能确认，请刷新任务状态")
        self.capacity()
        run["approval"] = {**approval, "confirmed_at": time.time()}
        run["status"] = "generating"
        self.commit(run, "人工已确认方向，开始生成 Brief")
        self.tasks[run_id] = asyncio.create_task(self.guard(run, self.generate))
        return run

    async def generate(self, run):
        async def campaign():
            await self.search(run, "campaign", "campaign_case")
            return await generate_campaign_brief(run, self.llm)
        run["campaign_brief"] = await self.step(run, "campaign", campaign)
        async def quality():
            return check_campaign(run), {"mode": "rules"}
        run["quality"] = await self.step(run, "quality", quality)
        run["status"] = "completed"
        self.commit(run, "Brief 已生成，保留待人工核验事项；未执行投放")

    async def cancel(self, run_id):
        run = self.get(run_id)
        if run["status"] in TERMINAL:
            return run
        task = self.tasks.get(run_id)
        if task and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        run["status"] = "cancelled"
        self.commit(run, "任务已取消")
        return run

    async def close(self):
        tasks = [t for t in self.tasks.values() if not t.done()]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await self.llm.close()

    def delete(self, run_id):
        run = self.get(run_id)
        if run["status"] not in TERMINAL:
            raise ValueError("请先取消任务，再删除")
        del self.runs[run_id]
        self.tasks.pop(run_id, None)
        (self.directory / f"{run_id}.json").unlink(missing_ok=True)


def export_markdown(run):
    if run["status"] != "completed":
        raise ValueError("Brief 尚未完成")
    c = run["campaign_brief"]
    labels = {"project_background": "项目背景", "marketing_goal": "营销目标", "target_users": "目标用户",
              "core_insight": "核心洞察", "selling_points": "主推卖点", "creative_direction": "创意方向",
              "channel_suggestions": "渠道建议", "ab_test_plan": "A/B 测试", "limitations": "边界与限制"}
    lines = [f"# {run['brief']['product_name']} · Campaign Brief", "",
             "> 个人项目 · 合成业务数据 · 讨论稿 · 不代表任何公司项目", ""]
    for key, label in labels.items():
        value = c[key]
        lines.extend([f"## {label}", "\n".join("- " + item for item in value) if isinstance(value, list) else value, ""])
    lines.extend(["## 核心指标（演示目标，非行业基准）", "CTR >= 1.5% · CVR >= 8% · CPA <= $15 · ROAS >= 1.5 · 素材采纳率 >= 50%", "",
                  "## 人工确认", f"方向：{run['approval']['direction_id']}", f"补充：{run['approval']['feedback'] or '无'}", "",
                  "## 证据来源"])
    for source in run["sources"]:
        lines.append(f"- [{source['id']}] {source['title']}（合成案例）：{source['summary']}")
    lines.extend(["", "## 待核验事项", *["- " + q for q in run["quality"]["open_questions"]]])
    lines.extend(["", "## 生成记录", *[f"- {s['name']}: {s.get('meta', {}).get('mode', 'rules')}" for s in run["steps"]]])
    return "\n".join(lines)
