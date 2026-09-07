from models import Research


async def generate_market_insight(brief, sources, llm):
    source = next((s for s in sources if s["source_type"] == "market_knowledge"), None)
    data = source["content"] if source else {}
    ids = [source["id"]] if source else []
    fallback = {
        "headline": f"围绕「{brief['product_type']}」的具体使用动机建立首轮假设",
        "findings": [
            {"title": "目标用户与动机", "detail": brief["target_users"] + "。用户描述来自输入，尚未经过访谈验证。", "source_ids": []},
            {"title": "市场偏好 · 合成案例", "detail": "、".join(data.get("user_preferences", ["没有匹配市场证据，需补充用户研究"])), "source_ids": ids},
            {"title": "本地化内容方向", "detail": "；".join(data.get("content_recommendations", ["先确认当地语言、场景和合规要求，再制定具体表达"])), "source_ids": ids},
        ],
        "risks": data.get("risk_notes", ["当前知识库没有该产品与市场组合的有效证据"]) +
                 ["合成案例仅用于形成假设，不能代表整个国家或人群"],
    }
    return await llm.generate("Market Insight Agent", {"brief": brief, "sources": sources},
                              Research, fallback, [s["id"] for s in sources])
