// All third-party market data now goes through the backend proxy, which holds the
// API keys and applies short-lived caching. Nothing here contacts a vendor directly.

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "";

async function proxyRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}/api/market${path}`, {
    credentials: "include",
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...options.headers } : options.headers,
  });

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
    throw new Error(data?.detail || `Market request failed (HTTP ${response.status}).`);
  }
  return data;
}

/** Raw Response for call sites that inspect status/ok themselves. */
export const proxyFetch = (path, options = {}) =>
  fetch(`${API_BASE_URL}/api/market${path}`, { credentials: "include", ...options });

/** Mirrors the old axios response shape so call sites can keep reading `.data`. */
export const withCorsProxy = async (path, config = {}) => {
  if (config.method === "POST" || config.data) {
    const data = await proxyRequest(path, { method: "POST", body: JSON.stringify(config.data ?? {}) });
    return { data };
  }
  return { data: await proxyRequest(path) };
};

export const fetchWithCors = async (path, options = {}) => proxyRequest(path, options);
