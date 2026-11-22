// Honeygain dashboard reader: JumpTask transferred credits ONLY.
// No API requests, cookies, tokens, or Honeygain balance are accessed.
// Works when Chrome opens the dashboard in an inactive tab.
const LABELS = [
  {regex:/^transferred to jumptask(?:\s*ⓘ)?\s*:?$/i,evidenceLabel:"transferred-to-jumptask"},
  {regex:/^jumptask (?:balance|credits)(?:\s*ⓘ)?\s*:?$/i,evidenceLabel:"jumptask-balance"},
];
let lastSignature = "";
const visible = el => {
  if (!el || !el.getClientRects().length) return false;
  const style = getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden";
};
function creditNumber(text) {
  const clean = String(text || "").replace(/\s+/g," ").trim();
  // Credit counts only, not a dollar amount, date, MB or marketing banner.
  if (/[$€£]|\b(?:MB|GB|USD|JMPT)\b/i.test(clean)) return null;
  const match = clean.match(/^([0-9][\d,]*(?:\.\d+)?)(?:\s*(?:credits?|🍯))?$/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g,""));
  return Number.isFinite(amount) && amount >= 0 && amount <= 10000000
    ? amount : null;
}
function isLabel(el) {
  if (!visible(el) || (el.textContent || "").length > 95) return null;
  const text = (el.textContent || "").replace(/\s+/g," ").trim();
  // A short element containing the label and an informational SVG icon is OK.
  const label = LABELS.find(item => item.regex.test(text));
  if (!label) return null;
  // Avoid selecting a large parent when a smaller descendant carries the label.
  for (const child of el.children) {
    if ((child.textContent || "").trim() === text && visible(child)) return null;
  }
  return label;
}
function locateCredits(labelEl) {
  const rect = labelEl.getBoundingClientRect();
  // The value appears as its own element BELOW the label in Honeygain's
  // JumpTask wallet panel (e.g., label then '31.76' on the next line).
  for (let ancestor = labelEl.parentElement, depth = 0;
       ancestor && depth < 5; ancestor = ancestor.parentElement, depth++) {
    if (!visible(ancestor)) continue;
    const candidates = [];
    const nodes = ancestor.querySelectorAll("span,div,p,strong,b,h1,h2,h3,h4,dd");
    for (const el of nodes) {
      if (!visible(el) || el === labelEl || el.contains(labelEl)) continue;
      if (el.children.length && [...el.children].some(child => visible(child) &&
          creditNumber(child.textContent) !== null)) continue;
      const amount = creditNumber(el.textContent);
      if (amount === null) continue;
      const b = el.getBoundingClientRect();
      const dx = Math.abs(b.left - rect.left);
      const dy = b.top - rect.bottom;
      // Allow a nearby value slightly above the caption, but prioritize below.
      if (dx > 170 || dy < -75 || dy > 105) continue;
      candidates.push({amount,score: Math.abs(dy) + dx * 0.2 +
        (dy < -2 ? 25 : 0)});
    }
    candidates.sort((a,b) => a.score - b.score);
    if (candidates.length && (candidates.length === 1 ||
        candidates[1].score - candidates[0].score > 24)) return candidates[0].amount;
    // If candidates tie, don't guess: wait for a cleaner label/value pairing.
    if (candidates.length) return null;
  }
  return null;
}
function extract() {
  const nodes = document.querySelectorAll("span,div,p,strong,b,h1,h2,h3,h4,dt,dd,td,small,label");
  for (const el of nodes) {
    const match = isLabel(el);
    if (!match) continue;
    const amount = locateCredits(el);
    if (amount !== null) return {
      jumpTaskBalanceCredits:amount,
      evidenceLabel:match.evidenceLabel,
      observedAt:new Date().toISOString(),
    };
  }
  return null;
}
function sample() {
  const reading = extract();
  if (!reading) {
    chrome.runtime.sendMessage({
      type:"HONEYGAIN_PARSE_ERROR",
      error:"JumpTask label found but no unambiguous nearby credits, or dashboard not loaded. Regular Honeygain credits are ignored.",
    }).catch(()=>{});
    return;
  }
  const sig = reading.evidenceLabel + ":" + reading.jumpTaskBalanceCredits;
  if (sig === lastSignature) return;
  lastSignature = sig;
  chrome.runtime.sendMessage({type:"HONEYGAIN_READING",reading})
    .catch(()=>{lastSignature="";});
}
chrome.runtime.onMessage.addListener(message => {
  if (message?.type === "HONEYGAIN_SAMPLE_NOW") sample();
});
sample();
// Short retries allow an inactive tab to finish loading; the background
// service worker schedules the next run 5 minutes later.
let attempts = 0;
const retry = setInterval(() => {
  sample();
  if (++attempts >= 35) clearInterval(retry);
},1000);
document.addEventListener("visibilitychange",sample);
