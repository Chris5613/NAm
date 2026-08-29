// Bridges chrome.storage.local (written by background.js) to the page via
// window.postMessage, mirroring the RollerCoin/Unity Nodes extension bridges
// already used by this dashboard.
(function () {
  "use strict";

  const STORAGE_KEY = "kryptex_latest";
  const EXT_SOURCE = "kryptex-tracker-ext";
  const APP_SOURCE = "kryptex-tracker-app";

  function pushLatest() {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const payload = result[STORAGE_KEY];
      if (!payload || !payload.reachable) return;
      window.postMessage({ source: EXT_SOURCE, type: "KRYPTEX_PUSH", payload }, window.location.origin);
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== APP_SOURCE) return;
    if (event.data?.type === "REQUEST_LATEST") pushLatest();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[STORAGE_KEY]) return;
    pushLatest();
  });

  window.postMessage({ source: EXT_SOURCE, type: "READY" }, window.location.origin);
  pushLatest();
})();
