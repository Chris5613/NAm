// Server-backed data access. Replaces direct localStorage reads/writes.
// `credentials: "include"` sends the httpOnly session cookie on every request.

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request(method, path, body) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Could not reach the server. Check that the backend is running.", 0);
  }

  const raw = await response.text();
  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(data?.detail || raw.slice(0, 200) || `Request failed (HTTP ${response.status}).`, response.status);
  }
  return data;
}

export const api = {
  get: (path) => request("GET", path),
  post: (path, body) => request("POST", path, body ?? {}),
  put: (path, body) => request("PUT", path, body ?? {}),
  patch: (path, body) => request("PATCH", path, body ?? {}),
  delete: (path) => request("DELETE", path),
};

export const authApi = {
  status: () => api.get("/api/auth/status"),
  me: () => api.get("/api/auth/me"),
  login: (username, password) => api.post("/api/auth/login", { username, password }),
  setup: (username, password) => api.post("/api/auth/setup", { username, password }),
  resetPassword: (username, securityAnswer, newPassword) => api.post("/api/auth/reset-password", {
    username,
    security_answer: securityAnswer,
    new_password: newPassword,
  }),
  logout: () => api.post("/api/auth/logout"),
};

export const resourceApi = {
  list: (name) => api.get(`/api/resources/${name}`),
  create: (name, record) => api.post(`/api/resources/${name}`, record),
  update: (name, id, record) => api.put(`/api/resources/${name}/${id}`, record),
  remove: (name, id) => api.delete(`/api/resources/${name}/${id}`),
  replaceAll: (name, records) => api.put(`/api/resources/${name}`, records),
};

export const settingsApi = {
  all: () => api.get("/api/settings"),
  get: (key) => api.get(`/api/settings/${key}`).then((row) => row?.value ?? null),
  set: (key, value) => api.put(`/api/settings/${key}`, { value }),
};

export const spendingApi = {
  accounts: () => api.get("/api/spending/accounts"),
  saveAccount: (account) => api.post("/api/spending/accounts", account),
  deleteAccount: (id) => api.delete(`/api/spending/accounts/${id}`),
  transactions: () => api.get("/api/spending/transactions"),
  saveTransaction: (transaction) => api.post("/api/spending/transactions", transaction),
  patchTransaction: (id, changes) => api.patch(`/api/spending/transactions/${id}`, changes),
  deleteTransaction: (id) => api.delete(`/api/spending/transactions/${id}`),
  getBudget: () => api.get("/api/spending/budget").then((row) => row?.budget ?? 0),
  setBudget: (budget) => api.put("/api/spending/budget", { budget }),
};

export const migrationApi = {
  status: () => api.get("/api/migration/status"),
  importDump: (dump) => api.post("/api/migration/import", dump),
};
