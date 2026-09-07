export default function MetricCard({ label, value, target, warning }) {
  return (
    <div className={"metric-cell" + (warning ? " warning" : "")}>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <span className="micro">{target}</span>
    </div>
  );
}
