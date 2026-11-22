chrome.storage.local.get(["lastHoneygainReading","lastHoneygainError","lastHoneygainSavedAt"], data => {
  const r = data.lastHoneygainReading;
  const valid = r && Number.isFinite(r.jumpTaskBalanceCredits) &&
    ["jumptask-balance","transferred-to-jumptask"].includes(r.evidenceLabel);
  document.getElementById("result").textContent = valid
    ? `JumpTask: ${r.jumpTaskBalanceCredits.toFixed(4)} credits (~$${(r.jumpTaskBalanceCredits / 1000).toFixed(5)}). ${data.lastHoneygainSavedAt ? "Last saved: " + data.lastHoneygainSavedAt : "Awaiting NAm confirmation."}`
    : (data.lastHoneygainError || "No labeled JumpTask balance recognized yet. Honeygain-mode balances are ignored.");
});