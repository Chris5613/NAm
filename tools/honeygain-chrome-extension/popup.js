chrome.storage.local.get(["lastHoneygainReading","lastHoneygainError"], data => {
  const r = data.lastHoneygainReading;
  const el = document.getElementById("result");
  el.textContent = r
    ? `Last read: ${r.todayCredits} credits on ${r.day} (${r.evidenceLabel}). NAm updates when its page is open and signed in.`
    : (data.lastHoneygainError || "No daily earnings recognized. Open the Honeygain earnings overview.");
});