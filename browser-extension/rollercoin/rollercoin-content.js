const API_URL = "https://rollercoin.com/api/profile/income-stats";
const TRX_SCALE = 1e10;
const CURRENCY_CANDIDATES = ["TRX_SMALL", "TRX", "TRON_SMALL", "TRON"];

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function scrapePowerTextValue(label) {
  const elements = [...document.querySelectorAll("*")];

  for (const el of elements) {
    const text = el.textContent?.trim();

    if (text === label) {
      const parent = el.parentElement;

      if (!parent) continue;

      const children = [...parent.children];
      const index = children.indexOf(el);

      if (index !== -1 && children[index + 1]) {
        return children[index + 1].textContent?.trim() || null;
      }

      const lines = parent.innerText.split("\n").map(t => t.trim()).filter(Boolean);
      const labelIndex = lines.indexOf(label);

      if (labelIndex !== -1 && lines[labelIndex + 1]) {
        return lines[labelIndex + 1];
      }
    }
  }

  return null;
}

function scrapeRollercoinPower() {
  const bonusPowerRaw = scrapePowerTextValue("Bonus Power");
  const hamsterBonusRaw = scrapePowerTextValue("Hamster Bonus Power");

  const powerPayload = {
    league: scrapePowerTextValue("League"),
    maxPower: scrapePowerTextValue("Maximum power"),
    currentPower: scrapePowerTextValue("Current power"),
    miners: scrapePowerTextValue("Miners"),
    bonusPower: bonusPowerRaw,
    bonusPercent:
      bonusPowerRaw?.match(/([+-]?\d+(?:\.\d+)?)%/)?.[1] || null,
    hamsterBonusPower: hamsterBonusRaw,
    hamsterBonusPercent:
      hamsterBonusRaw?.match(/([+-]?\d+(?:\.\d+)?)%/)?.[1] || null,
    rackBonus: scrapePowerTextValue("Rack Bonus"),
    games: scrapePowerTextValue("Games"),
    temporary: scrapePowerTextValue("Temporary"),
    synced_at: new Date().toISOString(),
  };

  const hasUsefulData =
    powerPayload.currentPower ||
    powerPayload.miners ||
    powerPayload.bonusPower;

  if (!hasUsefulData) {
    return null;
  }

  return powerPayload;
}

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function fetchUserPowerData(auth) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const csrf = readCookie("x-csrf");
  if (csrf) headers["csrf-token"] = csrf;

  if (auth) {
    headers.Authorization = auth.startsWith("Bearer ")
      ? auth
      : `Bearer ${auth}`;
  }

  const res = await fetch("https://rollercoin.com/api/profile/user-power-data", {
    method: "GET",
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(`user-power-data HTTP ${res.status}`);
  }

  return await res.json();
}

async function syncRollercoin(from = null, to = null) {
  const { rcAuthToken } = await chrome.storage.local.get(["rcAuthToken"]);

  if (!rcAuthToken) {
    throw new Error("No RollerCoin auth token found. Open RollerCoin once so the extension can capture it.");
  }

  const { payload, currency } = await fetchIncomeStats(rcAuthToken, from, to);
  const sourceRows = extractIncomeRows(payload);

  const rows = sourceRows
    .map((r) => {
      const { trx, raw } = getIncomeAmount(r, currency);

      const date =
        r.date ||
        r.created_at?.slice(0, 10) ||
        r.createdAt?.slice(0, 10) ||
        r.time?.slice(0, 10) ||
        getToday();

      return {
        date,
        raw,
        trx,
      };
    })
    .filter((row) => row.date && Number.isFinite(row.trx));

  const totalTrx = rows.reduce((sum, r) => sum + r.trx, 0);

  const todayTrx = rows
    .filter((r) => r.date === getToday())
    .reduce((sum, r) => sum + r.trx, 0);

  const syncPayload = {
    currency: "TRX",
    rollercoin_currency: currency,
    total_trx: totalTrx,
    today_trx: todayTrx,
    balance_trx: totalTrx,
    synced_at: new Date().toISOString(),
    from: from || getToday(),
    to: to || getToday(),
    rows,
  };

  await chrome.storage.local.set({
    rcLastPayload: syncPayload,
  });

  console.log("[RC EXT] RollerCoin TRX synced:", syncPayload);

  return syncPayload;
}

