// Unetwork posts the previous work day's rewards on this saved date. The
// posted credit belongs to this Pacific display day, not the prior work day.
// A month-to-date change only describes when a sync happened.
export function withUnetworkDatedEarnings(sources, tracker, day) {
  const entry = tracker?.daily?.[day];
  if (entry === undefined) return sources;

  const usd = Number(typeof entry === "number" ? entry : entry?.usd);
  if (!Number.isFinite(usd) || usd < 0) return sources;

  const next = { ...sources };
  if (usd > 0) next.Unetwork = usd;
  else delete next.Unetwork;
  return next;
}
