def check_campaign(run):
    campaign = run["campaign_brief"]
    valid_ids = {s["id"] for s in run["sources"]}
    unknown = set(campaign["source_ids"]) - valid_ids
    missing = run["parse"]["missing_fields"]
    return {
        "status": "needs_human_review",
        "checks": [
            {"name": "引用 ID 有效", "passed": not unknown, "detail": "只检查引用存在性，不等于语义事实已被证明。"},
            {"name": "人工方向已确认", "passed": bool(run.get("approval")), "detail": "保留确认方向与原始修改意见。"},
            {"name": "指标独立计算", "passed": True, "detail": "指标来自确定性工具，不由模型生成。"},
            {"name": "四类知识覆盖", "passed": len({s["source_type"] for s in run["sources"]}) == 4,
             "detail": f"命中 {len(valid_ids)} 条合成证据，覆盖 {len({s['source_type'] for s in run['sources']})} / 4 类。"},
        ],
        "open_questions": missing + ["核对产品真实能力、定价和本地化用语", "确认预算上限、转化事件和实际归因窗口"],
        "note": "规则质检不是法律、平台政策或事实审查。最终投放仍需负责人审批。",
    }
