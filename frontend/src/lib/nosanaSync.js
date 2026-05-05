// Nosana auto-sync — reads daily earnings from the Nosana dashboard API and
// reconciles them with transactions in the "Nosana" investment project so the
// Investment Overview's Net P&L always reflects the operator's true earnings.
//
// Why this approach?
//   The user originally asked for wallet-NOS-increase tracking, but swaps
//   would falsely register as earnings. Using Nosana's official earning
//   history API instead means we *only* see real rewards — no double-dip.
//
// Idempotency:
//   We persist a `{ 'YYYY-MM-DD': { amount, txn_id } }` map. On every sync:
//     - new date     → addTransaction + record
//     - same date, same amount   → skip
//     - same date, different amount (today's data grows) → updateTransaction + adjust earned
//   Manually editing/deleting a synced txn in the InvestmentOverview is also
//   handled in `api.js` — it removes the date from the synced map so the next
//   auto-sync re-applies it (or leaves it, depending on user intent).
import { nosanaApi } from "./external-apis";
import { projectsApi } from "./api";
import { localStorage as storage } from "./localStorage";

const NOSANA_PROJECT_NAME_DEFAULT = "Nosana";
const LOOKBACK_DAYS = 35;          // a month + buffer for late updates
const AMOUNT_EPSILON = 0.005;      // ignore sub-cent drift

function todayUtcIso() {
  return new Date().toISOString().split("T")[0];
}

function daysAgoUtcIso(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split("T")[0];
}

async function findOrCreateProject(name) {
  const res = await projectsApi.getAll();
  const list = res.data || [];
  const target = (name || "").trim().toLowerCase();
  let project = list.find((p) => (p.name || "").trim().toLowerCase() === target);
  if (project) return project;
  const created = await projectsApi.create({
    name,
    icon_url: "https://assets.coingecko.com/coins/images/15214/small/nosana.png",
    invested: 0,
    earned: 0,
    per_day: 0,
    per_week: 0,
    per_month: 0,
    per_year: 0,
    categories: [],
  });
  return created.data;
}

