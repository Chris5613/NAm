const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "";
const PLAID_SCRIPT_URL = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

async function request(path, body) {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Plaid request failed.");
  return data;
}

function loadPlaidScript() {
  if (window.Plaid) return Promise.resolve(window.Plaid);
  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${PLAID_SCRIPT_URL}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.Plaid), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Could not load Plaid Link.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = PLAID_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve(window.Plaid);
    script.onerror = () => reject(new Error("Could not load Plaid Link."));
    document.head.appendChild(script);
  });
}

export const plaidApi = {
  async openLink(clientUserId, onSuccess) {
    const [{ link_token: linkToken }, Plaid] = await Promise.all([
      request("/api/plaid/link-token", { client_user_id: clientUserId }),
      loadPlaidScript(),
    ]);
    const handler = Plaid.create({ token: linkToken, onSuccess });
    handler.open();
  },
  exchangePublicToken: (publicToken) => request("/api/plaid/exchange-public-token", { public_token: publicToken }),
  syncTransactions: (itemId) => request("/api/plaid/sync-transactions", { item_id: itemId }),
};