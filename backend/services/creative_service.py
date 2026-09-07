import asyncio
import copy
import hashlib
from io import BytesIO
import json
from pathlib import Path
import time
from uuid import uuid4
from zipfile import ZipFile, ZIP_DEFLATED

from creative_models import CreativePlan
from services.mcp_gateway import ToolGateway
from services.image_providers import generate_image, validate_image, configured, MODELS, generation_prompt

ROOT = Path(__file__).resolve().parents[1]


def fallback_plan(order, material, brief=None, feedback=""):
    chinese = order["language"] == "简体中文"
    headline = "从日常，发现新可能" if chinese else "Make space for something new."
    body = "探索适合你的下一步体验。" if chinese else "Discover your next everyday experience."
    cta = "了解更多" if chinese else "Explore now"
    if material and not chinese:
        headline, body, cta = (material[k] for k in ("headline", "body", "cta"))
    visual = material["reuse"] if material else "以产品名称为视觉核心，使用清晰的留白、单一焦点和醒目但克制的 CTA。"
    insight = (brief or {}).get("core_insight", "")
    constraints = "不虚构功能、折扣、评价或效果保证；合成参考视觉不等于实际产品截图；发布前核对素材权利与当地文案。" + order["constraints"]
    if feedback:
        visual += " 本轮修订重点：" + feedback[:800]
        body = "先了解产品与使用条件，再选择适合你的体验。" if chinese else "Review the experience and available options before you start."
        cta = "查看体验详情" if chinese else "See the details"
    prompt = (f'Revision feedback: {feedback}. ' + f'Create a polished {order["aspect_ratio"]} image ad for {order["product_name"]} ({order["product_type"]}). '
              f'Market: {order["target_region"]}. Audience: {order["target_users"]}. Goal: {order["marketing_goal"]}. '
              f'Channel: {order["platform"]}. Copy language: {order["language"]}. '
              f'Visual direction: {visual}. Approved campaign insight: {insight}. '
              "Keep clear typographic hierarchy, legible copy, generous safe margins and one CTA. "
              "Use only the supplied claims and details. Treat any reference as a synthetic concept, not a real product screenshot.")
    return {"headline": headline, "body": body, "cta": cta, "visual_direction": visual,
            "prompt": prompt[:8000], "constraints": constraints,
            "storyboard": [
                {"timing": "0–3s", "visual": "单一使用场景开场；实际制作时换成真实产品画面。", "voiceover": headline},
                {"timing": "3–10s", "visual": visual[:600], "voiceover": body},
                {"timing": "10–15s", "visual": "品牌与行动入口定格，保留安全区。", "voiceover": cta}]}