// Run one full sync cycle. Returns `{ added, updated, skipped, total_added_usd }`.
// `opts.silent` suppresses thrown errors (used by the background scheduler).
export async function syncNosanaEarnings(opts = {}) {
  const config = storage.getNosanaConfig();
  if (!config?.enabled || !config?.node_address) {
    if (!opts.silent) throw new Error("Nosana sync is not configured");
    return { added: 0, updated: 0, skipped: 0, total_added_usd: 0, skippedReason: "not-configured" };
  }
  const address = config.node_address.trim();
  const projectName = config.project_name || NOSANA_PROJECT_NAME_DEFAULT;

  // Lazy-init the start-tracking cursor on the very first sync — from here
  // onward we only post earnings dated >= this cursor. This prevents a huge
  // one-time backfill on setup: users only want going-forward data.
  let startTrackingDate = config.start_tracking_date;
  if (!startTrackingDate) {
    startTrackingDate = todayUtcIso();
    storage.setNosanaConfig({ ...config, start_tracking_date: startTrackingDate });
  }

  // We still pull a small window (35 days) from the API so same-day intra-day
  // updates and short catch-ups work, but we filter to the cursor below.
  const startDate = opts.startDate || daysAgoUtcIso(LOOKBACK_DAYS);
  const endDate = opts.endDate || todayUtcIso();

  // 1. Fetch raw earnings.
  let api;
  try {
    api = await nosanaApi.getEarningHistory(address, startDate, endDate);
  } catch (err) {
    if (!opts.silent) throw err;
    console.warn("Nosana sync: API fetch failed", err);
    return { added: 0, updated: 0, skipped: 0, total_added_usd: 0, skippedReason: "fetch-failed" };
  }
  const allDays = nosanaApi.flattenDailyEarnings(api);
  // Hard-cut: only consider days on/after the cursor.
  const days = allDays.filter(({ date }) => date >= startTrackingDate);
  if (days.length === 0) {
    return { added: 0, updated: 0, skipped: 0, total_added_usd: 0, skippedReason: "no-data-since-cursor" };
  }

  // 2. Locate (or create) the project.
  const project = await findOrCreateProject(projectName);

  // 3. Reconcile each day against the synced-dates map.
  const synced = { ...storage.getNosanaSyncedDates() };
  let earnedDelta = 0;
  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const { date, amount } of days) {
    const prev = synced[date];
    if (!prev) {
      // New day → add a transaction.
      const txnsRes = await projectsApi.addTransaction(project.id, {
        type: "earning",
        amount: Number(amount.toFixed(6)),
        category: "Nosana",
        notes: `Nosana auto-sync (${date})`,
        date,
        source: "nosana",
        source_date: date,
      });
      // The API returns the full transaction list — find the one we just
      // added so we can reference it later.
      const txns = txnsRes.data || [];
      const created = [...txns].reverse().find(
        (t) => t.source === "nosana" && t.source_date === date,
      );
      synced[date] = {
        amount: Number(amount.toFixed(6)),
        txn_id: created?.id || null,
      };
      earnedDelta += amount;
      added += 1;
      continue;
    }
    const diff = amount - (Number(prev.amount) || 0);
    if (Math.abs(diff) < AMOUNT_EPSILON) {
      skipped += 1;
      continue;
    }
    // Same day, amount changed (typically today's intra-day update).
    if (prev.txn_id) {
      try {
        await projectsApi.updateTransaction(prev.txn_id, {
          amount: Number(amount.toFixed(6)),
          notes: `Nosana auto-sync (${date})`,
          date,
        });
        synced[date] = { ...prev, amount: Number(amount.toFixed(6)) };
        earnedDelta += diff;
        updated += 1;
      } catch (err) {
        console.warn(`Nosana sync: failed to update txn for ${date}`, err);
        skipped += 1;
      }
    } else {
      // No txn_id on record (legacy) — append a fresh one for the diff so
      // the totals stay correct without losing existing data.
      await projectsApi.addTransaction(project.id, {
        type: "earning",
        amount: Number(diff.toFixed(6)),
        category: "Nosana",
        notes: `Nosana auto-sync adjustment (${date})`,
        date,
        source: "nosana",
        source_date: date,
      });
      synced[date] = { amount: Number(amount.toFixed(6)), txn_id: prev.txn_id || null };
      earnedDelta += diff;
      added += 1;
    }
  }

  // 4. Persist the synced map and bump project.earned by the net delta.
  storage.setNosanaSyncedDates(synced);
  if (Math.abs(earnedDelta) > AMOUNT_EPSILON) {
    const nextEarned = Math.max(0, (Number(project.earned) || 0) + earnedDelta);
    await projectsApi.update(project.id, { earned: nextEarned });

    // Auto-update sub-category breakdown.
    await projectsApi.addToCategory(project.id, "Nosana", earnedDelta);
  }

  // 5. Stamp the config with the last-sync time.
  const nextConfig = { ...config, last_synced_at: new Date().toISOString() };
  storage.setNosanaConfig(nextConfig);

  // Notify any mounted UI (NosanaEarningsCard) that fresh data is available
  // — covers the case where a sync runs outside the user's click handler
  // (auto-scheduler, demo bootstrap) and the card needs to re-read state.
  try {
    window.dispatchEvent(new CustomEvent("nosana-sync-complete"));
  } catch { /* SSR / older browsers — ignore */ }

  return {
    added,
    updated,
    skipped,
    total_added_usd: earnedDelta,
    project_id: project.id,
    api_total_all_time: Number(api?.totalEarnedAllTime) || null,
    api_current_month: Number(api?.currentMonth?.currentMonthEarned) || null,
    api_forecast: Number(api?.forecast) || null,
    api,
  };
}

// Compute milliseconds until the next 23:45 UTC firing time. Used by the
// scheduler to await accurately even across day boundaries.
export function msUntilNext2345Utc(now = new Date()) {
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    23, 45, 0, 0,
  ));
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.getTime() - now.getTime();
}

