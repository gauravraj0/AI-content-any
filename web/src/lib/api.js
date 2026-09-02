// API client — everything goes through /api (Vite proxies to FastAPI).
const TOKEN_KEY = "nebula.token";

export const tokens = {
  get: () => {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
  },
  set: (t) => { try { localStorage.setItem(TOKEN_KEY, t || ""); } catch { /* private mode */ } },
  clear: () => tokens.set(""),
};

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function request(path, { method = "GET", body, raw = false, signal } = {}) {
  const headers = {};
  const token = tokens.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (raw) {
    if (!res.ok) throw new ApiError(`Request failed (${res.status})`, res.status);
    return res.text();
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { detail: text }; }
  if (!res.ok) {
    const detail = (data && (data.detail || data.message)) || `Request failed (${res.status})`;
    throw new ApiError(typeof detail === "string" ? detail : JSON.stringify(detail), res.status, data);
  }
  return data;
}

export const api = {
  health: () => request("/api/health"),
  meta: () => request("/api/meta"),

  // auth
  demoLogin: () => request("/api/auth/demo", { method: "POST" }),
  login: (email, password) => request("/api/auth/login", { method: "POST", body: { email, password } }),
  register: (payload) => request("/api/auth/register", { method: "POST", body: payload }),
  me: () => request("/api/me"),

  // workspaces
  workspaces: () => request("/api/workspaces"),
  createWorkspace: (body) => request("/api/workspaces", { method: "POST", body }),
  patchWorkspace: (id, body) => request(`/api/workspaces/${id}`, { method: "PATCH", body }),
  deleteWorkspace: (id) => request(`/api/workspaces/${id}`, { method: "DELETE" }),

  // generation
  estimate: (body) => request("/api/generate/estimate", { method: "POST", body }),
  generate: (body) => request("/api/generate", { method: "POST", body }),
  generateImage: (body) => request("/api/generate/image", { method: "POST", body }),

  // documents
  documents: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null));
    return request(`/api/documents?${q}`);
  },
  document: (id) => request(`/api/documents/${id}`),
  patchDocument: (id, body) => request(`/api/documents/${id}`, { method: "PATCH", body }),
  deleteDocument: (id) => request(`/api/documents/${id}`, { method: "DELETE" }),
  createDocument: (body) => request("/api/documents", { method: "POST", body }),
  savePrompt: (id, body) => request(`/api/documents/${id}/save-prompt`, { method: "POST", body: body || {} }),

  // library
  templates: (params = {}) => request(`/api/templates?${new URLSearchParams(params)}`),
  useTemplate: (id, workspaceId) => request(`/api/templates/${id}/use?workspace_id=${workspaceId || ""}`, { method: "POST" }),
  prompts: (params = {}) => request(`/api/prompts?${new URLSearchParams(params)}`),
  createPrompt: (body) => request("/api/prompts", { method: "POST", body }),
  deletePrompt: (id) => request(`/api/prompts/${id}`, { method: "DELETE" }),
  runPrompt: (id, vars) => request(`/api/prompts/${id}/run`, { method: "POST", body: { vars } }),

  // analytics + billing
  usage: (days = 30) => request(`/api/analytics/usage?days=${days}`),
  plans: () => request("/api/billing/plans"),
  subscription: () => request("/api/billing/subscription"),
  subscribe: (plan_id, cycle = "monthly") => request("/api/billing/subscribe", { method: "POST", body: { plan_id, cycle } }),
  cancel: () => request("/api/billing/cancel", { method: "POST" }),
  resetDemo: () => request("/api/demo/reset", { method: "POST" }),
  analyticsCsvUrl: () => "/api/analytics/export",

  // exports
  exportUrl: (id, format) => `/api/export/${id}?format=${format}`,
  exportText: (id, format) => request(`/api/export/${id}?format=${format}`, { raw: true }),
  exportBatch: (ids, format) => request("/api/export/batch", { method: "POST", body: { ids, format } }),
};

export function downloadText(filename, text, mime = "text/plain") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function downloadFile(url, filename) {
  const res = await fetch(url, { headers: tokens.get() ? { Authorization: `Bearer ${tokens.get()}` } : {} });
  if (!res.ok) throw new ApiError("Download failed", res.status);
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1500);
}

export async function copyText(text) {
  // navigator.clipboard only exists on secure origins, and its write can still be
  // rejected (permissions, hidden tab). Fall back to a legacy copy, then report honestly.
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = typeof document.execCommand === "function" ? document.execCommand("copy") : false;
    ta.remove();
    return !!ok;
  } catch {
    return false;
  }
}

/** SVG -> PNG on a canvas, so generated art downloads like a real image. */
export function svgToPng(url, targetWidth = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const ratio = (img.height || 1) / (img.width || 1);
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = Math.round(targetWidth * ratio);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#06070d";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))), "image/png");
    };
    img.onerror = () => reject(new Error("Could not rasterise this asset"));
    img.src = url;
  });
}

export const timeAgo = (ts) => {
  if (!ts) return "";
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
export const nf = (n) => (typeof n === "number" ? n.toLocaleString() : n);
