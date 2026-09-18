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
