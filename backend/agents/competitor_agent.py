from models import Research


async def analyze_competitors(brief, sources, llm):
    source = next((s for s in sources if s["source_type"] == "competitor_case"), None)
    data = source["content"] if source else {}
    ids = [source["id"]] if source else []
    fallback = {
        "headline": "从同类表达中寻找可验证的差异",
        "findings": [
            {"title": "同类产品卖点", "detail": "、".join(data.get("core_selling_points", ["缺少匹配案例，暂不推断竞品卖点"])), "source_ids": ids},
            {"title": "内容与渠道", "detail": data.get("content_style", "需要补充同市场的公开素材样本。") + " " + data.get("channel_strategy", ""), "source_ids": ids},
            {"title": "差异化假设", "detail": "将同类卖点收敛到一个真实任务，并展示完整操作与试用条件。此为待验证建议，不是已经验证的竞争优势。", "source_ids": ids},
        ],
        "risks": ["竞品名称为虚构案例，不构成真实竞品监测", "不能从单个案例推断市场份额或确定性效果"],
    }
    return await llm.generate("Competitor Analysis Agent", {"brief": brief, "sources": sources},
                              Research, fallback, [s["id"] for s in sources])
