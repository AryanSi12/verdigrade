// Thin client for the agent's /v1/channels/migrate routes (proxied by Vite in dev).
const BASE = "/v1/channels/migrate";
import { KEYS, readStored, writeStored } from "./storage.js";


export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export function getToken() {
  return readStored(KEYS.token) || "";
}

export function setToken(token) {
  writeStored(KEYS.token, token);
}

/** Fired when the server answers 401 so the shell can ask for VERDIGRADE_TOKEN. */
export const AUTH_EVENT = "leapfrog-auth-required";

async function request(path, { method = "GET", body, as = "json", signal } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError("The agent server is not reachable. Start it with `npm run dev` in agent/ (port 3000).", 0, null);
  }
  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent(AUTH_EVENT));
    throw new ApiError("The agent server needs an access token (VERDIGRADE_TOKEN).", 401, null);
  }
  if (as === "text") {
    const text = await response.text();
    if (!response.ok) throw new ApiError(text || `Request failed (${response.status}).`, response.status, text);
    return { text, truncated: response.headers.get("x-truncated") === "true" };
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(data?.error || data?.message || `Request failed (${response.status}).`, response.status, data);
  }
  return data;
}

const encode = encodeURIComponent;

export const api = {
  config: (signal) => request("/config", { signal }),
  matrix: (signal, ecosystem = "java") => request(`/matrix?ecosystem=${encode(ecosystem)}`, { signal }),
  cloneGithub: (body) => request("/github/clone", { method: "POST", body }),
  createPlan: (body) => request("/plan", { method: "POST", body }),
  createPlanAsync: (body) => request("/plan", { method: "POST", body: { ...body, async: true } }),
  planJob: (jobId, signal) => request(`/plan-jobs/${encode(jobId)}`, { signal }),
  recheckPlan: (id) => request(`/plans/${encode(id)}/recheck`, { method: "POST", body: {} }),
  aiStatus: (signal) => request("/ai/status", { signal }),
  aiFix: (id, itemIds, scope) => request(`/plans/${encode(id)}/ai-fix`, { method: "POST", body: itemIds ? { itemIds } : scope ? { scope } : {} }),
  keepAiFix: (id, fixId) => request(`/plans/${encode(id)}/ai-fix/${encode(fixId)}/keep`, { method: "POST", body: {} }),
  refactorQuiz: (id, body = {}) => request(`/plans/${encode(id)}/refactor-quiz`, { method: "POST", body }),
  saveRefactorQuiz: (id, body) => request(`/plans/${encode(id)}/refactor-quiz`, { method: "PUT", body }),
  undoAiFix: (id, fixId) => request(`/plans/${encode(id)}/ai-fix/${encode(fixId)}/undo`, { method: "POST", body: {} }),
  plans: (signal, limit = 50) => request(`/plans?limit=${limit}`, { signal }),
  plan: (id, signal) => request(`/plans/${encode(id)}`, { signal }),
  updatePlan: (id, body) => request(`/plans/${encode(id)}`, { method: "PUT", body }),
  approvePlan: (id, body) => request(`/plans/${encode(id)}/approve`, { method: "POST", body }),
  planImpact: (id, body, signal) => request(`/plans/${encode(id)}/impact`, { method: "POST", body, signal }),
  samples: (signal) => request("/samples", { signal }),
  browse: (path, signal) => request(`/browse?path=${encode(path || "")}`, { signal }),
  resolve: (body, signal) => request("/resolve", { method: "POST", body, signal }),
  start: (body) => request("/start", { method: "POST", body }),
  run: (runId, signal) => request(`/runs/${encode(runId)}`, { signal }),
  log: (runId, step, signal) => request(`/runs/${encode(runId)}/log?step=${encode(step)}`, { as: "text", signal }),
  diff: (runId, signal) => request(`/runs/${encode(runId)}/diff`, { as: "text", signal }),
  reportJson: (runId, signal) => request(`/runs/${encode(runId)}/report?format=json`, { as: "text", signal }),
  report: (runId, signal) => request(`/runs/${encode(runId)}/report?format=md`, { as: "text", signal }),
  cancel: (runId) => request(`/runs/${encode(runId)}/cancel`, { method: "POST", body: {} }),
  rollback: (runId) => request(`/runs/${encode(runId)}/rollback`, { method: "POST", body: {} }),
  preview: (runId, signal) => request(`/runs/${encode(runId)}/preview`, { signal }),
  previewStart: (runId, side = "both", useAvailableRuntime = false) => request(`/runs/${encode(runId)}/preview/start`, { method: "POST", body: { side, ...(useAvailableRuntime ? { useAvailableRuntime: true } : {}) } }),
  previewStop: (runId, side = "both") => request(`/runs/${encode(runId)}/preview/stop`, { method: "POST", body: { side } }),
  previewFetch: (runId, path, headers) => request(`/runs/${encode(runId)}/preview/fetch`, { method: "POST", body: { path, ...(headers ? { headers } : {}) } }),
  compare: (body) => request("/compare", { method: "POST", body }),
  comparison: (id, signal) => request(`/comparisons/${encode(id)}`, { signal }),
  comparisons: (signal, limit = 20) => request(`/comparisons?limit=${limit}`, { signal }),
  comparisonReport: (id, format = "md") => request(`/comparisons/${encode(id)}/report?format=${format}`, { as: "text" }),
  cancelComparison: (id) => request(`/comparisons/${encode(id)}/cancel`, { method: "POST", body: {} }),
  history: ({ limit = 50, offset = 0 } = {}, signal) => request(`/history?limit=${limit}&offset=${offset}`, { signal }),
};
