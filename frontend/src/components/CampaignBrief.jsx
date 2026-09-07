import { Check, Copy, Download, FileText, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { endpoint } from "../api";
import { Citations } from "./InsightPanel";

export default function CampaignBrief({ run, onSource, onError }) {
  const [copied, setCopied] = useState(false);
  if (!run.campaign_brief)
    return (
      <div className="tab-empty">
        <FileText size={32} />
        <h3>Brief 尚未生成</h3>
        <p>
          {run.status === "awaiting_approval"
            ? "研究已完成，等待确认创意方向。"
            : "等待研究与人工确认完成。"}
        </p>
      </div>
    );
  const c = run.campaign_brief;
  const copy = async () => {
    try {
      const res = await fetch(endpoint("/api/runs/" + run.id + "/export"));
      if (!res.ok) throw new Error("Brief 尚未完成，暂不能复制。");
      await navigator.clipboard.writeText(await res.text());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      onError(e.message || "剪贴板不可用，请下载 Markdown 文件。");
    }
  };
  return (
    <div className="document-content enter">
      <div className="document-toolbar">
        <span className="tag neutral">CAMPAIGN BRIEF · v1</span>
        <div className="button-group">
          <button
            className="icon-button"
            onClick={copy}
            disabled={run.status !== "completed"}
            aria-label={copied ? "已复制" : "复制 Campaign Brief"}
            title={copied ? "已复制" : "复制 Campaign Brief"}
          >
            {copied ? <Check size={17} /> : <Copy size={17} />}
          </button>
          {run.status === "completed" && (
            <a
              className="icon-button"
              href={endpoint("/api/runs/" + run.id + "/export")}
              download
              title="下载 Markdown"
              aria-label="下载 Markdown"
            >
              <Download size={17} />
            </a>
          )}
        </div>
      </div>
      <h2 className="document-title">{run.brief.product_name}</h2>
      <p className="document-subtitle">
        {run.brief.target_region} / {run.brief.product_type}
      </p>
      <div className="document-meta">
        <span>状态：讨论稿</span>
        <span>依据：合成数据</span>
        <span>投放：未执行</span>
      </div>
      {[
        ["项目背景", c.project_background],
        ["营销目标", c.marketing_goal],
        ["目标用户", c.target_users],
        ["核心洞察", c.core_insight],
        ["主推卖点", c.selling_points],
        ["创意方向", c.creative_direction],
        ["渠道建议", c.channel_suggestions],
        ["A/B 测试建议", c.ab_test_plan],
      ].map(([title, body], i) => (
        <section className="document-section" key={title}>
          <span className="section-number">
            {String(i + 1).padStart(2, "0")}
          </span>
          <div>
            <h3>{title}</h3>
            {Array.isArray(body) ? (
              <ul>
                {body.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            ) : (
              <p>{body}</p>
            )}
          </div>
        </section>
      ))}
      <section className="document-section">
        <span className="section-number">09</span>
        <div>
          <h3>核心指标 · 演示目标</h3>
          <p>
            CTR ≥ 1.5% · CVR ≥ 8% · CPA ≤ $15 · ROAS ≥ 1.5 · 素材采纳率 ≥ 50%
          </p>
          <p className="micro">
            非行业基准，不构成业绩承诺；真实目标需结合收入周期与毛利校准。
          </p>
        </div>
      </section>
      <section className="document-section">
        <span className="section-number">10</span>
        <div>
          <h3>证据与限制</h3>
          <Citations ids={c.source_ids} onSource={onSource} />
          <ul>
            {c.limitations.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      </section>
      {run.quality && (
        <section className="quality-block">
          <div className="subheading">
            <h3>
              <ShieldCheck size={17} />
              交付前检查
            </h3>
            <span className="tag amber">仍需人工核验</span>
          </div>
          <div className="quality-checks">
            {run.quality.checks.map((c) => (
              <div key={c.name}>
                <span className={c.passed ? "check-dot" : "warning-dot"}>
                  {c.passed ? "✓" : "!"}
                </span>
                <strong>{c.name}</strong>
                <p>{c.detail}</p>
              </div>
            ))}
          </div>
          <p className="micro">{run.quality.note}</p>
          <ul>
            {run.quality.open_questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