class CreativeService:
    def __init__(self, llm, workflow, directory=None):
        self.llm, self.workflow = llm, workflow
        self.gateway = ToolGateway()
        self.directory = Path(directory or ROOT / ".runtime" / "creative")
        self.directory.mkdir(parents=True, exist_ok=True)
        self.plans, self.jobs, self.tasks = {}, {}, {}
        self.planning = 0
        for path in sorted(self.directory.glob("*.json"))[:200]:
            try:
                data = json.loads(path.read_text())
                if path.stem != data["id"]:
                    continue
                if data["kind"] == "plan":
                    self.plans[data["id"]] = data
                elif data["kind"] == "job":
                    if data["status"] == "running":
                        data.update(status="interrupted", error="服务重启；未自动重试外部生成，费用状态需在服务商处核对。")
                        self.save(data)
                    self.jobs[data["id"]] = data
            except (KeyError, ValueError, OSError):
                continue

    def save(self, obj):
        path = self.directory / (obj["id"] + ".json")
        temp = path.with_suffix(".tmp")
        temp.write_text(json.dumps(obj, ensure_ascii=False, indent=2))
        temp.replace(path)

    def get_plan(self, ident):
        if ident not in self.plans:
            raise KeyError("创意方案不存在")
        return self.plans[ident]

    def get_job(self, ident):
        if ident not in self.jobs:
            raise KeyError("广告版本不存在")
        return self.jobs[ident]

    async def plan(self, order, parent=None, feedback=""):
        if self.planning >= 3 or len(self.plans) >= 100:
            raise ValueError("创意规划达到本地上限（3 个并发 / 100 份方案）")
        self.planning += 1
        try:
            return await self._plan(order, parent, feedback)
        finally:
            self.planning -= 1

    async def _plan(self, order, parent, feedback):
        context, material, trace = None, None, []
        if parent:
            prior = self.get_plan(parent["plan_id"])
            context = copy.deepcopy(prior.get("brief_context"))
        elif order["source_run_id"]:
            run = self.workflow.get(str(order["source_run_id"]))
            if run["status"] != "completed":
                raise ValueError("请先确认研究方向并完成 Campaign Brief")
            if any(order[k] != run["brief"][k] for k in ("product_name", "product_type", "target_region", "target_users", "marketing_goal")):
                raise ValueError("关联 Brief 的产品、市场、人群和目标不可悄悄改写；请取消关联后新建需求")
            context = copy.deepcopy(run["campaign_brief"])
        if order["route"] == "library":
            if not order["material_id"]:
                raise ValueError("请先选择一份历史素材")
            async def retrieve(call, definitions):
                matches = await call("search_creatives", {"product_type": order["product_type"], "region": order["target_region"]})
                if order["material_id"] not in {m["id"] for m in matches["items"]}:
                    raise ValueError("所选素材与产品或地区不匹配，请重新检索")
                return await call("get_creative", {"material_id": order["material_id"]})
            def record(entry):
                existing = next((e for e in trace if e["id"] == entry["id"]), None)
                if existing is not None:
                    existing.update(entry)
                else:
                    trace.append(entry)
            material = await self.gateway.session("creative", "creative", record, retrieve)
        elif order["material_id"]:
            raise ValueError("提示词创作路径不应携带历史素材")
        fallback = fallback_plan(order, material, context, feedback)
        if parent:
            fallback["headline"] = parent["content"]["headline"]
            fallback["constraints"] = parent["content"]["constraints"]
            fallback["storyboard"][0]["voiceover"] = parent["content"]["headline"]
        content, mode = await self.llm.generate("Creative Planner Agent",
            {"order": order, "approved_brief": context, "reference": material, "revision_feedback": feedback,
             "previous_approved_ad": parent["content"] if parent else None,
             "task": "生成单张图片广告方案与15秒视频分镜（不是视频文件）；遵守语言、地区、卖点约束。广告文案不得添加未经验证的事实。"},
            CreativePlan, fallback)
        now = time.time()
        item = {"id": str(uuid4()), "kind": "plan", "created_at": now, "order": copy.deepcopy(order),
                "content": content, "material": material, "brief_context": context,
                "mode": mode, "tool_calls": trace, "source_run_id": order["source_run_id"],
                "parent_job_id": parent["id"] if parent else None,
                "version": parent["version"] + 1 if parent else 1, "revision_feedback": feedback,
                "review_context": copy.deepcopy(parent.get("review")) if parent else None,
                "agents": ["Creative Retrieval Agent", "Creative Planner Agent", "Human Review", "Model Adapter", "Delivery QA", "Review Optimization Agent"]}
        self.plans[item["id"]] = item
        self.save(item)
        return item

    def create_job(self, plan_id, payload):
        plan = self.get_plan(plan_id)
        request_key = str(payload["request_id"])
        digest = hashlib.sha256(json.dumps({"plan": plan_id, **payload}, sort_keys=True).encode()).hexdigest()
        for job in self.jobs.values():
            if job["request_id"] == request_key:
                if job["request_digest"] != digest:
                    raise ValueError("同一请求标识不能用于不同广告，请创建新的生成请求")
                return job
        if len(self.jobs) >= 100 or sum(j["status"] == "running" for j in self.jobs.values()) >= 2:
            raise ValueError("生成任务达到本地上限（2 个并发 / 100 个版本）")
        if payload["provider"] != "mock":
            if not payload["external_consent"]:
                raise ValueError("外部生成需明确同意发送需求、文案和参考图片，并承担服务商费用")
            if not configured(payload["provider"]):
                raise ValueError("所选模型尚未配置密钥；可选择本地排版预览，或由管理员配置")
        obj = {"id": str(uuid4()), "kind": "job", "plan_id": plan_id, "version": plan["version"],
               "created_at": time.time(), "request_id": request_key, "request_digest": digest,
               "order": copy.deepcopy(plan["order"]), "content": copy.deepcopy(payload["content"]),
               "material": copy.deepcopy(plan["material"]), "source_run_id": plan["source_run_id"],
               "parent_job_id": plan["parent_job_id"], "review_context": copy.deepcopy(plan["review_context"]),
               "provider": payload["provider"], "model": MODELS[payload["provider"]],
               "is_mock": payload["provider"] == "mock", "status": "running",
               "content_approved_at": time.time(), "external_consent": payload["external_consent"],
               "approval": None, "review": None, "error": None}
        self.jobs[obj["id"]] = obj
        self.save(obj)
        self.tasks[obj["id"]] = asyncio.create_task(self._generate(obj))
        return obj

    async def _generate(self, job):
        try:
            raw = await generate_image(job["provider"], job["order"], job["content"], job["material"])
            raw, dimensions = await asyncio.to_thread(validate_image, raw)
            expected = job["order"]["aspect_ratio"].split(":")
            if abs(dimensions[0]/dimensions[1] - int(expected[0])/int(expected[1])) > .025:
                raise ValueError("模型输出比例不符，未作为有效交付")
            (self.directory / (job["id"] + ".png")).write_bytes(raw)
            job.update(status="succeeded", dimensions=dimensions, image_url=f'/api/creative/jobs/{job["id"]}/image',
                       qa=["图片可解码", "尺寸与比例通过", "文案、功能真实性与品牌权利仍需人工确认"])
        except asyncio.CancelledError:
            job.update(status="interrupted", error="服务停止；未自动重试。外部服务可能已产生费用。")
            raise
        except Exception as exc:
            # Do not leak provider responses, request headers, or secrets to the browser.
            job.update(status="failed", error="生成未成功，请核对模型权限、额度、网络或内容要求。未自动扣费重试，也未伪装为 Mock 成功。",
                       error_type=type(exc).__name__)
        finally:
            job["finished_at"] = time.time()
            self.save(job)

    def approve(self, ident):
        job = self.get_job(ident)
        if job["status"] != "succeeded":
            raise ValueError("只有成功生成的广告可确认交付")
        if not job["approval"]:
            job["approval"] = {"acknowledged": True, "at": time.time(), "scope": "demo_customer_review_not_published"}
            self.save(job)
        return job

    async def review(self, ident, payload):
        job = self.get_job(ident)
        if not job["approval"]:
            raise ValueError("请先人工确认广告交付版本，再录入模拟投放数据")
        if job["review"]:
            raise ValueError("该版本已有复盘；请保留原始口径，在下一版本继续迭代")
        # Reserve the review while MCP executes so concurrent submissions cannot overwrite it.
        job["review"] = {"status": "running"}
        try:
            traces = []
            async def work(call, definitions):
                calculated = await call("calculate_metrics", {"metrics": payload["metrics"]})
                v = calculated["values"]["CVR"]
                experiment = await call("plan_experiment", {"baseline_cvr": v / 100 if v else 0})
                return {**calculated, "experiment": experiment}
            def record(entry):
                old = next((e for e in traces if e["id"] == entry["id"]), None)
                if old is not None:
                    old.update(entry)
                else:
                    traces.append(entry)
            result = await self.gateway.session("measurement", "review", record, work)
            job["review"] = {**result, "status": "completed", "notes": payload["notes"],
                             "tool_calls": traces, "created_at": time.time(), "data_mode": "mock"}
            self.save(job)
            return job
        except BaseException:
            job["review"] = None
            raise

    async def iterate(self, ident, feedback):
        job = self.get_job(ident)
        if not job.get("review") or job["review"].get("status") != "completed":
            raise ValueError("该交付版本尚未完成复盘")
        context = "\n".join(job["review"]["optimization_suggestions"]) + "\n版本客户反馈：" + job["review"]["notes"] + "\n客户修改意见：" + feedback
        return await self.plan(copy.deepcopy(job["order"]), job, context)

    def bundle(self, ident):
        job = self.get_job(ident)
        if job["status"] != "succeeded":
            raise ValueError("生成成功后才可下载交付包")
        package = BytesIO()
        doc = {key: job[key] for key in ("id", "version", "created_at", "order", "content", "material",
            "source_run_id", "parent_job_id", "provider", "model", "is_mock", "approval", "review")}
        if doc["review"]:
            doc["review"] = {k: v for k, v in doc["review"].items() if k != "tool_calls"}
        with ZipFile(package, "w", ZIP_DEFLATED) as archive:
            archive.write(self.directory / (ident + ".png"), "advertisement.png")
            archive.writestr("creative-brief.json", json.dumps(doc, ensure_ascii=False, indent=2))
            archive.writestr("generation-prompt.txt", generation_prompt(job["order"], job["content"], job["material"]))
            archive.writestr("storyboard.json", json.dumps(job["content"]["storyboard"], ensure_ascii=False, indent=2))
            archive.writestr("DELIVERY-NOTES.txt", "AdInsight Agent / 个人 Demo\n本包包含图片、提示词、15秒视频分镜与来源记录；不包含视频成片。\n"
                + ("图片为本地排版预览，不是图像模型生成结果。\n" if job["is_mock"] else "图片由所选外部模型生成，仍需人工检查。\n")
                + ("已确认演示交付。\n" if job["approval"] else "待人工确认，不得当作已审核素材。\n")
                + "所有素材库案例与投放数据为合成数据。无真实投放，无效果承诺。发布前核查品牌、版权、事实与当地要求。\n")
        return package.getvalue()

    async def close(self):
        pending = [t for t in self.tasks.values() if not t.done()]
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