async function syncRollercoinPower() {
  const { rcAuthToken } = await chrome.storage.local.get(["rcAuthToken"]);

  try {
    const responseData = await fetchUserPowerData(rcAuthToken);

    const powerPayload = responseData?.data || responseData;

    await chrome.storage.local.set({
      rcPowerPayload: powerPayload,
    });

    console.log("[RC EXT] RollerCoin power synced:", powerPayload);

    return powerPayload;
  } catch (err) {
    console.error("[RC EXT] user-power-data failed:", err);
    return null;
  }
}

function extractIncomeRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.data?.rows)) return payload.data.rows;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data?.result)) return payload.data.result;
  return [];
}

function getIncomeAmount(row, currency) {
  const isSmallUnit = /_SMALL$/i.test(String(currency || ""));

  // When RollerCoin returns TRX_SMALL, the numeric values are SUN (the
  // smallest TRX unit). RollerCoin's TRX_SMALL income-stats values use a 1e10 internal scale.
  // Divide by 1e10 before displaying/storing them as normal TRX.
  if (isSmallUnit) {
    const rawCandidates = [
      row?.amount,
      row?.value_float,
      row?.value_usual,
      row?.income,
      row?.earned,
      row?.value,
    ];

    for (const value of rawCandidates) {
      const raw = Number(value);
      if (Number.isFinite(raw)) {
        return {
          trx: raw / TRX_SCALE,
          raw,
        };
      }
    }

    return { trx: 0, raw: 0 };
  }

  // For normal-unit TRX responses, prefer the display-value fields first.
  const displayCandidates = [
    row?.value_float,
    row?.value_usual,
    row?.income,
    row?.earned,
    row?.value,
    row?.amount,
  ];

  for (const value of displayCandidates) {
    const trx = Number(value);
    if (Number.isFinite(trx)) {
      return {
        trx,
        raw: trx * TRX_SCALE,
      };
    }
  }

  return { trx: 0, raw: 0 };
}

async function fetchIncomeStats(auth, requestedFrom = null, requestedTo = null) {
  const from = requestedFrom || getToday();
  const to = requestedTo || getToday();
  let lastError = null;

  for (const currency of CURRENCY_CANDIDATES) {
    const url =
      `${API_URL}?from=${encodeURIComponent(from)}` +
      `&to=${encodeURIComponent(to)}` +
      `&currency=${encodeURIComponent(currency)}`;

    const headers = {
      Accept: "application/json",
    };

    if (auth) {
      headers.Authorization = auth.startsWith("Bearer ")
        ? auth
        : `Bearer ${auth}`;
    }

    try {
      const res = await fetch(url, {
        method: "GET",
        headers,
        credentials: "include",
      });

      const text = await res.text();
      let payload = null;

      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = text;
      }

      if (!res.ok) {
        const detail =
          payload?.message ||
          payload?.error ||
          (typeof payload === "string" ? payload.slice(0, 180) : "") ||
          `HTTP ${res.status}`;
        lastError = new Error(`${currency}: ${detail}`);
        console.warn("[RC EXT] income-stats rejected currency", currency, res.status, payload);
        continue;
      }

      const rows = extractIncomeRows(payload);

      // A successful response is enough to identify the RollerCoin currency key,
      // even when this date range genuinely contains no earnings.
      console.log("[RC EXT] income-stats currency accepted:", currency, "rows:", rows.length);
      return { payload, currency };
    } catch (error) {
      lastError = error;
      console.warn("[RC EXT] income-stats request failed for", currency, error);
    }
  }

  throw lastError || new Error("RollerCoin rejected all TRX currency identifiers.");
}

window.addEventListener("message", async (event) => {
  if (event.origin !== window.location.origin) return;

  const data = event.data;

  if (
    !data ||
    data.source !== "rollercoin-page-sniffer" ||
    data.type !== "RC_AUTH_CAPTURED" ||
    !data.auth
  ) {
    return;
  }

  await chrome.storage.local.set({
    rcAuthToken: data.auth,
  });

  console.log("[RC EXT] Auth token captured and saved");
});

