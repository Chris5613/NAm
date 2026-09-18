function formatTrx(value) {
  return `${Number(value || 0).toFixed(6)} TRX`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function setMessage(text, tone = "normal") {
  const el = document.getElementById("message");
  el.textContent = text || "";
  el.style.color = tone === "error" ? "#fca5a5" : tone === "ok" ? "#6ee7b7" : "#a1a1aa";
}

async function getStatus() {
  return chrome.runtime.sendMessage({ type: "GET_ROLLERCOIN_STATUS" });
}

function renderPayload(payload) {
  const total = payload?.total_trx ?? payload?.total_sol ?? 0;
  document.getElementById("totalValue").textContent = formatTrx(total);

  if (!payload) {
    document.getElementById("rangeText").textContent = "No sync yet";
    document.getElementById("lastSyncText").textContent = "";
    return;
  }

  const from = payload.from || "—";
  const to = payload.to || "—";
  const count = payload.rows?.length || 0;
  const sourceCurrency = payload.rollercoin_currency ? ` · ${payload.rollercoin_currency}` : "";
  document.getElementById("rangeText").textContent = `${from} → ${to} · ${count} day${count === 1 ? "" : "s"}${sourceCurrency}`;

  const syncedAt = payload.synced_at || payload.syncedAt;
  document.getElementById("lastSyncText").textContent = syncedAt
    ? `Last sync ${new Date(syncedAt).toLocaleString()}`
    : "";
}

async function refreshUI() {
  try {
    const status = await getStatus();
    const badge = document.getElementById("authBadge");

    if (status?.authenticated) {
      badge.textContent = "Auth connected";
      badge.className = "badge ok";
    } else {
      badge.textContent = "Open RollerCoin";
      badge.className = "badge";
    }

    renderPayload(status?.lastPayload || null);
  } catch (error) {
    setMessage(error.message || "Could not read extension status.", "error");
  }
}

document.getElementById("fromDate").value = monthStartKey();
document.getElementById("toDate").value = todayKey();

document.getElementById("syncBtn").addEventListener("click", async () => {
  const btn = document.getElementById("syncBtn");
  const from = document.getElementById("fromDate").value;
  const to = document.getElementById("toDate").value;

  if (!from || !to) {
    setMessage("Choose both dates first.", "error");
    return;
  }

  if (from > to) {
    setMessage("From date must be before To date.", "error");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Syncing…";
  setMessage("Reading RollerCoin earnings for this range…");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "SYNC_ROLLERCOIN_RANGE",
      from,
      to,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Sync failed.");
    }

    renderPayload(response.payload || null);
    setMessage("Sync complete. Open Project Income to import it.", "ok");
  } catch (error) {
    setMessage(error.message || "Sync failed. Keep RollerCoin open and refresh auth.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Sync earnings";
  }
});

document.getElementById("openBtn").addEventListener("click", async () => {
  await chrome.tabs.create({ url: "https://rollercoin.com/" });
});

refreshUI();
