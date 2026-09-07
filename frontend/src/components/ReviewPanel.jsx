import { useState } from "react";
import { FlaskConical, ArrowRight, RotateCw } from "lucide-react";
import MetricCard from "./MetricCard";
import { Citations } from "./InsightPanel";
import { reviewCampaign } from "../api";

export default function ReviewPanel({ run, onError, onSource }) {
  const [comparison, setComparison] = useState(null);
  const [pending, setPending] = useState(false);
  const r = comparison || run.review;
  const experiment = comparison?.experiment || run.experiment;
  if (!r)
    return (
      <div className="tab-empty">
        <FlaskConical size={32} />
        <h3>等待指标计算</h3>
        <p>复盘 Agent 正在读取合成投放数据。</p>
      </div>
    );
  const format = (n, suffix = "", prefix = "") =>
    n === null
      ? "—"
      : prefix +
        n.toLocaleString("zh-CN", { maximumFractionDigits: 2 }) +
        suffix;
  const metrics = [
    ["CTR", "CTR", "%", "", "目标 ≥ 1.5%"],
    ["CVR", "CVR", "%", "", "目标 ≥ 8%"],
    ["CPA", "CPA", "", "$", "目标 ≤ $15"],
    ["ROAS", "ROAS", "", "", "目标 ≥ 1.5"],
    ["creative_adoption_rate", "素材采纳率", "%", "", "目标 ≥ 50%"],
  ];
  const compare = async (e) => {
    setPending(true);
    try {
      setComparison(await reviewCampaign({ scenario: e.target.value }));
    } catch (err) {
      onError(err.message);
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="review-content enter">
      <div className="section-intro">
        <span className="eyebrow">MEASUREMENT & EXPERIMENT</span>
        <h2>{r.summary}</h2>
        <p>USD · 合成投放数据 · 固定口径计算</p>
      </div>
      <div className="metric-strip">
        {metrics.map(([key, label, suffix, prefix, target]) => (
          <MetricCard
            key={key}
            label={label}
            value={format(r.values[key], suffix, prefix)}
            target={target}
            warning={r.abnormal_metrics.some((m) => m.metric === key)}
          />
        ))}
      </div>
      <div className="review-grid">
        <section>
          <h3>转化路径</h3>
          <div
            className="funnel"
            role="img"
            aria-label={
              "曝光 " +
              r.raw.impressions +
              "；点击 " +
              r.raw.clicks +
              "；核心转化 " +
              r.raw.conversions
            }
          >
            {[
              ["曝光", r.raw.impressions, "exposure"],
              ["点击", r.raw.clicks, "clicks"],
              ["核心转化", r.raw.conversions, "conversions"],
            ].map(([name, n, cls], i) => (
              <div className="funnel-stage" key={name}>
                <div className="funnel-label">
                  <span>{name}</span>
                  <strong>{n.toLocaleString()}</strong>
                </div>
                <div className="funnel-track">
                  <div
                    className={cls}
                    style={{
                      width: n
                        ? Math.max(
                            2,
                            (100 * n) / Math.max(r.raw.impressions, 1),
                          ) + "%"
                        : "0%",
                    }}
                  />
                </div>
                {i < 2 && <ArrowRight size={13} />}
              </div>
            ))}
          </div>
          <p className="micro">
            条长按曝光基数计算；小于 2% 的非零值以最小可见宽度呈现。
          </p>
          <div className="raw-summary">
            <span>
              花费 <b>{format(r.raw.spend, "", "$")}</b>
            </span>
            <span>
              归因收入 <b>{format(r.raw.revenue, "", "$")}</b>
            </span>
          </div>
        </section>
        <section>
          <h3>待验证问题</h3>
          {r.abnormal_metrics.length ? (
            r.abnormal_metrics.map((m) => (
              <div className="metric-issue" key={m.metric}>
                <span className="tag amber">{m.metric}</span>
                <p>{m.detail}</p>
              </div>
            ))
          ) : (
            <p className="success-text">
              五项指标未触发当前演示规则；不代表未来扩量表现。
            </p>
          )}
          <ul>
            {r.optimization_suggestions.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          {r.historical_context?.map((c) => (
            <div key={c.source_id}>
              <p className="micro">对照合成案例：{c.summary}</p>
              <Citations ids={[c.source_id]} onSource={onSource} />
            </div>
          ))}
        </section>
      </div>
      <section className="experiment-section">
        <div className="subheading">
          <h3>
            <FlaskConical size={17} />
            下一轮验证计划
          </h3>
          <span className="tag neutral">未启动实验</span>
        </div>
        {experiment?.status === "planned" ? (
          <>
            <p>{experiment.hypothesis}</p>
            <div className="experiment-numbers">
              <div>
                <strong>
                  {experiment.sample_per_variant.toLocaleString()}
                </strong>
                <span>每组所需点击</span>
              </div>
              <div>
                <strong>{experiment.minimum_days} 天</strong>
                <span>按每日 300 次点击估算</span>
              </div>
              <div>
                <strong>20%</strong>
                <span>相对最小可检测提升</span>
              </div>
            </div>
            <div className="variant-row">
              {experiment.variants.map((v) => (
                <p key={v}>{v}</p>
              ))}
            </div>
            <p>{experiment.decision_rule}</p>
            <details>
              <summary>统计假设与护栏</summary>
              <p>{experiment.assumptions}</p>
              <ul>
                {experiment.guardrails.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </details>
          </>
        ) : (
          <p>{experiment?.reason || "暂无足够样本。"}</p>
        )}
      </section>
      <details className="sandbox">
        <summary>
          <RotateCw size={15} />
          独立数据沙盘
        </summary>
        <div className="sandbox-controls">
          <label>
            对比场景
            <select onChange={compare} disabled={pending} defaultValue="">
              <option value="" disabled>
                选择场景
              </option>
              <option value="leaky">转化流失</option>
              <option value="healthy">达到演示目标</option>
              <option value="empty">尚无样本</option>
            </select>
          </label>
          <button
            className="button secondary"
            disabled={!comparison || pending}
            onClick={() => setComparison(null)}
          >
            恢复任务数据
          </button>
        </div>
        <p className="micro">
          临时对比不会修改本次任务与 Brief。
          {comparison ? "当前展示独立沙盘结果。" : ""}
        </p>
      </details>
      <p className="footnote">{r.caveat}</p>
    </div>
  );
}
