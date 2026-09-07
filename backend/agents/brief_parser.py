def parse_brief(brief):
    optional = {"platforms": "投放平台", "budget_range": "预算范围", "current_challenges": "当前问题"}
    gaps = [f"{label}尚未补充" for key, label in optional.items() if not brief.get(key)]
    return {"product": brief["product_name"], "market": brief["target_region"],
            "audience": brief["target_users"], "objective": brief["marketing_goal"],
            "constraints": [brief.get("budget_range") or "预算待确认", brief.get("additional_notes") or "品牌约束待确认"],
            "missing_fields": gaps, "assumptions": ["业务资料与投放指标均为 mock", "研究建议需经本地市场人员验证"]}
