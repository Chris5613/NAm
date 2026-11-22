function push(message) {
  if (message?.type !== "NAm_HONEYGAIN_READING") return;
  const reading = message.reading;
  if (reading && Number.isFinite(reading.todayCredits) && reading.todayCredits >= 0)
    window.postMessage({source:"nam-honeygain-extension",type:"HONEYGAIN_READING",reading}, location.origin);
}
chrome.runtime.onMessage.addListener(message => { push(message); });
chrome.runtime.sendMessage({type:"NAm_HONEYGAIN_READY"}).catch(() => {});
window.addEventListener("message", event => {
  if (event.source === window && event.origin === location.origin &&
      event.data?.source === "nam-honeygain-app" && event.data.type === "REQUEST_LATEST") {
    chrome.runtime.sendMessage({type:"NAm_HONEYGAIN_READY"}).catch(() => {});
  }
});
