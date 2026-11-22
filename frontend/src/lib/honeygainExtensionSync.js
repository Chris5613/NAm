import { api } from "@/lib/apiClient";

// Install once on the signed-in NAm shell, regardless of the visible page.
// The extension delivers only labeled daily credits from Honeygain's DOM.
let installed = false;
let inFlight = false;
let latestAccepted = "";

function signature(reading) {
  return [reading.day, reading.todayCredits, reading.evidenceLabel].join(":");
}

async function onReading(event) {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data;
  if (data?.source !== "nam-honeygain-extension" || data?.type !== "HONEYGAIN_READING") return;
  const reading = data.reading;
  if (!reading || !Number.isFinite(reading.todayCredits) || reading.todayCredits < 0 ||
      !["earned-today", "today-earnings"].includes(reading.evidenceLabel)) return;
  const sig = signature(reading);
  if (inFlight || latestAccepted === sig) {
    if (latestAccepted === sig) acknowledge(sig);
    return;
  }
  inFlight = true;
  try {
    await api.post("/api/honeygain/browser-ingest", {
      source:"honeygain-dashboard-visible",
      evidenceLabel:reading.evidenceLabel,
      day:reading.day,
      todayCredits:reading.todayCredits,
    });
    latestAccepted = sig;
    window.dispatchEvent(new Event("nam-honeygain-updated"));
    acknowledge(sig);
  } catch (error) {
    console.warn("Honeygain reading was not saved:",error?.message);
  } finally {
    inFlight = false;
  }
}

function acknowledge(sig) {
  window.postMessage({
    source:"nam-honeygain-app",
    type:"SAVED",
    signature:sig,
  },window.location.origin);
}

export function installHoneygainExtensionListener() {
  if (installed) return;
  installed = true;
  window.addEventListener("message",onReading);
  const request = () => window.postMessage({
    source:"nam-honeygain-app",type:"REQUEST_LATEST",
  },window.location.origin);
  request();
  window.setTimeout(request,1500);
}
