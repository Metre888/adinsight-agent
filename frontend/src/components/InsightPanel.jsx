import { ArrowUpRight, Check, CircleAlert } from "lucide-react";
export function Citations({ ids, onSource }) {
  return (
    <span className="citations">
      {ids?.map((id) => (
        <button
          key={id}
          className="citation"
          onClick={() => onSource(id)}
          title={"查看来源 " + id}
        >
          {id}
          <ArrowUpRight size={11} />
        </button>
      ))}
    </span>
  );
}
export default function InsightPanel({ run, onSource, onApprove, pending }) {
  return (
    <div className="insight-content enter">
      <div className="section-intro">
        <span className="eyebrow">RESEARCH SYNTHESIS</span>
        <h2>先明确动机，再选择表达。</h2>
        <p>
          {run.brief.target_region} · {run.brief.product_type} ·{" "}
          {run.sources.length} 条匹配合成证据
        </p>
      </div>
      <div className="research-columns">
        {[
          ["market", "用户与市场"],
          ["competitor", "竞品与机会"],
        ].map(([key, label]) => (
          <section key={key} className="research-section">
            <div className="subheading">
              <h3>{label}</h3>
              <span className="tag neutral">待验证假设</span>
            </div>
            {!run.research[key] ? (
              <div className="shimmer-lines" aria-label="研究进行中">
                <i />
                <i />
                <i />
              </div>
            ) : (
              run.research[key].findings.map((f, i) => (
                <article className="finding" key={i}>
                  <span className="finding-index">0{i + 1}</span>
                  <div>
                    <h4>{f.title}</h4>
                    <p>{f.detail}</p>
                    <Citations ids={f.source_ids} onSource={onSource} />
                  </div>
                </article>
              ))
            )}
          </section>
        ))}
      </div>
      {!!run.parse?.missing_fields.length && (
        <div className="notice">
          <CircleAlert size={16} />
          <span>{run.parse.missing_fields.join("；")}</span>
        </div>
      )}
      <details className="risk-details">
        <summary>
          <CircleAlert size={15} />
          风险与信息边界
        </summary>
        <ul>
          {[
            ...new Set(Object.values(run.research).flatMap((r) => r.risks)),
          ].map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </details>
      {run.status === "awaiting_approval" && (
        <form className="approval-band" onSubmit={onApprove}>
          <div className="subheading">
            <div>
              <span className="eyebrow">HUMAN CHECKPOINT</span>
              <h3>确认这一轮要验证的创意方向</h3>
            </div>
            <span className="tag amber">等待你决策</span>
          </div>
          <div className="direction-options">
            {run.directions.map((d, i) => (
              <label key={d.id} className="direction-option">
                <input
                  type="radio"
                  name="direction"
                  value={d.id}
                  defaultChecked={i === 0}
                />
                <span>
                  <strong>{d.title}</strong>
                  <small>{d.hook}</small>
                </span>
              </label>
            ))}
          </div>
          <label>
            修改意见
            <textarea
              name="feedback"
              rows={2}
              maxLength={1500}
              placeholder="例如：以印尼市场为先，不使用节日承诺。"
            />
          </label>
          <div className="approval-actions">
            <label className="checkbox-label">
              <input type="checkbox" name="acknowledged" required />
              已知证据均为合成数据，确认仅生成讨论稿
            </label>
            <button className="button primary" disabled={pending} type="submit">
              <Check size={16} />
              确认并生成 Brief
            </button>
          </div>
        </form>
      )}
      {run.approval && (
        <div className="notice success">
          <Check size={16} />
          <span>
            已确认：
            {
              run.directions.find((d) => d.id === run.approval.direction_id)
                ?.title
            }
            {run.approval.feedback ? " · " + run.approval.feedback : ""}
          </span>
        </div>
      )}
    </div>
  );
}
