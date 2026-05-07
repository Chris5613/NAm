/**
 * Rollercoin Extension → Dashboard Bridge
 * 
 * This content script should be injected into the dashboard app (https://yourapp.com)
 * It listens to Chrome runtime messages from the extension background and posts them
 * to the dashboard page via window.postMessage in the expected format.
 * 
 * Add to your extension's manifest.json:
 * 
 * "content_scripts": [
 *   {
 *     "matches": ["https://yourapp.com/*"],
 *     "js": ["rollercoin-extension-bridge.js"],
 *     "run_at": "document_start"
 *   }
 * ]
 */

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "ROLLERCOIN_SYNC") {
    // Extract and normalize the extension payload
    const extPayload = msg.payload;
    
    if (!extPayload) {
      console.warn("[RC BRIDGE] Empty payload received");
      sendResponse({ ok: false, error: "No payload" });
      return;
    }

    // Transform extension format to dashboard format
    const normalizedPayload = {
      total_trx: extPayload.totalTrx || 0,
      today_trx: 0, // Extension doesn't track daily—would need API call or UI scraping
      balance_trx: 0, // Extension doesn't track balance—would need API call
      synced_at: extPayload.syncedAt || new Date().toISOString(),
    };

    // Post to the dashboard app
    try {
      window.postMessage(
        {
          source: "rollercoin-ext",
          type: "ROLLERCOIN_PUSH",
          payload: normalizedPayload,
        },
        window.location.origin
      );

      console.log("[RC BRIDGE] Posted to dashboard:", normalizedPayload);
      sendResponse({ ok: true });
    } catch (err) {
      console.error("[RC BRIDGE] Failed to post to dashboard:", err);
      sendResponse({ ok: false, error: err.message });
    }
  }

  if (msg?.type === "READY") {
    // Extension ready signal
    window.postMessage(
      {
        source: "rollercoin-ext",
        type: "READY",
      },
      window.location.origin
    );
    sendResponse({ ok: true });
  }
});

console.log("[RC BRIDGE] Content script loaded for Rollercoin extension");
