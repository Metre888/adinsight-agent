import { Database, ArrowUpRight, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { sourceLabels } from "../presets";
export default function KnowledgePanel({ sources, knowledge, onSource }) {
  return (
    <div className="knowledge-content enter">
      <div className="section-intro">
        <span className="eyebrow">EVIDENCE LIBRARY</span>
        <h2>每个建议，都有出处与边界。</h2>
        <p>
          本次匹配 {sources.length} 条 / 本地共 {knowledge?.total_sources || 0}{" "}
          条 · 全部为合成案例
        </p>
      </div>
      <div className="collection-strip">
        {knowledge?.collections.map((c) => (
          <div key={c.source_type}>
            <Database size={16} />
            <span>{c.name}</span>
            <b>{c.count}</b>
          </div>
        ))}
      </div>
      <div className="source-list">
        {sources.length ? (
          sources.map((s) => (
            <button
              key={s.id}
              onClick={() => onSource(s.id)}
              className="source-row"
            >
              <span className="source-id">{s.id}</span>
              <div>
                <span className="micro">
                  {sourceLabels[s.source_type]} · MOCK
                </span>
                <h3>{s.title}</h3>
                <p>{s.summary}</p>
                <span className="micro">
                  文本相似度 {s.score} · 不是事实置信度
                </span>
              </div>
              <ArrowUpRight size={17} />
            </button>
          ))
        ) : (
          <div className="tab-empty">
            <Database size={32} />
            <h3>暂无匹配来源</h3>
            <p>未覆盖的市场不会自动套用其他地区的案例。</p>
          </div>
        )}
      </div>
    </div>
  );
}
export function SourceDialog({ source, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    if (source && !ref.current.open) ref.current.showModal();
    return () => previous?.focus();
  }, [source]);
  if (!source) return null;
  return (
    <dialog
      ref={ref}
      className="source-dialog"
      onCancel={onClose}
      onClose={onClose}
      aria-labelledby="source-title"
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-heading">
        <span className="tag neutral">{source.id} · MOCK</span>
        <button
          className="icon-button"
          title="关闭来源"
          aria-label="关闭来源"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <h2 id="source-title">{source.title}</h2>
      <p className="micro">
        {sourceLabels[source.source_type]} · 本地 JSON · 合成内容
      </p>
      <h3>来源摘要</h3>
      <p>{source.summary}</p>
      <h3>相关性说明</h3>
      <p>{source.relevance_reason}</p>
      <div className="notice">
        这是知识样本，不是实时市场调研或真实竞品结论。
      </div>
      <details>
        <summary>原始知识记录</summary>
        <pre>{JSON.stringify(source.content, null, 2)}</pre>
      </details>
    </dialog>
  );
}
