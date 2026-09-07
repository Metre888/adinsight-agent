import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Aperture,
  ArrowRight,
  BookOpen,
  Check,
  CircleAlert,
  Database,
  FileText,
  ImagePlus,
  GitBranch,
  Plus,
  Search,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { request, post, endpoint } from "./api";
import { emptyBrief, presets, statusLabels } from "./presets";
import BriefInput from "./components/BriefInput";
import InsightPanel from "./components/InsightPanel";
import CampaignBrief from "./components/CampaignBrief";
import ReviewPanel from "./components/ReviewPanel";
import AgentWorkflow, { StepRail } from "./components/AgentWorkflow";
import KnowledgePanel, { SourceDialog } from "./components/KnowledgePanel";
import CreativeStudio from "./components/CreativeStudio";

const isActive = (status) => ["researching", "generating"].includes(status);
const tabs = [
  ["research", "研究结论", Search],
  ["brief", "Campaign Brief", FileText],
  ["review", "复盘与实验", Activity],
  ["trace", "执行与工具", GitBranch],
  ["sources", "知识来源", Database],
];
const readLocal = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const saveLocal = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private browsing may block storage. */
  }
};

export default function App() {
  const [brief, setBrief] = useState(() => ({
    ...presets[0].brief,
    ...readLocal("adinsight-brief-v2", {}),
  }));
  const [run, setRun] = useState(null);
  const [mode, setMode] = useState(() =>
    readLocal("adinsight-view", "research") === "creative"
      ? "creative"
      : "research",
  );
  const [creativeSeed, setCreativeSeed] = useState(null);
  const [tab, setTab] = useState("research");
  const [health, setHealth] = useState(null);
  const [knowledge, setKnowledge] = useState(null);
  const [history, setHistory] = useState([]);
  const [integrations, setIntegrations] = useState(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState("");
  const [source, setSource] = useState(null);
  const selected = useRef(null);
  const refreshHistory = () =>
    request("/api/runs")
      .then(setHistory)
      .catch(() => {});
  const refreshTools = async () => {
    setChecking(true);
    try {
      setIntegrations(await request("/api/integrations"));
    } catch (e) {
      setError(e.message);
    } finally {
      setChecking(false);
    }
  };
  const adopt = (r) => {
    selected.current = r.id;
    setRun(r);
    setBrief(r.brief);
    saveLocal("adinsight-run-v2", r.id);
  };
  useEffect(() => {
    let alive = true;
    Promise.all([
      request("/api/health"),
      request("/api/knowledge"),
      request("/api/runs"),
    ])
      .then(([h, k, list]) => {
        if (alive) {
          setHealth(h);
          setKnowledge(k);
          setHistory(list);
        }
      })
      .catch(() => {
        if (alive) setError("后端未连接。请启动 FastAPI 后刷新页面。");
      });
    const last = readLocal("adinsight-run-v2", null);
    if (last)
      request("/api/runs/" + last)
        .then((r) => {
          if (alive && selected.current === null) adopt(r);
        })
        .catch(() => saveLocal("adinsight-run-v2", null));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => saveLocal("adinsight-brief-v2", brief), [brief]);
  useEffect(() => saveLocal("adinsight-view", mode), [mode]);
  useEffect(() => {
    document.querySelector(".work-area")?.scrollTo({ top: 0 });
  }, [tab, run?.id]);
  const active = isActive(run?.status);
  useEffect(() => {
    if (!run?.id || !active) return;
    const id = run.id;
    const stream = new EventSource(endpoint("/api/runs/" + id + "/events"));
    const receive = (next) => {
      if (selected.current !== id) return;
      setRun(next);
      setConnection("");
      if (!isActive(next.status)) {
        stream.close();
        refreshHistory();
      }
    };
    stream.addEventListener("snapshot", (event) =>
      receive(JSON.parse(event.data)),
    );
    stream.onerror = () => {
      if (selected.current === id)
        setConnection("实时连接重连中，已保留当前结果。");
    };
    // Polling is a backstop when a proxy buffers SSE. It does not synthesize progress.
    const timer = setInterval(
      () =>
        request("/api/runs/" + id)
          .then(receive)
          .catch(() => {}),
      5000,
    );
    return () => {
      stream.close();
      clearInterval(timer);
    };
  }, [run?.id, active]);
  useEffect(() => {
    if (tab === "trace" && !integrations && !checking) refreshTools();
  }, [tab]);
  const execute = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const start = (e) => {
    e.preventDefault();
    execute(async () => {
      const next = await post("/api/runs", brief);
      adopt(next);
      setTab("research");
      refreshHistory();
    });
  };
  const approve = (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    execute(async () => {
      const next = await post("/api/runs/" + run.id + "/approve", {
        direction_id: form.get("direction"),
        feedback: form.get("feedback"),
        acknowledged: form.get("acknowledged") === "on",
      });
      adopt(next);
      setTab("brief");
    });
  };
  const newRun = (clear) => {
    setMode("research");
    selected.current = "new";
    setRun(null);
    setTab("research");
    setError("");
    setConnection("");
    setSource(null);
    saveLocal("adinsight-run-v2", null);
    if (clear) setBrief({ ...emptyBrief });
  };
  const selectHistory = (e) => {
    const id = e.target.value;
    if (!id) return;
    execute(async () => {
      const next = await request("/api/runs/" + id);
      adopt(next);
      setTab(next.status === "completed" ? "brief" : "research");
    });
  };
  const cancel = () =>
    execute(async () => {
      adopt(await post("/api/runs/" + run.id + "/cancel"));
      refreshHistory();
    });
  const remove = () =>
    execute(async () => {
      if (!window.confirm("删除这份本地任务及其执行记录？")) return;
      await request("/api/runs/" + run.id, { method: "DELETE" });
      newRun(false);
      refreshHistory();
    });
  const onSource = (id) => {
    const found = run?.sources.find((s) => s.id === id);
    if (found) setSource(found);
    else setError("当前任务中没有这条来源。");
  };
  const fallbacks = run?.steps.filter((s) => s.meta?.mode === "fallback") || [];
  const completed =
    run?.steps.filter((s) => s.status === "completed").length || 0;
  const openCreative = () => {
    setCreativeSeed({ id: run.id, brief: run.brief, at: Date.now() });
    setMode("creative");
  };
  const openResearchRun = (id) =>
    execute(async () => {
      adopt(await request("/api/runs/" + id));
      setTab("brief");
      setMode("research");
    });
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Aperture size={24} />
          </span>
          <div>
            <strong>
              AdInsight<span> Agent</span>
            </strong>
            <span className="brand-caption">
              出海营销策略、广告交付与复盘工作台
            </span>
          </div>
          <span className="version">03</span>
        </div>
        <div className="topbar-meta">
          <span className="status-text">
            <span className={"connection-dot " + (health ? "connected" : "")} />
            {health?.mode === "deepseek"
              ? "DeepSeek 已配置"
              : health
                ? "Mock 模式"
                : "连接中"}
          </span>
          <span className="divider" />
          <span>个人项目 · 合成数据</span>
        </div>
      </header>
      <div className="workspace-toolbar">
        <div className="workspace-modes" role="group" aria-label="工作台模块">
          <button
            className={mode === "research" ? "selected" : ""}
            aria-pressed={mode === "research"}
            onClick={() => setMode("research")}
          >
            <BookOpen size={15} />
            Campaign 研究
          </button>
          <button
            className={mode === "creative" ? "selected" : ""}
            aria-pressed={mode === "creative"}
            onClick={() => setMode("creative")}
          >
            <ImagePlus size={15} />
            广告创意交付
          </button>
        </div>
        <div
          className="button-group"
          style={mode === "creative" ? { display: "none" } : undefined}
        >
          <select
            aria-label="历史任务"
            className="history-select"
            value={run?.id || ""}
            disabled={busy || active}
            onChange={selectHistory}
          >
            <option value="">历史任务</option>
            {history.map((h) => (
              <option key={h.id} value={h.id}>
                {h.product_name} ·{" "}
                {new Date(h.created_at * 1000).toLocaleString("zh-CN", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}{" "}
                · {statusLabels[h.status]}
              </option>
            ))}
          </select>
          {run &&
            ["completed", "cancelled", "failed", "interrupted"].includes(
              run.status,
            ) && (
              <button
                title="删除当前任务"
                aria-label="删除当前任务"
                className="icon-button"
                onClick={remove}
                disabled={busy}
              >
                <Trash2 size={15} />
              </button>
            )}
          <button
            className="button secondary compact"
            disabled={busy || active}
            onClick={() => newRun(false)}
          >
            <Plus size={15} />
            新建任务
          </button>
        </div>
      </div>
      {error && (
        <div className="global-alert" role="alert">
          <CircleAlert size={17} />
          <span>{error}</span>
          <button
            className="icon-button"
            title="关闭提示"
            aria-label="关闭提示"
            onClick={() => setError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className="studio-host" hidden={mode !== "creative"}>
        <CreativeStudio
          run={run}
          seed={creativeSeed}
          onOpenRun={openResearchRun}
        />
      </div>
      <main className="workspace" hidden={mode !== "research"}>
        <BriefInput
          value={brief}
          onChange={setBrief}
          onSubmit={start}
          locked={!!run}
          busy={busy || active}
          onNew={newRun}
        />
        <section className="work-area">
          <div className="workspace-heading">
            <div>
              <span className="section-number">02</span>
              <h1>{run ? "研究与决策" : "Campaign 研究任务"}</h1>
            </div>
            {run ? (
              <div className="button-group">
                <span
                  className={
                    "tag " +
                    (run.status === "awaiting_approval" ? "amber" : "neutral")
                  }
                >
                  {statusLabels[run.status]}
                </span>
                {(active || run.status === "awaiting_approval") && (
                  <button
                    className="icon-button"
                    disabled={busy}
                    onClick={cancel}
                    title="取消任务"
                    aria-label="取消任务"
                  >
                    <Square size={14} />
                  </button>
                )}
              </div>
            ) : (
              <span className="tag neutral">尚未开始</span>
            )}
          </div>
          {run ? (
            <>
              <div className="run-progress">
                <StepRail steps={run.steps} />
                <div className="progress-line">
                  <span style={{ width: (completed / 6) * 100 + "%" }} />
                </div>
              </div>
              {connection && (
                <div role="status" className="inline-message">
                  {connection}
                </div>
              )}
              {fallbacks.length > 0 && (
                <div className="inline-message warning-text">
                  {fallbacks.map((s) => s.name).join("、")} 调用未通过，已降级为
                  Mock；详见执行记录。
                </div>
              )}
              {run.error && (
                <div className="notice danger" role="alert">
                  {run.error}
                </div>
              )}
              <nav className="tabs" aria-label="结果视图" role="tablist">
                {tabs.map(([key, title, Icon], index) => (
                  <button
                    key={key}
                    role="tab"
                    id={"tab-" + key}
                    aria-controls={"panel-" + key}
                    aria-selected={tab === key}
                    tabIndex={tab === key ? 0 : -1}
                    onKeyDown={(event) => {
                      let next = index;
                      if (event.key === "ArrowRight")
                        next = (index + 1) % tabs.length;
                      else if (event.key === "ArrowLeft")
                        next = (index + tabs.length - 1) % tabs.length;
                      else if (event.key === "Home") next = 0;
                      else if (event.key === "End") next = tabs.length - 1;
                      else return;
                      event.preventDefault();
                      setTab(tabs[next][0]);
                      document.getElementById("tab-" + tabs[next][0])?.focus();
                    }}
                    onClick={() => setTab(key)}
                    className={tab === key ? "active" : ""}
                  >
                    <Icon size={15} />
                    {title}
                    {key === "sources" && (
                      <span className="count">{run.sources.length}</span>
                    )}
                  </button>
                ))}
              </nav>
              <div
                className="tab-panel"
                role="tabpanel"
                id={"panel-" + tab}
                aria-labelledby={"tab-" + tab}
              >
                {run.status === "completed" &&
                  (tab === "brief" || tab === "review") && (
                    <div className="creative-handoff">
                      <p>
                        策略已确认 · 将产品、人群、洞察与内容约束带入广告制作。
                      </p>
                      <button
                        className="button primary compact"
                        onClick={openCreative}
                      >
                        <ImagePlus size={15} />
                        制作广告 <ArrowRight size={14} />
                      </button>
                    </div>
                  )}
                {tab === "research" && (
                  <InsightPanel
                    run={run}
                    onSource={onSource}
                    onApprove={approve}
                    pending={busy}
                  />
                )}
                {tab === "brief" && (
                  <CampaignBrief
                    run={run}
                    onSource={onSource}
                    onError={setError}
                  />
                )}
                {tab === "review" && (
                  <ReviewPanel
                    key={run.id}
                    run={run}
                    onError={setError}
                    onSource={onSource}
                  />
                )}
                {tab === "trace" && (
                  <AgentWorkflow
                    run={run}
                    integrations={integrations}
                    onRefresh={refreshTools}
                    refreshing={checking}
                  />
                )}
                {tab === "sources" && (
                  <KnowledgePanel
                    sources={run.sources}
                    knowledge={knowledge}
                    onSource={onSource}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="ready-workspace">
              <span className="eyebrow">FROM EVIDENCE TO CAMPAIGN</span>
              <h2>
                让下一轮 Campaign，
                <br />
                有据可依。
              </h2>
              <p className="ready-description">
                明确用户动机，找到差异化假设，形成可验证的创意方向。
              </p>
              <div className="ready-flow">
                <div>
                  <Search size={23} />
                  <span className="micro">RESEARCH</span>
                  <h3>研究与证据</h3>
                  <p>市场 · 竞品 · 投放复盘</p>
                </div>
                <ArrowRight className="flow-arrow" size={20} />
                <div>
                  <Check size={23} />
                  <span className="micro">DECISION</span>
                  <h3>确认策略</h3>
                  <p>创意方向 · 人工修改</p>
                </div>
                <ArrowRight className="flow-arrow" size={20} />
                <div>
                  <FileText size={23} />
                  <span className="micro">DELIVERY</span>
                  <h3>Campaign Brief</h3>
                  <p>测试计划 · 引用 · 质检</p>
                </div>
              </div>
              <div className="ready-bottom">
                <div>
                  <span className="eyebrow">LOCAL EVIDENCE</span>
                  <h3>从 4 类知识开始</h3>
                  <p>所有案例为本地合成数据。</p>
                </div>
                <div className="coverage-chart">
                  {knowledge?.collections.map((c) => (
                    <div key={c.source_type}>
                      <span>
                        {c.name.replace("知识库", "").replace("案例库", "")}
                      </span>
                      <div>
                        <i style={{ width: (c.count / 4) * 100 + "%" }} />
                      </div>
                      <b>{c.count}</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <footer className="workspace-footer">
            <span>ADINSIGHT / PERSONAL PROJECT</span>
            <p>
              个人独立 Demo，不代表任何公司正式项目。知识库、竞品与投放数据均为
              mock，未接入真实广告账户。
            </p>
          </footer>
        </section>
      </main>
      {source && (
        <SourceDialog source={source} onClose={() => setSource(null)} />
      )}
    </div>
  );
}
