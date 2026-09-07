from math import ceil, sqrt
from statistics import NormalDist
from models import Measurements

SCENARIOS = {
    "leaky": dict(impressions=128000, clicks=2432, conversions=151, spend=1932.8,
                  revenue=2609.28, creatives_total=12, creatives_used=5),
    "healthy": dict(impressions=128000, clicks=3072, conversions=338, spend=1932.8,
                    revenue=4638.72, creatives_total=12, creatives_used=9),
    "empty": dict(impressions=0, clicks=0, conversions=0, spend=0, revenue=0,
                  creatives_total=0, creatives_used=0),
}


def sample_performance(scenario: str = "leaky") -> dict:
    """Load one synthetic performance scenario. Does not connect to any ad account."""
    if scenario not in SCENARIOS:
        raise ValueError("未知 mock 场景")
    return {"scenario": scenario, "is_mock": True, "currency": "USD",
            "conversion_event": "试用完成", "attribution_window": "7 天点击（合成口径）",
            "metrics": SCENARIOS[scenario].copy()}


def calculate_metrics(metrics: dict) -> dict:
    """Validate raw counts and compute five campaign metrics deterministically."""
    m = Measurements.model_validate(metrics)
    ratio = lambda a, b, factor=1: round(a / b * factor, 4) if b else None
    values = {"CTR": ratio(m.clicks, m.impressions, 100), "CVR": ratio(m.conversions, m.clicks, 100),
              "CPA": ratio(m.spend, m.conversions), "ROAS": ratio(m.revenue, m.spend),
              "creative_adoption_rate": ratio(m.creatives_used, m.creatives_total, 100)}
    issues, suggestions = [], []
    if values["CVR"] is None:
        issues.append({"metric": "CVR", "severity": "unknown", "detail": "没有点击样本，不能判断转化表现。"})
        suggestions.append("先校验事件埋点与归因口径，再积累点击和转化样本。")
    elif values["CVR"] < 8:
        issues.append({"metric": "CVR", "severity": "warning", "detail": "低于演示目标 8%；落地页与素材承诺的一致性需要验证，尚不能确定因果。"})
        suggestions.append("保持人群和素材不变，测试落地页的试用条件说明。")
    if values["ROAS"] is not None and values["ROAS"] < 1.5:
        issues.append({"metric": "ROAS", "severity": "warning", "detail": "低于演示目标 1.5；需核对收入回传、延迟与付费质量。"})
    for key, limit, below, detail in [
        ("CTR", 1.5, True, "低于演示目标 1.5%；需验证素材开头与人群的匹配。"),
        ("CPA", 15, False, "高于演示上限 $15；需核对单次转化成本与收入周期。"),
        ("creative_adoption_rate", 50, True, "低于演示目标 50%；需复核素材评审标准与未采纳原因。"),
    ]:
        value = values[key]
        if value is not None and (value < limit if below else value > limit):
            issues.append({"metric": key, "severity": "warning", "detail": detail})
    for key, value in values.items():
        if value is None and key != "CVR":
            issues.append({"metric": key, "severity": "unknown", "detail": "分母为零，指标暂不可计算；不能将缺失解释为良好表现。"})
    if not suggestions:
        suggestions.append("先核对成本、收入与素材评审口径，再决定下一轮验证重点。" if issues
                           else "当前合成数据达到演示目标；先观察分地区表现，再评估扩量。")
    return {"raw": m.model_dump(), "values": values, "is_mock": True,
            "summary": "样本不足" if not m.clicks else (
                "转化环节需要优先验证" if any(i["metric"] == "CVR" for i in issues) else
                "成本或素材指标需要复核" if issues else "当前达到演示目标，尚未完成真实业务验证"),
            "abnormal_metrics": issues, "optimization_suggestions": suggestions,
            "targets": {"CTR": 1.5, "CVR": 8, "CPA": 15, "ROAS": 1.5, "creative_adoption_rate": 50},
            "caveat": "所有目标为演示假设，不是行业基准；CVR = 试用完成数 / 点击数。ROAS 未扣成本，不等于利润。"}


def plan_experiment(baseline_cvr: float, daily_clicks: int = 300, relative_mde: float = 0.2) -> dict:
    """Estimate fixed-horizon two-proportion experiment sample size; never declares a winner."""
    if not 0 < baseline_cvr < 1 or not 0 < relative_mde <= 1 or daily_clicks <= 0:
        return {"status": "insufficient_data", "reason": "有效 CVR 基线与每日点击量缺失，暂不计算样本量。"}
    p1, p2 = baseline_cvr, baseline_cvr * (1 + relative_mde)
    if p2 >= 1:
        return {"status": "insufficient_data", "reason": "目标转化率超出可计算范围。"}
    mean = (p1 + p2) / 2
    z_alpha, z_power = NormalDist().inv_cdf(.975), NormalDist().inv_cdf(.8)
    n = ceil((z_alpha * sqrt(2 * mean * (1 - mean)) + z_power * sqrt(p1*(1-p1)+p2*(1-p2)))**2 / (p2-p1)**2)
    return {"status": "planned", "sample_per_variant": n, "minimum_days": max(7, ceil(2*n/daily_clicks)),
            "primary_metric": "点击到试用 CVR", "relative_mde": relative_mde,
            "confidence": .95, "power": .8, "allocation": "50 / 50",
            "hypothesis": "明确试用条件能提高点击后的试用完成率。",
            "variants": ["A：当前试用说明", "B：明确试用期限、费用与退出方式"],
            "guardrails": ["CPA 不高于演示上限 $15", "同地区、同人群、同素材，仅变更试用说明"],
            "decision_rule": "达到预定样本且至少覆盖 7 天后统一分析；未达到样本时不宣布胜出。",
            "assumptions": "双侧两独立比例正态近似，独立点击、固定样本、80% 功效；演示估算，不支持序贯偷看。"}
