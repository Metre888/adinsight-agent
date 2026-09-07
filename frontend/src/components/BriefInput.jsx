import {
  ArrowRight,
  RotateCcw,
  SlidersHorizontal,
  WandSparkles,
} from "lucide-react";
import { presets } from "../presets";

export default function BriefInput({
  value,
  onChange,
  onSubmit,
  locked,
  busy,
  onNew,
}) {
  const set = (key, next) => onChange({ ...value, [key]: next });
  return (
    <aside className="brief-sidebar">
      <div className="sidebar-heading">
        <span className="section-number">01</span>
        <h2>Campaign 输入</h2>
        <button
          className="icon-button"
          title="新建空白任务"
          aria-label="新建空白任务"
          disabled={busy}
          onClick={() => onNew(true)}
        >
          <RotateCcw size={16} />
        </button>
      </div>
      <form onSubmit={onSubmit}>
        <fieldset disabled={locked || busy}>
          <label className="preset-label">
            <WandSparkles size={14} />
            示例项目
            <select
              aria-label="填充示例项目"
              value={
                presets.findIndex(
                  (p) => p.brief.product_name === value.product_name,
                ) === -1
                  ? ""
                  : String(
                      presets.findIndex(
                        (p) => p.brief.product_name === value.product_name,
                      ),
                    )
              }
              onChange={(e) => {
                if (e.target.value !== "")
                  onChange({ ...presets[Number(e.target.value)].brief });
              }}
            >
              <option value="" disabled>
                选择示例 Brief
              </option>
              {presets.map((p, i) => (
                <option key={p.label} value={i}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            产品名称
            <input
              required
              maxLength={100}
              value={value.product_name}
              onChange={(e) => set("product_name", e.target.value)}
              placeholder="产品名称"
            />
          </label>
          <label>
            产品类型
            <select
              value={value.product_type}
              onChange={(e) => set("product_type", e.target.value)}
            >
              {["AI 相机 App", "语言学习 App", "休闲游戏", "AI 效率工具"].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
          </label>
          <label>
            目标国家 / 地区
            <input
              required
              maxLength={200}
              value={value.target_region}
              onChange={(e) => set("target_region", e.target.value)}
              placeholder="例如：泰国、印尼"
            />
          </label>
          <label>
            目标用户
            <textarea
              required
              rows={2}
              maxLength={2000}
              value={value.target_users}
              onChange={(e) => set("target_users", e.target.value)}
            />
          </label>
          <label>
            营销目标
            <textarea
              required
              rows={2}
              maxLength={2000}
              value={value.marketing_goal}
              onChange={(e) => set("marketing_goal", e.target.value)}
            />
          </label>
          <div className="field-pair">
            <label>
              投放平台
              <input
                value={value.platforms}
                maxLength={2000}
                onChange={(e) => set("platforms", e.target.value)}
              />
            </label>
            <label>
              预算（USD）
              <input
                value={value.budget_range}
                maxLength={2000}
                onChange={(e) => set("budget_range", e.target.value)}
              />
            </label>
          </div>
          <label>
            当前问题
            <textarea
              rows={3}
              maxLength={2000}
              value={value.current_challenges}
              onChange={(e) => set("current_challenges", e.target.value)}
            />
          </label>
          <details>
            <summary>
              <SlidersHorizontal size={14} />
              补充约束与数据场景
            </summary>
            <label>
              补充说明
              <textarea
                rows={3}
                maxLength={2000}
                value={value.additional_notes}
                onChange={(e) => set("additional_notes", e.target.value)}
              />
            </label>
            <label>
              合成投放场景
              <select
                value={value.scenario}
                onChange={(e) => set("scenario", e.target.value)}
              >
                <option value="leaky">转化流失</option>
                <option value="healthy">达到演示目标</option>
                <option value="empty">尚无样本</option>
              </select>
            </label>
          </details>
        </fieldset>
        <div className="form-action">
          {locked ? (
            <button
              type="button"
              className="button secondary full"
              disabled={busy}
              onClick={() => onNew(false)}
            >
              基于此 Brief 新建任务
              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              type="submit"
              className="button primary full"
              disabled={busy}
            >
              开始研究
              <ArrowRight size={16} />
            </button>
          )}
          <span className="micro">
            {locked ? "本次输入快照已保存" : "仅使用合成资料 · 不连接广告账户"}
          </span>
        </div>
      </form>
    </aside>
  );
}
