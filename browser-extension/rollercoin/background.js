// Reload an already-open RollerCoin tab every 10 minutes. No tab is opened
// automatically, and the extension's existing content scripts resume after reload.
const ROLLERCOIN_RELOAD_ALARM = "rollercoin-tab-reload";
const ROLLERCOIN_RELOAD_MINUTES = 10;

async function ensureRollerCoinReloadAlarm() {
  const alarm = await chrome.alarms.get(ROLLERCOIN_RELOAD_ALARM);
  if (!alarm) {
    await chrome.alarms.create(ROLLERCOIN_RELOAD_ALARM, {
      periodInMinutes: ROLLERCOIN_RELOAD_MINUTES,
    });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureRollerCoinReloadAlarm().catch(console.error);
});
chrome.runtime.onStartup.addListener(() => {
  ensureRollerCoinReloadAlarm().catch(console.error);
});
ensureRollerCoinReloadAlarm().catch(console.error);

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ROLLERCOIN_RELOAD_ALARM) return;
  try {
    const tab = await getRollerCoinTab();
    if (tab?.id != null) {
      await chrome.tabs.reload(tab.id);
      console.log("[RC BG] Automatically reloaded RollerCoin tab");
    }
  } catch (error) {
    console.warn("[RC BG] Automatic RollerCoin reload failed:", error);
  }
});

let latestRollercoinPayload = null;

async function getRollerCoinTab() {
  const tabs = await chrome.tabs.query({
    url: ["*://rollercoin.com/*", "*://www.rollercoin.com/*"],
  });
  return tabs[0] || null;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "ROLLERCOIN_SYNC") {
    latestRollercoinPayload = msg.payload;
    chrome.storage.local.set({ rcLastPayload: msg.payload });
    console.log("[RC BG] Stored RollerCoin payload");
    sendResponse({ ok: true });
    return true;
  }

  if (msg?.type === "GET_ROLLERCOIN_SYNC") {
    chrome.storage.local.get(["rcLastPayload"], (result) => {
      sendResponse({
        ok: true,
        payload: result.rcLastPayload || latestRollercoinPayload || null,
      });
    });
    return true;
  }

  if (msg?.type === "GET_ROLLERCOIN_STATUS") {
    Promise.all([
      chrome.storage.local.get(["rcAuthToken", "rcLastPayload"]),
      getRollerCoinTab(),
    ])
      .then(([stored, tab]) => {
        sendResponse({
          ok: true,
          authenticated: Boolean(stored.rcAuthToken),
          rollercoinOpen: Boolean(tab),
          lastPayload: stored.rcLastPayload || null,
        });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (msg?.type === "SYNC_ROLLERCOIN_RANGE") {
    const from = String(msg.from || "");
    const to = String(msg.to || "");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      sendResponse({ ok: false, error: "Invalid date range." });
      return true;
    }

    if (from > to) {
      sendResponse({ ok: false, error: "From date must be before the To date." });
      return true;
    }

    getRollerCoinTab()
      .then((tab) => {
        if (!tab?.id) {
          throw new Error("Open RollerCoin in a tab first so the extension can sync.");
        }

        return chrome.tabs.sendMessage(tab.id, {
          type: "SYNC_RANGE",
          from,
          to,
        });
      })
      .then((response) => {
        if (!response?.ok) {
          throw new Error(response?.error || "RollerCoin sync failed.");
        }

        latestRollercoinPayload = response.payload || null;

        if (response.payload) {
          return chrome.storage.local
            .set({ rcLastPayload: response.payload })
            .then(() => response);
        }

        return response;
      })
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }
});
