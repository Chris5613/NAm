function push(message) {
  if (message?.type !== "NAm_HONEYGAIN_READING") return;
  const reading = message.reading;
  if (reading && Number.isFinite(reading.jumpTaskBalanceCredits) && reading.jumpTaskBalanceCredits >= 0)
    window.postMessage({source:"nam-honeygain-extension",type:"HONEYGAIN_READING",reading}, location.origin);
}
chrome.runtime.onMessage.addListener(message => { push(message); });
chrome.runtime.sendMessage({type:"NAm_HONEYGAIN_READY"}).catch(() => {});
window.addEventListener("message", event => {
  if (event.source === window && event.origin === location.origin &&
      event.data?.source === "nam-honeygain-app" &&
      event.data?.type === "SAVED" && typeof event.data.signature === "string") {
    chrome.runtime.sendMessage({type:"NAm_HONEYGAIN_SAVED",signature:event.data.signature}).catch(()=>{});
  }

  if (event.source === window && event.origin === location.origin &&
      event.data?.source === "nam-honeygain-app" && event.data.type === "REQUEST_LATEST") {
    chrome.runtime.sendMessage({type:"NAm_HONEYGAIN_READY"}).catch(() => {});
  }

  // NAm's main Passive Income refresh requests a NEW Honeygain observation
  // alongside Salad, Kryptex, Unetwork, etc. This is not a cached resend.
  if (event.source === window && event.origin === location.origin &&
      event.data?.source === "nam-honeygain-app" &&
      event.data.type === "REFRESH_WITH_PROJECTS") {
    chrome.runtime.sendMessage({type:"HONEYGAIN_POLL_NOW"}).catch(() => {});
  }
});
