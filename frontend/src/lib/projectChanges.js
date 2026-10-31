// Stable object comparison ignores property order, but preserves transaction order.
export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function indexedProjects(records) {
  const rows = new Map();
  for (const row of records) {
    // A duplicate ID may represent a conflicting financial record. Never
    // collapse it via Map or silently choose whichever occurrence came last.
    if (!row || typeof row.id !== "string" || !row.id.trim() || rows.has(row.id)) {
      const error = new Error("Projects require unique, nonempty string IDs; no changes were saved.");
      error.code = "INVALID_PROJECT_IDS";
      throw error;
    }
    rows.set(row.id, row);
  }
  return rows;
}

export function projectChanges(before, after) {
  const old = indexedProjects(before);
  const next = indexedProjects(after);
  return [...new Set([...old.keys(), ...next.keys()])].flatMap((id) => {
    const a = old.get(id) ?? null;
    const b = next.get(id) ?? null;
    return stableJson(a) === stableJson(b) ? [] : [{ id, before: a, after: b }];
  });
}

// Keep edits made during an in-flight save; adopt remote changes elsewhere.
export function rebaseProjects(sent, local, saved) {
  const pending = projectChanges(sent, local);
  const rows = new Map(saved.map((row) => [row.id, row]));
  pending.forEach(({ id, after }) => after === null ? rows.delete(id) : rows.set(id, after));
  return [...rows.values()];
}
