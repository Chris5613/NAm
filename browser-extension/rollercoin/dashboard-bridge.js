function postToDashboard(type, payload = null, extra = {}) {
  window.postMessage(
    {
      source: "rollercoin-ext",
      type,
      payload,
      ...extra,
    },
    window.location.origin
  );
}

async function getStatus() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "GET_ROLLERCOIN_STATUS",
    });

    postToDashboard("ROLLERCOIN_STATUS", response || null);
  } catch (error) {
    postToDashboard("ROLLERCOIN_STATUS", {
      ok: false,
      error: error.message,
    });
  }
}

window.addEventListener("message", async (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.source !== window) return;

  const data = event.data;

  if (
    data?.source === "rollercoin-app" &&
    data?.type === "REQUEST_POWER_BY_USERNAME"
  ) {
    try {
      const { rcPowerPayload } = await chrome.storage.local.get(["rcPowerPayload"]);
      if (!rcPowerPayload) return;

      localStorage.setItem(
        "rollercoin:extension-state",
        JSON.stringify({
          power_payload: rcPowerPayload,
          power_last_seen_at: new Date().toISOString(),
        })
      );

      window.dispatchEvent(
        new CustomEvent("rollercoin-power-update", { detail: rcPowerPayload })
      );
    } catch (error) {
      console.error("[RC BRIDGE] Failed to load stored power:", error);
    }
    return;
  }

  if (
    data?.source === "rollercoin-ext" &&
    data?.type === "ROLLERCOIN_POWER_PUSH"
  ) {
    try {
      localStorage.setItem(
        "rollercoin:extension-state",
        JSON.stringify({
          power_payload: data.payload,
          power_last_seen_at: new Date().toISOString(),
        })
      );

      window.dispatchEvent(
        new CustomEvent("rollercoin-power-update", { detail: data.payload })
      );
    } catch (error) {
      console.error("[RC BRIDGE] Failed to save power payload:", error);
    }
    return;
  }

  if (data?.source === "rollercoin-app" && data?.type === "REQUEST_LATEST") {
    try {
      const { rcLastPayload } = await chrome.storage.local.get(["rcLastPayload"]);
      postToDashboard("ROLLERCOIN_PUSH", rcLastPayload || null);
    } catch (error) {
      postToDashboard("ROLLERCOIN_ERROR", null, { error: error.message });
    }
    return;
  }

  if (data?.source === "rollercoin-app" && data?.type === "REQUEST_STATUS") {
    await getStatus();
    return;
  }

  if (data?.source === "rollercoin-app" && data?.type === "SYNC_RANGE") {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "SYNC_ROLLERCOIN_RANGE",
        from: data.from,
        to: data.to,
      });

      if (!response?.ok) {
        throw new Error(response?.error || "RollerCoin sync failed.");
      }

      postToDashboard("ROLLERCOIN_SYNC_RESULT", response.payload || null, {
        from: data.from,
        to: data.to,
      });

      window.dispatchEvent(
        new CustomEvent("rollercoin-sync-complete", {
          detail: response.payload || null,
        })
      );
    } catch (error) {
      postToDashboard("ROLLERCOIN_SYNC_ERROR", null, {
        error: error.message,
        from: data.from,
        to: data.to,
      });
    }
  }
});

setTimeout(() => {
  postToDashboard("READY");
  getStatus();
}, 300);
