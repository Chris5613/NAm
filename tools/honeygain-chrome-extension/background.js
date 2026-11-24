// Chrome MV3 periodic background-tab poll. No Honeygain token or cookie access.
const HG_URL = "https://dashboard.honeygain.com/";
const NAM_URL = "https://nam-qyn8.onrender.com/";
const PERIOD_MINUTES = 5;
const MAX_HG_OPEN_MS = 45000;
const MAX_NAM_OPEN_MS = 60000;
let honeygainManagedTab = null;
let namManagedTab = null;
let pendingSignature = "";
let waitingForSaved = false;
let lastPollStartedAt = 0;
const MIN_REQUEST_GAP_MS = 55_000; // One per main 60s refresh; 5-minute alarm is backup.

const hgOrigin = url => /^https:\/\/dashboard\.honeygain\.com(?:\/|$)/.test(url || "");
const namOrigin = url => /^https:\/\/nam-qyn8\.onrender\.com(?:\/|$)/.test(url || "");
const signature = r => [r.jumpTaskBalanceCredits,r.evidenceLabel].join(":");
async function closeOwned(tabId) {
  if (typeof tabId === "number") {
    try { await chrome.tabs.remove(tabId); } catch {}
  }
}
async function poll() {
  // Coalesce NAm refresh, visibility refresh, and the fallback alarm.
  // Never launch duplicate tabs or hammer Honeygain at 15s quick-refresh rates.
  if (honeygainManagedTab !== null ||
      Date.now() - lastPollStartedAt < MIN_REQUEST_GAP_MS) return;
  lastPollStartedAt = Date.now();
  // Never create duplicate dashboard tabs or close a user's own tab.
  const tabs = await chrome.tabs.query({url:HG_URL+"*"});
  if (tabs.length) {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, {type:"HONEYGAIN_SAMPLE_NOW"}).catch(() => {});
    }
    return;
  }
  const tab = await chrome.tabs.create({url: HG_URL, active:false});
  honeygainManagedTab = tab.id;
  setTimeout(async () => {
    if (honeygainManagedTab === tab.id) {
      honeygainManagedTab = null;
      await closeOwned(tab.id);
      chrome.storage.local.set({lastHoneygainError:"Honeygain dashboard did not expose a labeled JumpTask balance before the tab timeout."});
    }
  }, MAX_HG_OPEN_MS);
}
async function deliver(reading) {
  const tabs = await chrome.tabs.query({url:NAM_URL+"*"});
  if (tabs.length) {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, {type:"NAm_HONEYGAIN_READING",reading}).catch(()=>{});
    }
    return;
  }
  // The signed-in NAm tab is needed for cookie-authenticated ingestion.
  // Open it inactive only when a reading is ready; close only tabs we own.
  if (namManagedTab !== null) return;
  const tab = await chrome.tabs.create({url:NAM_URL,active:false});
  namManagedTab = tab.id;
  setTimeout(async () => {
    if (namManagedTab === tab.id) {
      namManagedTab = null;
      await closeOwned(tab.id);
      if (waitingForSaved) chrome.storage.local.set({lastHoneygainError:"NAm did not confirm saving this reading. Sign in to NAm, then reopen it."});
    }
  }, MAX_NAM_OPEN_MS);
}
async function setup() {
  await chrome.alarms.create("honeygain-five-minute-poll", {periodInMinutes:PERIOD_MINUTES});
  // Run the first reading immediately after extension installation / reload.
  await poll();
}
chrome.runtime.onInstalled.addListener(() => {setup().catch(()=>{});});
chrome.runtime.onStartup.addListener(() => {setup().catch(()=>{});});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === "honeygain-five-minute-poll") poll().catch(()=>{});
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === "HONEYGAIN_READING") {
    if (!hgOrigin(sender.tab?.url)) return;
    const reading = message.reading;
    if (!reading || !Number.isFinite(reading.jumpTaskBalanceCredits) || reading.jumpTaskBalanceCredits < 0 ||
        !["jumptask-balance","transferred-to-jumptask"].includes(reading.evidenceLabel)) return;
    // An extension-managed tab can be closed once parsed; user tabs remain.
    if (sender.tab?.id === honeygainManagedTab) {
      const id = honeygainManagedTab;
      honeygainManagedTab = null;
      closeOwned(id);
    }
    const sig = signature(reading);
    chrome.storage.local.set({lastHoneygainReading:reading,lastHoneygainError:null});
    pendingSignature = sig;
    waitingForSaved = true;
    deliver(reading).catch(()=>{});
    respond({ok:true});
    return;
  }
  if (message?.type === "HONEYGAIN_PARSE_ERROR") {
    if (!hgOrigin(sender.tab?.url)) return;
    chrome.storage.local.set({lastHoneygainError:message.error});
    return;
  }
  if (message?.type === "HONEYGAIN_POLL_NOW") {
    // Only NAm itself or the extension popup can request an on-demand poll.
    // A message relayed from an unrelated website is not an authorized sync.
    if (sender.tab && !namOrigin(sender.tab.url)) return;
    poll().catch(()=>{});
    respond({ok:true});
    return;
  }
  if (message?.type === "NAm_HONEYGAIN_READY") {
    if (!namOrigin(sender.tab?.url)) return;
    chrome.storage.local.get("lastHoneygainReading",({lastHoneygainReading}) => {
      if (lastHoneygainReading && sender.tab?.id != null)
        chrome.tabs.sendMessage(sender.tab.id, {type:"NAm_HONEYGAIN_READING",reading:lastHoneygainReading}).catch(()=>{});
    });
    return;
  }
  if (message?.type === "NAm_HONEYGAIN_SAVED") {
    if (!namOrigin(sender.tab?.url)) return;
    if (message.signature !== pendingSignature) return;
    waitingForSaved = false;
    chrome.storage.local.set({lastHoneygainSavedAt:new Date().toISOString(),lastHoneygainError:null});
    if (sender.tab?.id === namManagedTab) {
      const id = namManagedTab;
      namManagedTab = null;
      closeOwned(id);
    }
  }
});
