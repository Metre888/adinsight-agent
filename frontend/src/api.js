const BASE = import.meta.env.VITE_API_BASE_URL || "";
export async function request(path, options = {}) {
  const response = await fetch(BASE + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const detail = Array.isArray(data.detail)
      ? data.detail.map((e) => e.msg).join("；")
      : data.detail;
    throw new Error(detail || "服务暂时不可用，请检查后端连接。");
  }
  return response.json();
}
export const post = (path, body = {}) =>
  request(path, { method: "POST", body: JSON.stringify(body) });
export const endpoint = (path) => BASE + path;
export const getHealth = () => request("/api/health");
export const getKnowledge = () => request("/api/knowledge");
export const reviewCampaign = (data) => post("/api/review", data);