// Returns true if "now" is past 23:45 UTC for today's UTC date AND we have
// not yet successfully synced today (based on `last_synced_at`).
export function shouldRunCatchupNow(now = new Date()) {
  const config = storage.getNosanaConfig();
  if (!config?.enabled || !config?.node_address) return false;
  const cutoffMin = 23 * 60 + 45;
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (nowMin < cutoffMin) return false;
  if (!config.last_synced_at) return true;
  const last = new Date(config.last_synced_at);
  // Consider "synced today" if last sync happened on the same UTC date AND
  // was after 23:45 UTC.
  const sameDay =
    last.getUTCFullYear() === now.getUTCFullYear() &&
    last.getUTCMonth() === now.getUTCMonth() &&
    last.getUTCDate() === now.getUTCDate();
  if (!sameDay) return true;
  const lastMin = last.getUTCHours() * 60 + last.getUTCMinutes();
  return lastMin < cutoffMin;
}


// Wipes all auto-synced Nosana transactions and resets the cursor so sync
// only considers days from "now" forward. Useful when a previous setup
// backfilled too much history, or when the user wants a clean slate.
// `opts.cursorDate` (YYYY-MM-DD) overrides the default of today.
export async function resetNosanaSyncHistory(opts = {}) {
  const config = storage.getNosanaConfig();
  const synced = storage.getNosanaSyncedDates() || {};
  const entries = Object.entries(synced);

  // 1. Delete each auto-synced transaction. `projectsApi.deleteTransaction`
  //    automatically decrements `project.earned` and removes the date from
  //    the synced-dates map (via the reversal hook in api.js), so we end up
  //    with a consistent state without having to touch project totals.
  let removed = 0;
  for (const [, entry] of entries) {
    if (!entry?.txn_id) continue;
    try {
      await projectsApi.deleteTransaction(entry.txn_id);
      removed += 1;
    } catch (err) {
      console.warn("resetNosanaSyncHistory: failed to delete txn", entry.txn_id, err);
    }
  }

  // 2. Belt-and-suspenders: explicitly clear the map (in case any entry had
  //    no txn_id / the reversal hook didn't fully clean up).
  storage.setNosanaSyncedDates({});

  // 3. Advance the tracking cursor. Default: today (UTC).
  const cursor = opts.cursorDate || todayUtcIso();
  if (config) {
    storage.setNosanaConfig({
      ...config,
      start_tracking_date: cursor,
      last_synced_at: null,
    });
  }

  try {
    window.dispatchEvent(new CustomEvent("nosana-sync-complete"));
  } catch { /* ignore */ }

  return { removed, cursor };
}

// One-shot migration: detects users who were seeded with the old multi-day
// backfill behavior and silently collapses it to "today only" so they don't
// see legacy $50+ histories. No-op after the first run.
const MIGRATION_FLAG = "networth_nosana_today_only_migration_v1";
export async function runTodayOnlyMigrationIfNeeded() {
  try {
    if (window.localStorage.getItem(MIGRATION_FLAG) === "true") return { migrated: false, reason: "already-run" };
    const config = storage.getNosanaConfig();
    const synced = storage.getNosanaSyncedDates() || {};
    // Only migrate the demo-seeded state — don't touch users who opted in
    // themselves and intentionally synced historical data.
    const demoSeeded = window.localStorage.getItem("networth_demo_seeded") === "true";
    if (!demoSeeded || !config || Object.keys(synced).length === 0) {
      window.localStorage.setItem(MIGRATION_FLAG, "true");
      return { migrated: false, reason: "no-op" };
    }
    const result = await resetNosanaSyncHistory();
    window.localStorage.setItem(MIGRATION_FLAG, "true");
    // Kick a fresh sync so today's data appears right after migration.
    try { await syncNosanaEarnings({ silent: true }); } catch { /* ignore */ }
    return { migrated: true, ...result };
  } catch (err) {
    console.warn("runTodayOnlyMigrationIfNeeded failed:", err);
    return { migrated: false, reason: "error", error: String(err) };
  }
}
