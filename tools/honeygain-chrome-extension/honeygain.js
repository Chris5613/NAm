// Only inspect visible user-facing DOM labels. No fetch, cookies, or page JS.
const LABELS = [
  {label: /^earned today\s*:?$/i, evidenceLabel:"earned-today"},
  {label: /^today(?:'s)? earnings\s*:?$/i, evidenceLabel:"today-earnings"},
  {label: /^earnings today\s*:?$/i, evidenceLabel:"today-earnings"},
];
let lastSignature = "";
const visible = el => {
  if (!el?.getClientRects()?.length) return false;
  const style = getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none";
};
function extract() {
  // Ignore controls, scripts, hidden fields, and large enclosing containers.
  const nodes = document.querySelectorAll("span,div,p,h1,h2,h3,h4,dt,td,strong,small,label");
  for (const node of nodes) {
    if (!visible(node) || node.children.length > 1 || (node.textContent || "").length > 70) continue;
    const text = (node.textContent || "").trim().replace(/\s+/g," ");
    const matched = LABELS.find(rule => rule.label.test(text));
    if (!matched) continue;
    for (const parent of [node.parentElement, node.parentElement?.parentElement]) {
      if (!parent || !visible(parent)) continue;
      const content = (parent.innerText || "").trim().replace(/\s+/g," ");
      if (content.length > 220) continue;
      const after = content.slice(content.toLowerCase().indexOf(text.toLowerCase()) + text.length).trim();
      // Reject cards containing multiple independent balances / financial figures.
      const numbers = [...after.matchAll(/(?:^|\s)([0-9][0-9,]*(?:\.[0-9]+)?)(?=\s|$|\s*credits?\b)/gi)];
      if (numbers.length !== 1) continue;
      const todayCredits = Number(numbers[0][1].replace(/,/g,""));
      if (!Number.isFinite(todayCredits) || todayCredits < 0 || todayCredits > 10000000) continue;
      const day = new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"})
        .format(new Date());
      return {day,todayCredits,evidenceLabel:matched.evidenceLabel,observedAt:new Date().toISOString()};
    }
  }
  return null;
}
function sample() {
  if (document.visibilityState === "hidden") return;
  const reading = extract();
  if (!reading) {
    chrome.runtime.sendMessage({type:"HONEYGAIN_PARSE_ERROR",error:"Daily earnings label not found in visible dashboard. Open the earnings overview."}).catch(()=>{});
    return;
  }
  const signature = reading.day + ":" + reading.todayCredits;
  if (signature === lastSignature) return;
  lastSignature = signature;
  chrome.runtime.sendMessage({type:"HONEYGAIN_READING",reading}).catch(()=>{lastSignature = "";});
}
sample();
setInterval(sample, 60000);
document.addEventListener("visibilitychange",sample);
