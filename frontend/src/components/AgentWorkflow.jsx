import {
  Check,
  Circle,
  LoaderCircle,
  GitBranch,
  Cable,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
const modes = {
  mock: "Mock 模板",
  fallback: "降级 Mock",
  deepseek: "DeepSeek",
  rules: "确定性规则",
};
export function StepRail({ steps = [] }) {
  return (
    <ol className="step-rail" aria-label="Agent 执行状态">
      {steps.map((s, i) => (
        <li key={s.id} className={s.status}>
          <span className="step-symbol">
            {s.status === "completed" ? (
              <Check size={13} />
            ) : s.status === "running" ? (
              <LoaderCircle className="spin" size={14} />
            ) : (
              i + 1
            )}
          </span>
          <span>
            {s.name
              .replace(" Analysis", "")
              .replace(" Optimization", "")
              .replace(" Review", "")}
          </span>
        </li>
      ))}
    </ol>
  );
}
export default function AgentWorkflow({
  run,
  integrations,
  onRefresh,
  refreshing,
}) {
  return (
    <div className="trace-content enter">
      <div className="section-intro">
        <span className="eyebrow">ORCHESTRATION TRACE</span>
        <h2>执行过程，可追溯。</h2>
        <p>解析 → 市场 / 竞品 / 复盘并行 → 人工确认 → Brief → 规则质检</p>
      </div>
      <div className="subheading">
        <h3>
          <Cable size={17} />
          MCP 连接
        </h3>
        <button
          className="icon-button"
          title="重新检测 MCP 连接"
          aria-label="重新检测 MCP 连接"
          disabled={refreshing}
          onClick={onRefresh}
        >
          <RefreshCw size={16} className={refreshing ? "spin" : ""} />
        </button>
      </div>
      <div className="integration-list">
        {integrations?.servers.map((s) => (
          <details className="integration-row" key={s.server}>
            <summary>
              <span className={"connection-dot " + s.status} />
              <strong>
                {s.server === "knowledge"
                  ? "Knowledge Server"
                  : "Measurement Server"}
              </strong>
              <span>
                {s.tools.length} tools ·{" "}
                {s.status === "connected" ? "已连接" : "不可用"}
              </span>
            </summary>
            <p className="micro">
              独立本地进程 · {s.transport} · 只读 · 无广告账户权限
            </p>
            {s.tools.map((t) => (
              <div className="tool-definition" key={t.name}>
                <code>{t.name}</code>
                <p>{t.description}</p>
              </div>
            ))}
          </details>
        )) || (
          <p className="micro">
            {refreshing ? "正在检测 MCP 连接…" : "尚未检测连接。"}
          </p>
        )}
      </div>
      <h3 className="spaced-heading">
        <GitBranch size={17} />
        Agent 任务分工
      </h3>
      <div className="agent-table">
        {run.steps.map((s) => (
          <details key={s.id}>
            <summary>
              {s.status === "completed" ? (
                <Check size={15} />
              ) : s.status === "running" ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <Circle size={14} />
              )}
              <strong>{s.name}</strong>
              <span className="micro">
                {modes[s.meta?.mode] ||
                  (s.status === "pending" ? "待执行" : s.status)}
                {s.duration_ms !== undefined
                  ? " · " + (s.duration_ms / 1000).toFixed(2) + "s"
                  : ""}
              </span>
            </summary>
            <dl>
              <dt>输入</dt>
              <dd>{s.input}</dd>
              <dt>任务</dt>
              <dd>{s.task}</dd>
              <dt>输出</dt>
              <dd>{s.output}</dd>
            </dl>
            {s.meta?.reason && <p className="micro">{s.meta.reason}</p>}
          </details>
        ))}
      </div>
      <h3 className="spaced-heading">
        工具调用 <span className="count">{run.tool_calls.length}</span>
      </h3>
      <div className="tool-traces">
        {run.tool_calls.map((t) => (
          <details key={t.id}>
            <summary>
              <span className={"trace-status " + t.status}>
                {t.status === "completed" ? (
                  <Check size={14} />
                ) : t.status === "running" ? (
                  <LoaderCircle size={14} className="spin" />
                ) : (
                  <AlertCircle size={14} />
                )}
              </span>
              <code>{t.name}</code>
              <span className="micro">
                {t.agent} · {t.duration_ms ?? "…"} ms
              </span>
            </summary>
            <p className="micro">
              {t.server} · {t.transport}
            </p>
            <h4>输入</h4>
            <pre>{JSON.stringify(t.arguments, null, 2)}</pre>
            <h4>输出</h4>
            <pre>
              {JSON.stringify(
                t.result || { error: t.error || "执行中" },
                null,
                2,
              )}
            </pre>
          </details>
        ))}
      </div>
      <details className="event-log">
        <summary>运行事件 · {run.events.length}</summary>
        {run.events.map((e, i) => (
          <p key={i}>
            <time>{new Date(e.time * 1000).toLocaleTimeString()}</time>
            {e.message}
          </p>
        ))}
      </details>
    </div>
  );
}
