from models import Campaign

DIRECTIONS = [
    {"id": "proof", "title": "真实过程与结果", "hook": "先展示结果，再交代如何完成", "execution": "同一任务、真实录屏、不修饰失败条件；CTA 明确试用门槛。"},
    {"id": "scenario", "title": "高意图场景", "hook": "从一个具体用户任务切入", "execution": "固定一种使用场景，展示输入、操作和输出；比较任务型表达与功能罗列。"},
    {"id": "local", "title": "本地场景验证", "hook": "用当地语言讲清一个使用理由", "execution": "先人工确认文化和语言，再测试本地化表达；不能仅替换国旗或字幕。"},
]


async def generate_campaign_brief(run, llm):
    b, a = run["brief"], run["approval"]
    direction = next(d for d in DIRECTIONS if d["id"] == a["direction_id"])
    sources = run["sources"]
    selling = next((s["content"]["core_selling_points"] for s in sources if "core_selling_points" in s["content"]),
                   ["明确任务价值", "展示真实产品使用路径"])
    experiment = run["experiment"]
    test_plan = experiment.get("variants", ["样本不足，先验证埋点"]).copy()
    if experiment["status"] == "planned":
        test_plan.append(f"每组 {experiment['sample_per_variant']} 次点击；每日总点击 300 次时预计至少 {experiment['minimum_days']} 天。相对 MDE 20%，95% 置信水平，80% 功效，50/50 分流。")
    test_plan.append(experiment.get("decision_rule", "暂不做胜出判断"))
    fallback = {
        "project_background": f"{b['product_name']} 面向 {b['target_region']}，以一轮受控测试验证营销假设。当前问题：{(b.get('current_challenges') or '待进一步确认').rstrip('。')}。",
        "marketing_goal": b["marketing_goal"], "target_users": b["target_users"],
        "core_insight": run["research"]["market"]["headline"] + "；" + run["review"]["summary"],
        "selling_points": ["候选卖点（需核对本产品能力）：" + point for point in selling],
        "creative_direction": direction["title"] + "：" + direction["execution"] + (f" 人工补充：{a['feedback']}" if a["feedback"] else ""),
        "channel_suggestions": [f"首轮使用 {b['platforms'] or '待确认渠道'}；按国家和语言拆分观察。", "预算约束：" + (b["budget_range"] or "待确认，不自动分配预算")],
        "ab_test_plan": test_plan,
        "source_ids": [s["id"] for s in sources],
        "limitations": ["全部业务证据与指标为合成数据", "目标指标是演示假设，需由业务负责人确认", "本稿只用于方案讨论，不会发布广告或调整预算"],
    }
    result, meta = await llm.generate("Campaign Brief Agent", {"brief": b, "research": run["research"],
        "review": run["review"], "approval": a, "sources": sources, "experiment": run["experiment"]},
        Campaign, fallback, [s["id"] for s in sources])
    # Quantitative experiment details remain authoritative tool outputs, even with a model.
    result["ab_test_plan"] = test_plan
    return result, meta