function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1];

    const normalized =
      payload.replace(/-/g, "+").replace(/_/g, "/");

    const padded = normalized.padEnd(
      normalized.length +
      ((4 - (normalized.length % 4)) % 4),
      "="
    );

    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function extractToken(value) {
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value);

    if (parsed && typeof parsed === "object") {
      if (typeof parsed.access_token === "string") return parsed.access_token;
      if (typeof parsed.token === "string") return parsed.token;
      if (typeof parsed.jwt === "string") return parsed.jwt;

      if (parsed.currentSession?.access_token) {
        return parsed.currentSession.access_token;
      }

      if (parsed.auth?.session?.access_token) {
        return parsed.auth.session.access_token;
      }

      if (parsed.session?.access_token) {
        return parsed.session.access_token;
      }
    }
  } catch {}

  const jwtMatch = value.match(
    /([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/
  );

  return jwtMatch ? jwtMatch[1] : null;
}

function isValidToken(token) {
  if (!token || typeof token !== "string") return false;

  const payload = decodeJwtPayload(token);
  if (!payload) return false;

  if (typeof payload.exp === "number") {
    return payload.exp >= Math.floor(Date.now() / 1000);
  }

  return true;
}

function findAuthTokensInStorage() {
  const tokens = [];

  function scanStore(store) {
    try {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        const value = store.getItem(key);
        if (!value) continue;

        const token = extractToken(value);
        if (!token || !isValidToken(token)) continue;

        if (!tokens.includes(token)) {
          tokens.push(token);
        }
      }
    } catch {}
  }

  scanStore(localStorage);
  scanStore(sessionStorage);

  return tokens;
}

let lastSentTokens = null;

async function sendTokenIfChanged() {
  const tokens = findAuthTokensInStorage();
  const normalized = JSON.stringify(tokens.sort());

  if (normalized === lastSentTokens) return;

  lastSentTokens = normalized;

  if (tokens.length > 0) {
    await chrome.storage.local.set({
      rcAuthToken: tokens[0],
      rcAuthTokens: tokens,
    });

    console.log("[RC EXT] Stored RollerCoin auth token from storage");
  } else {
    console.log("[RC EXT] No token found in storage yet");
  }
}


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "FORCE_SYNC") {
    console.log("[RC EXT] FORCE_SYNC received");

    syncRollercoin()
      .then((payload) => {
        sendResponse({ ok: true, payload });
      })
      .catch((err) => {
        console.error("[RC EXT] FORCE_SYNC failed:", err);
        sendResponse({ ok: false, error: err.message });
      });

    return true;
  }

  if (msg?.type === "SYNC_RANGE") {
    console.log("[RC EXT] SYNC_RANGE received", msg.from, msg.to);

    syncRollercoin(msg.from, msg.to)
      .then((payload) => {
        sendResponse({ ok: true, payload });
      })
      .catch((err) => {
        console.error("[RC EXT] SYNC_RANGE failed:", err);
        sendResponse({ ok: false, error: err.message || "RollerCoin sync failed." });
      });

    return true;
  }
});

function waitForPowerPanel() {
  const text = document.body?.innerText || "";

  if (
    text.includes("My power") ||
    text.includes("Maximum power") ||
    text.includes("Current power")
  ) {
    console.log("[RC EXT] Power panel detected");

    syncRollercoinPower();

    setInterval(() => {
      syncRollercoinPower();
    }, 30000);

    window.addEventListener("focus", () => {
      syncRollercoinPower();
    });

    return;
  }

  console.log("[RC EXT] Waiting for power panel...");

  setTimeout(waitForPowerPanel, 2000);
}

setTimeout(sendTokenIfChanged, 500);
setTimeout(sendTokenIfChanged, 2000);
setTimeout(sendTokenIfChanged, 5000);

setInterval(sendTokenIfChanged, 30000);

window.addEventListener("focus", sendTokenIfChanged);

waitForPowerPanel();