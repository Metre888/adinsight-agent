import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileImage,
  FolderOpen,
  ImagePlus,
  Layers,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { request, post, endpoint } from "../api";
import { presets } from "../presets";
import "../creative.css";

const ROOT = "/api/creative";
const jobLabels = {
  running: "生成中",
  succeeded: "待确认",
  failed: "生成失败",
  interrupted: "已中断",
};
const sample = {
  impressions: 128000,
  clicks: 2432,
  conversions: 151,
  spend: 1932.8,
  revenue: 2609.28,
  creatives_total: 12,
  creatives_used: 5,
};
const metricFields = [
  ["impressions", "曝光"],
  ["clicks", "点击"],
  ["conversions", "试用完成"],
  ["spend", "花费 / USD"],
  ["revenue", "收入 / USD"],
  ["creatives_total", "提交素材数"],
  ["creatives_used", "采纳素材数"],
];
function fromBrief(b, id = null) {
  return {
    product_name: b.product_name,
    product_type: b.product_type,
    target_region: b.target_region,
    target_users: b.target_users,
    marketing_goal: b.marketing_goal,
    platform: "Meta",
    language: "English",
    aspect_ratio: "4:5",
    constraints: b.additional_notes || "",
    route: "library",
    material_id: null,
    source_run_id: id,
  };
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export default function CreativeStudio({ run, seed, onOpenRun }) {
  const [order, setOrder] = useState(() =>
    read("adinsight-creative-draft", fromBrief(presets[0].brief)),
  );
  const [plan, setPlan] = useState(null);
  const [content, setContent] = useState(null);
  const [job, setJob] = useState(null);
  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState("mock");
  const [materials, setMaterials] = useState([]);
  const [search, setSearch] = useState("");
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [approved, setApproved] = useState(false);
  const [consent, setConsent] = useState(false);
  const [deliveryChecked, setDeliveryChecked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [metrics, setMetrics] = useState(sample);
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState(
    "保留主视觉，只修改试用说明与 CTA，避免同时改变多个变量。",
  );
  const [viewReview, setViewReview] = useState(false);
  const activeJob = useRef(null);
  const nonce = useRef(null);
  const generationKey = useRef(null);
  const requestBusy = useRef(false);
  const running = job?.status === "running";
  const locked = !!plan || busy;
  const selectedMaterial = materials.find((m) => m.id === order.material_id);
  const model = providers.find((p) => p.id === provider);
  const step = viewReview && job?.approval ? 3 : job ? 2 : plan ? 1 : 0;
  const refreshHistory = () =>
    request(ROOT + "/jobs").then((list) => {
      setHistory(list);
      return list;
    });
  const refreshProviders = () =>
    request(ROOT + "/providers").then((r) => setProviders(r.items));
  function resetResult() {
    setPlan(null);
    setContent(null);
    setJob(null);
    activeJob.current = null;
    setApproved(false);
    setConsent(false);
    setDeliveryChecked(false);
    setViewReview(false);
    setError("");
    save("adinsight-creative-last", null);
    nonce.current = null;
  }
  function startOrder(next) {
    if (running || busy) return;
    resetResult();
    setOrder(next);
    setSearch("");
  }
  function adoptPlan(p) {
    const draft = read("adinsight-creative-content", null);
    setPlan(p);
    setOrder(p.order);
    setContent(draft?.plan_id === p.id ? draft.content : p.content);
    setJob(null);
    activeJob.current = null;
    setApproved(false);
    setConsent(false);
    setDeliveryChecked(false);
    setViewReview(false);
    nonce.current = null;
    save("adinsight-creative-last", { plan: p.id });
  }
  function adoptJob(j) {
    activeJob.current = j.id;
    setJob(j);
    setContent(j.content);
    setOrder(j.order);
    setProvider(j.provider);
    setDeliveryChecked(false);
    setViewReview(false);
    save("adinsight-creative-last", { job: j.id, plan: j.plan_id });
  }
  async function execute(fn) {
    if (requestBusy.current) return;
    requestBusy.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      requestBusy.current = false;
      setBusy(false);
    }
  }
  async function loadJob(id) {
    const j = await request(ROOT + "/jobs/" + id);
    const p = await request(ROOT + "/plans/" + j.plan_id);
    setPlan(p);
    adoptJob(j);
  }
  useEffect(() => {
    execute(async () => {
      await refreshProviders();
      const list = await refreshHistory();
      const last = read("adinsight-creative-last", null);
      if (last?.job) await loadJob(last.job);
      else if (last?.pending) {
        const existing = list.find(
          (j) => j.request_id === last.pending.request_id,
        );
        if (existing) await loadJob(existing.id);
        else {
          adoptPlan(await request(ROOT + "/plans/" + last.plan));
          setContent(last.pending.content);
          setProvider(last.pending.provider);
          nonce.current = last.pending.request_id;
          const { request_id, ...submitted } = last.pending;
          generationKey.current = JSON.stringify({
            plan: last.plan,
            ...submitted,
          });
          setError(
            "上次提交尚未确认结果。请先刷新历史或重新确认后提交；相同请求不会重复生成。",
          );
        }
      } else if (last?.plan)
        adoptPlan(await request(ROOT + "/plans/" + last.plan));
    });
  }, []);
  useEffect(() => {
    if (seed) startOrder(fromBrief(seed.brief, seed.id));
  }, [seed]);
  useEffect(() => save("adinsight-creative-draft", order), [order]);
  useEffect(() => {
    if (plan && content && !job)
      save("adinsight-creative-content", { plan_id: plan.id, content });
  }, [plan?.id, content, job]);
  useEffect(() => {
    let alive = true;
    setLibraryLoading(true);
    const query = new URLSearchParams({
      product_type: order.product_type,
      region: order.target_region,
      query: search,
    });
    const timer = setTimeout(() => {
      request(ROOT + "/materials?" + query)
        .then((r) => {
          if (alive) setMaterials(r.items);
        })
        .catch((e) => {
          if (alive) {
            setMaterials([]);
            setError(e.message);
          }
        })
        .finally(() => {
          if (alive) setLibraryLoading(false);
        });
    }, 180);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [order.product_type, order.target_region, search]);
  useEffect(() => {
    if (!running) return;
    const id = job.id;
    let alive = true;
    let polling = false;
    const timer = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const j = await request(ROOT + "/jobs/" + id);
        if (alive && activeJob.current === id) {
          setJob(j);
          if (j.status !== "running") await refreshHistory();
        }
      } catch (e) {
        if (alive) setError("生成状态连接中断；刷新状态不会重新调用模型。");
      } finally {
        polling = false;
      }
    }, 1200);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [job?.id, running]);
  useEffect(() => {
    document.querySelector(".creative-main")?.scrollTo({ top: 0 });
  }, [step, plan?.id]);
  function update(field, value) {
    setOrder((o) => ({
      ...o,
      [field]: value,
      ...(["product_type", "target_region", "route"].includes(field)
        ? { material_id: null }
        : {}),
    }));
  }
  function editContent(field, value) {
    setContent((c) => ({ ...c, [field]: value }));
    setApproved(false);
    setConsent(false);
    nonce.current = null;
  }
  function makePlan(e) {
    e.preventDefault();
    execute(async () => adoptPlan(await post(ROOT + "/plans", order)));
  }
  function generate(e) {
    e.preventDefault();
    execute(async () => {
      const payload = {
        provider,
        content,
        content_approved: approved,
        external_consent: consent,
      };
      const key = JSON.stringify({ plan: plan.id, ...payload });
      if (generationKey.current !== key || !nonce.current) {
        nonce.current = crypto.randomUUID();
        generationKey.current = key;
      }
      const submitted = { ...payload, request_id: nonce.current };
      save("adinsight-creative-last", { plan: plan.id, pending: submitted });
      const j = await post(ROOT + "/plans/" + plan.id + "/generate", submitted);
      adoptJob(j);
      await refreshHistory();
    });
  }
  async function copyPrompt() {
    try {
      const c = job?.content || content;
      await navigator.clipboard.writeText(
        c.prompt +
          "\n\nHeadline: " +
          c.headline +
          "\nBody: " +
          c.body +
          "\nCTA: " +
          c.cta +
          "\nVisual direction: " +
          c.visual_direction +
          "\nFormat: " +
          order.aspect_ratio +
          " / " +
          order.platform +
          " / " +
          order.language +
          "\nBrand constraints: " +
          order.constraints +
          "\nReference: " +
          (plan?.material?.title || "None") +
          "\nConstraints: " +
          c.constraints,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("剪贴板不可用，请在提示词文本框中手动选择。");
    }
  }
  function backToEditor() {
    if (running || busy) return;
    setJob(null);
    activeJob.current = null;
    setApproved(false);
    setConsent(false);
    setViewReview(false);
    nonce.current = null;
    save("adinsight-creative-last", { plan: plan.id });
  }
  return (
    <main className="creative-studio">
      <aside className="creative-order">
        <div className="creative-order-heading">
          <span className="eyebrow">CLIENT REQUEST</span>
          <h2>广告制作需求</h2>
        </div>
        <form
          id="creative-order"
          onSubmit={makePlan}
          className="creative-order-form"
        >
          <fieldset disabled={locked}>
            <label>
              示例项目
              <select
                aria-label="广告示例项目"
                value=""
                onChange={(e) =>
                  startOrder(fromBrief(presets[Number(e.target.value)].brief))
                }
              >
                <option value="">选择示例需求</option>
                {presets.map((p, i) => (
                  <option value={i} key={i}>
                    {p.brief.product_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              产品名称
              <input
                required
                maxLength={100}
                value={order.product_name}
                disabled={!!order.source_run_id}
                onChange={(e) => update("product_name", e.target.value)}
              />
            </label>
            <label>
              产品类型
              <select
                value={order.product_type}
                disabled={!!order.source_run_id}
                onChange={(e) => update("product_type", e.target.value)}
              >
                {["AI 相机 App", "语言学习 App", "休闲游戏"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
                {!["AI 相机 App", "语言学习 App", "休闲游戏"].includes(
                  order.product_type,
                ) && <option>{order.product_type}</option>}
              </select>
            </label>
            <label>
              目标市场
              <input
                required
                maxLength={200}
                value={order.target_region}
                disabled={!!order.source_run_id}
                onChange={(e) => update("target_region", e.target.value)}
              />
            </label>
            <label>
              目标用户
              <textarea
                required
                rows={2}
                maxLength={1000}
                value={order.target_users}
                disabled={!!order.source_run_id}
                onChange={(e) => update("target_users", e.target.value)}
              />
            </label>
            <label>
              营销目标
              <textarea
                required
                rows={2}
                maxLength={1000}
                value={order.marketing_goal}
                disabled={!!order.source_run_id}
                onChange={(e) => update("marketing_goal", e.target.value)}
              />
            </label>
            <div className="creative-field-pair">
              <label>
                平台
                <select
                  value={order.platform}
                  onChange={(e) => update("platform", e.target.value)}
                >
                  {["Meta", "TikTok", "YouTube", "Google Display"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                文案语言
                <select
                  value={order.language}
                  onChange={(e) => update("language", e.target.value)}
                >
                  <option>English</option>
                  <option>简体中文</option>
                </select>
              </label>
            </div>
            <label>
              画幅
              <select
                value={order.aspect_ratio}
                onChange={(e) => update("aspect_ratio", e.target.value)}
              >
                <option value="1:1">1:1 · 方形</option>
                <option value="4:5">4:5 · 信息流</option>
                <option value="9:16">9:16 · 竖屏</option>
              </select>
            </label>
            <label>
              品牌与内容约束
              <textarea
                rows={3}
                maxLength={2000}
                value={order.constraints}
                onChange={(e) => update("constraints", e.target.value)}
              />
            </label>
          </fieldset>
          <div className="creative-context">
            {order.source_run_id ? (
              <>
                <span className="tag">已关联 Campaign Brief</span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onOpenRun(order.source_run_id)}
                >
                  查看研究来源 <ExternalLink size={13} />
                </button>
                {!plan && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => update("source_run_id", null)}
                  >
                    取消关联
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="tag neutral">独立客户需求</span>
                {run?.status === "completed" && !plan && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => startOrder(fromBrief(run.brief, run.id))}
                  >
                    导入当前已确认 Brief <ArrowRight size={13} />
                  </button>
                )}
              </>
            )}
            {plan?.parent_job_id && (
              <button
                type="button"
                disabled={busy}
                className="text-button"
                onClick={() => execute(() => loadJob(plan.parent_job_id))}
              >
                查看上一版广告 <ArrowLeft size={13} />
              </button>
            )}
          </div>
        </form>
        <div className="creative-order-action">
          {!plan ? (
            <button
              form="creative-order"
              className="button primary"
              disabled={
                busy || (order.route === "library" && !selectedMaterial)
              }
            >
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <WandSparkles size={16} />
              )}{" "}
              {busy ? "检索与规划中" : "生成创意方案"} <ArrowRight size={15} />
            </button>
          ) : (
            <button
              className="button secondary"
              disabled={running || busy}
              onClick={() => {
                startOrder({ ...order, source_run_id: null });
              }}
            >
              <Plus size={16} />
              新建创意需求
            </button>
          )}
        </div>
      </aside>
      <section className="creative-main">
        <div className="creative-title">
          <div>
            <span className="eyebrow">CREATIVE DELIVERY</span>
            <h1>广告创意交付</h1>
          </div>
          <select
            aria-label="历史广告交付"
            className="history-select"
            value={job?.id || ""}
            disabled={busy || running}
            onChange={(e) => {
              if (e.target.value) execute(() => loadJob(e.target.value));
            }}
          >
            <option value="">历史交付</option>
            {history.map((h) => (
              <option key={h.id} value={h.id}>
                {h.product_name} · V{h.version} ·{" "}
                {h.reviewed
                  ? "已复盘"
                  : h.approved
                    ? "已确认"
                    : jobLabels[h.status]}{" "}
                · {h.id.slice(0, 6)}
              </option>
            ))}
          </select>
        </div>
        <ol className="creative-steps" aria-label="广告交付进度">
          {["需求与素材", "提示词与模型", "广告交付", "复盘与下一版"].map(
            (name, i) => (
              <li
                key={name}
                className={step === i ? "current" : step > i ? "done" : ""}
                aria-current={step === i ? "step" : undefined}
              >
                <span>{step > i ? <Check size={12} /> : "0" + (i + 1)}</span>
                {name}
              </li>
            ),
          )}
        </ol>
        {error && (
          <div className="notice danger" role="alert">
            {error}
            <button className="text-button" onClick={() => setError("")}>
              关闭
            </button>
          </div>
        )}
        {!plan && (
          <div className="creative-stage enter">
            <div className="creative-section-title">
              <div>
                <h2>从哪里开始创作？</h2>
                <p>图片广告 · 附 15 秒短视频分镜</p>
              </div>
              <span className="tag neutral">全部为合成案例</span>
            </div>
            <div className="creative-route" role="group" aria-label="创作路径">
              <button
                className={order.route === "library" ? "selected" : ""}
                disabled={busy}
                onClick={() => update("route", "library")}
              >
                <FolderOpen size={20} />
                <span>
                  <strong>复用历史素材</strong>
                  <small>选择参考视觉与版式</small>
                </span>
                {order.route === "library" && <Check size={16} />}
              </button>
              <button
                className={order.route === "prompt" ? "selected" : ""}
                disabled={busy}
                onClick={() => update("route", "prompt")}
              >
                <Sparkles size={20} />
                <span>
                  <strong>从提示词创作</strong>
                  <small>从客户需求形成新方向</small>
                </span>
                {order.route === "prompt" && <Check size={16} />}
              </button>
            </div>
            {order.route === "library" ? (
              <>
                <div className="creative-library-bar">
                  <h3>
                    匹配的历史素材{" "}
                    <span className="muted">{materials.length}</span>
                  </h3>
                  <label className="creative-search">
                    <Search size={15} />
                    <input
                      aria-label="搜索历史素材"
                      placeholder="搜索风格或关键词"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                </div>
                {libraryLoading ? (
                  <p role="status">
                    <LoaderCircle size={15} className="spin" /> 检索素材中
                  </p>
                ) : materials.length ? (
                  <div className="creative-gallery">
                    {materials.map((m) => (
                      <button
                        key={m.id}
                        className={
                          "creative-material " +
                          (order.material_id === m.id ? "selected" : "")
                        }
                        disabled={busy}
                        onClick={() => update("material_id", m.id)}
                        aria-pressed={order.material_id === m.id}
                      >
                        <div className="creative-thumb">
                          <img
                            src={endpoint(m.thumbnail_url)}
                            alt={m.title + "合成广告参考"}
                            loading="lazy"
                          />
                          <span className="creative-select-mark">
                            {order.material_id === m.id ? (
                              <Check size={15} />
                            ) : (
                              <Plus size={15} />
                            )}
                          </span>
                        </div>
                        <div className="creative-material-caption">
                          <strong>{m.title}</strong>
                          <span>{m.tags.join(" · ")}</span>
                          <small>{m.platforms.join(" / ")} · 合成素材</small>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="creative-empty">
                    <Search size={26} />
                    <h3>没有匹配的历史素材</h3>
                    <p>当前产品与市场暂无可复用案例。</p>
                    <button
                      className="button secondary"
                      onClick={() => update("route", "prompt")}
                    >
                      改用提示词创作 <ArrowRight size={14} />
                    </button>
                  </div>
                )}
                {selectedMaterial && (
                  <div className="creative-source">
                    <CheckCircle2 size={17} />
                    <div>
                      <strong>{selectedMaterial.title}</strong>
                      <p>{selectedMaterial.reuse}</p>
                      <small>{selectedMaterial.relevance_reason}</small>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="creative-prompt-start">
                <div className="prompt-line">
                  <span>PRODUCT</span>
                  <strong>{order.product_name || "待填写"}</strong>
                </div>
                <div className="prompt-line">
                  <span>AUDIENCE</span>
                  <p>{order.target_users || "待填写"}</p>
                </div>
                <div className="prompt-line">
                  <span>OBJECTIVE</span>
                  <p>{order.marketing_goal || "待填写"}</p>
                </div>
                <div className="prompt-line">
                  <span>DELIVERABLE</span>
                  <p>
                    {order.aspect_ratio} 图片广告 / {order.language} /{" "}
                    {order.platform}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
        {plan && !job && (
          <form className="creative-stage enter" onSubmit={generate}>
            <div className="creative-section-title">
              <div>
                <h2>确认创意，再选择生成方式</h2>
                <p>
                  V{plan.version} · {plan.order.product_name} ·{" "}
                  {plan.mode.mode === "deepseek"
                    ? "DeepSeek 规划"
                    : plan.mode.mode === "fallback"
                      ? "文本服务降级为 Mock"
                      : "Mock 规划"}
                </p>
              </div>
              <button
                type="button"
                className="button secondary compact"
                onClick={copyPrompt}
              >
                <Copy size={14} />
                {copied ? "已复制" : "复制提示词"}
              </button>
            </div>
            {plan.revision_feedback && (
              <div className="notice">本轮修订：{plan.revision_feedback}</div>
            )}
            <div className="creative-editor-grid">
              <fieldset disabled={busy} className="creative-copy-fields">
                <label>
                  广告标题
                  <input
                    required
                    maxLength={80}
                    value={content.headline}
                    onChange={(e) => editContent("headline", e.target.value)}
                  />
                </label>
                <label>
                  广告正文
                  <textarea
                    required
                    maxLength={240}
                    rows={3}
                    value={content.body}
                    onChange={(e) => editContent("body", e.target.value)}
                  />
                </label>
                <label>
                  行动文案 / CTA
                  <input
                    required
                    maxLength={40}
                    value={content.cta}
                    onChange={(e) => editContent("cta", e.target.value)}
                  />
                </label>
                <label>
                  视觉方向
                  <textarea
                    required
                    maxLength={1200}
                    rows={3}
                    value={content.visual_direction}
                    onChange={(e) =>
                      editContent("visual_direction", e.target.value)
                    }
                  />
                </label>
                <label>
                  生成提示词
                  <textarea
                    className="creative-prompt-input"
                    required
                    minLength={10}
                    maxLength={8000}
                    rows={8}
                    value={content.prompt}
                    onChange={(e) => editContent("prompt", e.target.value)}
                  />
                </label>
                <label>
                  负面约束与禁用内容
                  <textarea
                    required
                    maxLength={4000}
                    rows={3}
                    value={content.constraints}
                    onChange={(e) => editContent("constraints", e.target.value)}
                  />
                </label>
                <details className="creative-details">
                  <summary>15 秒视频分镜 · 提示词交付</summary>
                  {content.storyboard.map((s, i) => (
                    <label key={i}>
                      {s.timing}
                      <textarea
                        rows={3}
                        maxLength={600}
                        value={s.visual}
                        onChange={(e) =>
                          editContent(
                            "storyboard",
                            content.storyboard.map((v, n) =>
                              n === i ? { ...v, visual: e.target.value } : v,
                            ),
                          )
                        }
                      />
                      <input
                        aria-label={s.timing + "旁白"}
                        maxLength={600}
                        value={s.voiceover}
                        onChange={(e) =>
                          editContent(
                            "storyboard",
                            content.storyboard.map((v, n) =>
                              n === i ? { ...v, voiceover: e.target.value } : v,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                </details>
              </fieldset>
              <div className="creative-model-column">
                {plan.material && (
                  <div className="creative-reference">
                    <img
                      src={endpoint(plan.material.thumbnail_url)}
                      alt="选中的历史参考素材"
                    />
                    <div>
                      <span className="eyebrow">REFERENCE</span>
                      <strong>{plan.material.title}</strong>
                      <p>{plan.material.reuse}</p>
                    </div>
                  </div>
                )}
                <div className="creative-model-heading">
                  <h3>生成模型</h3>
                  <button
                    type="button"
                    className="icon-button"
                    title="刷新模型配置"
                    aria-label="刷新模型配置"
                    disabled={busy}
                    onClick={() => execute(refreshProviders)}
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
                <fieldset className="creative-providers" disabled={busy}>
                  <legend className="sr-only">选择广告生成模型</legend>
                  {providers.map((p) => (
                    <label
                      key={p.id}
                      className={provider === p.id ? "selected" : ""}
                    >
                      <input
                        type="radio"
                        name="image-provider"
                        value={p.id}
                        checked={provider === p.id}
                        onChange={() => {
                          setProvider(p.id);
                          setConsent(false);
                          nonce.current = null;
                        }}
                      />
                      <span>
                        <strong>{p.name}</strong>
                        <small>{p.model}</small>
                        <em>
                          {p.id === "mock"
                            ? "本地运行 · 无调用费用"
                            : p.configured
                              ? "密钥已配置 · 尚未验证可用性"
                              : "未配置密钥"}
                        </em>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <p className="creative-disclosure">
                  {provider === "mock"
                    ? "本地模板渲染标题、正文、CTA 与所选参考图；自由视觉提示词不会在此模式中变成新图像。"
                    : "发送需求、提示词、文案与所选参考图片到服务商。费用以服务商为准，不会自动重试或切换其他模型。"}
                </p>
                {provider !== "mock" && !model?.configured && (
                  <div className="notice">
                    请在后端 .env 配置{" "}
                    {provider === "openai"
                      ? "OPENAI_API_KEY"
                      : "GEMINI_API_KEY"}{" "}
                    并重启服务。密钥不在浏览器填写。
                  </div>
                )}
                <label className="creative-check">
                  <input
                    type="checkbox"
                    checked={approved}
                    onChange={(e) => setApproved(e.target.checked)}
                    disabled={busy}
                  />
                  我已确认文案、参考素材与生成约束
                </label>
                {provider !== "mock" && (
                  <label className="creative-check">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      disabled={busy}
                    />
                    同意发送上述数据到所选模型，并承担可能的生成费用
                  </label>
                )}
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    !approved ||
                    !model?.configured ||
                    (provider !== "mock" && !consent)
                  }
                >
                  {busy ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <ImagePlus size={16} />
                  )}{" "}
                  {provider === "mock" ? "生成排版预览" : "调用模型生成广告"}
                </button>
              </div>
            </div>
            <ExecutionTrace plan={plan} />
          </form>
        )}
        {job && !viewReview && (
          <div className="creative-stage enter">
            <div className="creative-section-title">
              <div>
                <h2>
                  {job.status === "succeeded"
                    ? "这一版，准备交付"
                    : job.status === "running"
                      ? "正在制作广告"
                      : "本次未完成交付"}
                </h2>
                <p>
                  V{job.version} · {job.model} · {job.id.slice(0, 8)}
                </p>
              </div>
              <span className={"tag " + (job.approval ? "" : "neutral")}>
                {job.approval ? "已确认交付" : jobLabels[job.status]}
              </span>
            </div>
            <div className="creative-delivery-grid">
              <div className="creative-output">
                {job.status === "succeeded" ? (
                  <img
                    className="creative-result-image"
                    style={{
                      aspectRatio: order.aspect_ratio.replace(":", "/"),
                    }}
                    src={endpoint(job.image_url)}
                    alt={
                      job.content.headline +
                      (job.is_mock ? "，本地排版预览" : "，外部模型生成广告")
                    }
                  />
                ) : (
                  <div
                    className={
                      "creative-rendering " + (running ? "working" : "")
                    }
                    style={{
                      aspectRatio: order.aspect_ratio.replace(":", "/"),
                    }}
                  >
                    {running ? (
                      <LoaderCircle size={32} className="spin" />
                    ) : (
                      <FileImage size={32} />
                    )}
                    <strong>
                      {running
                        ? job.is_mock
                          ? "正在渲染排版"
                          : "等待模型返回图片"
                        : "未生成有效图片"}
                    </strong>
                    <span>
                      {running
                        ? "完成后自动显示，最长约 3 分钟"
                        : "本次请求没有自动重试"}
                    </span>
                  </div>
                )}
                <span className="creative-output-note">
                  {job.is_mock
                    ? "本地排版预览 · 非图像模型生成"
                    : "外部模型图片 · 待人工核验"}
                  {job.dimensions ? " · " + job.dimensions.join(" × ") : ""}
                </span>
              </div>
              <div className="creative-delivery-info">
                <span className="eyebrow">DELIVERY MANIFEST</span>
                <h3>{job.content.headline}</h3>
                <p>{job.content.body}</p>
                <span className="tag neutral">{job.content.cta}</span>
                <dl className="creative-manifest">
                  <div>
                    <dt>客户项目</dt>
                    <dd>{order.product_name}</dd>
                  </div>
                  <div>
                    <dt>渠道与画幅</dt>
                    <dd>
                      {order.platform} · {order.aspect_ratio}
                    </dd>
                  </div>
                  <div>
                    <dt>创意路径</dt>
                    <dd>{job.material ? "历史素材复用" : "提示词创作"}</dd>
                  </div>
                  <div>
                    <dt>素材来源</dt>
                    <dd>{job.material?.title || "无参考图片"}</dd>
                  </div>
                  <div>
                    <dt>交付内容</dt>
                    <dd>图片 / 提示词 / 分镜 / 来源清单</dd>
                  </div>
                </dl>
                {job.error && (
                  <div className="notice danger" role="alert">
                    {job.error}
                  </div>
                )}
                {job.status === "succeeded" && (
                  <>
                    <div className="creative-downloads">
                      <a
                        className="button secondary"
                        href={endpoint(
                          ROOT + "/jobs/" + job.id + "/image?download=true",
                        )}
                        download
                      >
                        <Download size={15} />
                        下载图片
                      </a>
                      <a
                        className="button secondary"
                        href={endpoint(ROOT + "/jobs/" + job.id + "/bundle")}
                        download
                      >
                        <Layers size={15} />
                        下载交付包
                      </a>
                      <button
                        className="icon-button"
                        title="复制生成提示词"
                        aria-label="复制生成提示词"
                        onClick={copyPrompt}
                      >
                        {copied ? <Check size={15} /> : <Copy size={15} />}
                      </button>
                    </div>
                    {!job.approval ? (
                      <div className="creative-approval">
                        <label className="creative-check">
                          <input
                            type="checkbox"
                            checked={deliveryChecked}
                            onChange={(e) =>
                              setDeliveryChecked(e.target.checked)
                            }
                          />
                          已检查图片、文案及素材权利，确认本次演示交付
                        </label>
                        <button
                          className="button primary"
                          disabled={!deliveryChecked || busy}
                          onClick={() =>
                            execute(async () => {
                              setJob(
                                await post(
                                  ROOT + "/jobs/" + job.id + "/approve",
                                  { acknowledged: true },
                                ),
                              );
                              await refreshHistory();
                            })
                          }
                        >
                          <CheckCircle2 size={16} />
                          确认交付版本
                        </button>
                      </div>
                    ) : (
                      <div className="creative-approval">
                        <p>
                          <CheckCircle2 size={16} />{" "}
                          已确认。尚未连接广告平台或自动投放。
                        </p>
                        <button
                          className="button primary"
                          onClick={() => {
                            setMetrics(job.review?.raw || sample);
                            setNotes(job.review?.notes || "");
                            setViewReview(true);
                          }}
                        >
                          <ArrowRight size={16} />
                          {job.review ? "查看版本复盘" : "进入模拟投放复盘"}
                        </button>
                      </div>
                    )}
                  </>
                )}
                {!running && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={backToEditor}
                  >
                    <ArrowLeft size={14} />
                    修改提示词并另存生成
                  </button>
                )}
                {running && (
                  <button
                    className="text-button"
                    onClick={() =>
                      execute(async () =>
                        setJob(await request(ROOT + "/jobs/" + job.id)),
                      )
                    }
                  >
                    <RefreshCw size={14} />
                    刷新生成状态
                  </button>
                )}
              </div>
            </div>
            <details className="creative-details">
              <summary>已提交的生成内容</summary>
              <pre>{job.content.prompt}</pre>
              <p>{job.content.constraints}</p>
            </details>
            <ExecutionTrace plan={plan} />
          </div>
        )}
        {job && viewReview && (
          <div className="creative-stage enter">
            <div className="creative-section-title">
              <div>
                <h2>从交付，回到下一次创作</h2>
                <p>
                  复盘绑定 V{job.version} · {job.id.slice(0, 8)} · 仅模拟数据
                </p>
              </div>
              <button
                className="text-button"
                onClick={() => setViewReview(false)}
              >
                <ArrowLeft size={14} />
                返回广告
              </button>
            </div>
            {!job.review ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  execute(async () => {
                    setJob(
                      await post(ROOT + "/jobs/" + job.id + "/review", {
                        metrics,
                        notes,
                        data_mode: "mock",
                      }),
                    );
                    await refreshHistory();
                  });
                }}
              >
                <div className="notice">
                  模拟投放数据 · CVR = 试用完成 / 点击；金额为 USD，收入归因为 7
                  天点击合成口径。未连接真实投放账户。
                </div>
                <fieldset disabled={busy} className="creative-metrics-form">
                  {metricFields.map(([key, name]) => (
                    <label key={key}>
                      {name}
                      <input
                        type="number"
                        required
                        min="0"
                        step={["spend", "revenue"].includes(key) ? "0.01" : "1"}
                        value={metrics[key]}
                        onChange={(e) =>
                          setMetrics((m) => ({
                            ...m,
                            [key]:
                              e.target.value === ""
                                ? ""
                                : Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                  ))}
                </fieldset>
                <label>
                  客户反馈
                  <textarea
                    rows={3}
                    maxLength={1500}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="对这版广告的观察与反馈"
                  />
                </label>
                <div className="creative-review-actions">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setMetrics(sample)}
                  >
                    填充模拟投放数据
                  </button>
                  <button className="button primary" disabled={busy}>
                    {busy ? (
                      <LoaderCircle size={15} className="spin" />
                    ) : (
                      <ArrowRight size={15} />
                    )}
                    生成版本复盘
                  </button>
                </div>
              </form>
            ) : (
              <>
                <h3>{job.review.summary}</h3>
                <div className="creative-review-metrics">
                  {Object.entries(job.review.values).map(([k, v]) => (
                    <div key={k}>
                      <span>
                        {k === "creative_adoption_rate"
                          ? "素材采纳率"
                          : k === "CPA"
                            ? "CPA / USD"
                            : k}
                      </span>
                      <strong>
                        {v == null
                          ? "—"
                          : v.toFixed(2) +
                            (["CTR", "CVR", "creative_adoption_rate"].includes(
                              k,
                            )
                              ? "%"
                              : k === "ROAS"
                                ? "x"
                                : "")}
                      </strong>
                    </div>
                  ))}
                </div>
                <p className="creative-disclosure">{job.review.caveat}</p>
                <div className="creative-review-list">
                  {job.review.abnormal_metrics.map((a, i) => (
                    <div key={i}>
                      <span className="tag amber">
                        {a.metric === "creative_adoption_rate"
                          ? "素材采纳率"
                          : a.metric}
                      </span>
                      <p>{a.detail}</p>
                    </div>
                  ))}
                </div>
                <h3>下一轮验证重点</h3>
                <ul>
                  {job.review.optimization_suggestions.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
                <div className="notice">
                  {job.review.experiment.status === "planned"
                    ? job.review.experiment.hypothesis +
                      " 每组至少 " +
                      job.review.experiment.sample_per_variant +
                      " 个点击样本；未达样本，不宣布胜出。"
                    : job.review.experiment.reason}
                </div>
                {job.review.notes && <p>客户反馈：{job.review.notes}</p>}
                <form
                  className="creative-iteration"
                  onSubmit={(e) => {
                    e.preventDefault();
                    execute(async () =>
                      adoptPlan(
                        await post(ROOT + "/jobs/" + job.id + "/iterate", {
                          feedback,
                        }),
                      ),
                    );
                  }}
                >
                  <label>
                    下一版修改意见
                    <textarea
                      required
                      maxLength={1800}
                      rows={3}
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                    />
                  </label>
                  <button className="button primary" disabled={busy}>
                    {busy ? (
                      <LoaderCircle size={15} className="spin" />
                    ) : (
                      <RefreshCw size={15} />
                    )}
                    带入复盘，创建 V{job.version + 1}
                  </button>
                </form>
                <details className="creative-details">
                  <summary>复盘工具调用 · MCP</summary>
                  {job.review.tool_calls?.map((t) => (
                    <p key={t.id}>
                      {t.name} · {t.status} · {t.duration_ms}ms · {t.transport}
                    </p>
                  ))}
                </details>
              </>
            )}
          </div>
        )}
        <footer className="creative-footer">
          个人作品集 Demo · 素材与业务数据均为合成 · 生成结果需人工审核 ·
          不自动发布广告
        </footer>
      </section>
    </main>
  );
}

function ExecutionTrace({ plan }) {
  return (
    <details className="creative-details">
      <summary>方案来源与协作记录</summary>
      <div className="creative-agent-row">
        <span>素材检索</span>
        <ArrowRight size={13} />
        <span>创意规划</span>
        <ArrowRight size={13} />
        <span>人工确认</span>
        <ArrowRight size={13} />
        <span>模型生成</span>
        <ArrowRight size={13} />
        <span>交付与复盘</span>
      </div>
      <p>
        规划模式：{plan.mode.mode}；
        {plan.source_run_id
          ? "已继承确认后的 Campaign Brief"
          : "基于独立客户需求"}
        。参考图片不是实际产品功能证明。
      </p>
      {plan.tool_calls.length ? (
        plan.tool_calls.map((t) => (
          <p key={t.id}>
            {t.name} · {t.status} · {t.duration_ms}ms · {t.transport}
          </p>
        ))
      ) : (
        <p>提示词创作路径：本次未检索历史素材。</p>
      )}
    </details>
  );
}
