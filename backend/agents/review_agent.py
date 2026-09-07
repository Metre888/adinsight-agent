from services.measurement import calculate_metrics, sample_performance, plan_experiment


def generate_review(metrics=None, scenario="leaky"):
    report = calculate_metrics(metrics if metrics is not None else sample_performance(scenario)["metrics"])
    report["experiment"] = plan_experiment((report["values"]["CVR"] or 0) / 100)
    return report
