const NAm = "https://nam-qyn8.onrender.com";
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === "HONEYGAIN_READING") {
    if (!sender.tab?.url?.startsWith("https://dashboard.honeygain.com/")) return;
    const reading = message.reading;
    if (!reading || !Number.isFinite(reading.todayCredits) || reading.todayCredits < 0 ||
        !["earned-today", "today-earnings"].includes(reading.evidenceLabel)) return;
    chrome.storage.local.set({ lastHoneygainReading: reading, lastHoneygainError: null });
    chrome.tabs.query({url: NAm + "/*"}, tabs => {
      for (const tab of tabs) chrome.tabs.sendMessage(tab.id, {type:"NAm_HONEYGAIN_READING", reading}).catch(() => {});
    });
    respond({ok:true});
    return;
  }
  if (message?.type === "HONEYGAIN_PARSE_ERROR") {
    if (!sender.tab?.url?.startsWith("https://dashboard.honeygain.com/")) return;
    chrome.storage.local.set({lastHoneygainError: message.error});
  }
  if (message?.type === "NAm_HONEYGAIN_READY") {
    if (!sender.tab?.url?.startsWith(NAm + "/")) return;
    chrome.storage.local.get("lastHoneygainReading", ({lastHoneygainReading}) => {
      if (lastHoneygainReading) chrome.tabs.sendMessage(sender.tab.id, {
        type:"NAm_HONEYGAIN_READING",reading:lastHoneygainReading,
      }).catch(() => {});
    });
  }
});
