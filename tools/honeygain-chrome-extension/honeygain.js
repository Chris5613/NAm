// Read ONLY explicitly labeled JumpTask balance/transfer credits from the
// signed-in Honeygain dashboard DOM. Never count Honeygain-mode earnings.
// We do not access Honeygain credentials, cookies or undocumented endpoints.
const LABELS = [
  {regex:/^transferred to jumptask\s*:?$/i,evidenceLabel:"transferred-to-jumptask"},
  {regex:/^jumptask (?:balance|credits)\s*:?$/i,evidenceLabel:"jumptask-balance"},
];
let lastSignature = "";
const visible = el => {
  if (!el?.getClientRects()?.length) return false;
  const style = getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none";
};
function parseCredits(text) {
  // "8.88", "8.88 credits" or "8.88 🍯", not "$8.88" or "188 MB".
  const clean = String(text || "").trim().replace(/\s+/g, " ");
  const match = clean.match(/^(?:credits?\s*:?)?\s*([0-9][0-9,]*(?:\.[0-9]+)?)(?:\s*(?:credits?|🍯))?$/i);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g,""));
  return Number.isFinite(value) && value >= 0 && value <= 10000000 ? value : null;
}
function extract() {
  const nodes = document.querySelectorAll("span,div,p,h1,h2,h3,h4,dt,dd,td,strong,small,label");
  for (const node of nodes) {
    if (!visible(node) || node.children.length > 1 || (node.textContent || "").length > 70) continue;
    const label = (node.textContent || "").trim().replace(/\s+/g," ");
    const matched = LABELS.find(rule => rule.regex.test(label));
    if (!matched) continue;
    // The Honeygain desktop-like card can show value ABOVE its label.
    // Restrict to a short, visible, compact card so we don't read other balances.
    for (const parent of [node.parentElement,node.parentElement?.parentElement]) {
      if (!parent || !visible(parent)) continue;
      const text = (parent.innerText || "").trim().replace(/\s+/g," ");
      if (text.length > 135) continue;
      const withoutLabel = text.replace(label," ").trim();
      // Only one numeric value should remain after removing the label.
      // A large unrelated card, USD conversion, or multiple values is ambiguous.
      const value = parseCredits(withoutLabel);
      if (value === null) continue;
      return {
        jumpTaskBalanceCredits:value,
        evidenceLabel:matched.evidenceLabel,
        observedAt:new Date().toISOString(),
      };
    }
  }
  return null;
}
function sample() {
  const reading = extract();
  if (!reading) {
    chrome.runtime.sendMessage({
      type:"HONEYGAIN_PARSE_ERROR",
      error:"No labeled JumpTask balance / transferred credits found. Honeygain earnings are intentionally ignored.",
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
let attempts = 0;
const retry = setInterval(() => {
  sample();
  if (++attempts >= 35) clearInterval(retry);
}, 1000);
document.addEventListener("visibilitychange",sample);
