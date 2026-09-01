// One-time demo bootstrap — pre-seeds the Nosana auto-sync with a real
// public node operator address so the user can hit "Sync now" / browse
// Investment Overview the moment the app opens. Idempotent (uses a flag).
//
// Removal: the user can clear `networth_demo_seeded` from localStorage to
// re-seed, or clear all storage to reset to a blank app.
import { localStorage as storage } from "./localStorage";
import { syncNosanaEarnings } from "./nosanaSync";

const DEMO_FLAG_KEY = "networth_demo_seeded";
const DEMO_NODE_ADDRESS = "cLmiLWMpbWjUKZzuhmAq432Vaz8eFGHgyHXfxgL3As6";
const DEMO_ROLLERCOIN_BASELINE = 68.5938;

export async function bootstrapDemoData() {
  try {
    // Skip if we've already seeded the demo state, or if the user has
    // already configured Nosana on their own.
    const flagged = window.localStorage.getItem(DEMO_FLAG_KEY) === "true";
    const existingConfig = storage.getNosanaConfig();
    if (flagged || existingConfig?.node_address) {
      // Even in the "already seeded" branch, make sure RollerCoin picks up
      // a baseline if the user opened the app before the RollerCoin card
      // existed — this is a no-op after the first successful seed.
      if (!storage.getRollerCoinConfig()) {
        storage.setRollerCoinConfig({
          baseline_trx: DEMO_ROLLERCOIN_BASELINE,
          project_name: "RollerCoin",
          enabled: true,
          last_updated_at: new Date().toISOString(),
        });
        try { window.dispatchEvent(new CustomEvent("rollercoin-sync-complete")); } catch { /* ignore */ }
      }
      return { seeded: false, reason: flagged ? "already-seeded" : "user-config-exists" };
    }

    // Seed the Nosana config with the real public test address.
    storage.setNosanaConfig({
      node_address: DEMO_NODE_ADDRESS,
      project_name: "Nosana",
      enabled: true,
      last_synced_at: null,
    });

    // Seed the RollerCoin baseline (no earnings transaction — just a
    // reference point for future balance-update deltas).
    storage.setRollerCoinConfig({
      baseline_trx: DEMO_ROLLERCOIN_BASELINE,
      project_name: "RollerCoin",
      enabled: true,
      last_updated_at: new Date().toISOString(),
    });
    // Notify any already-mounted RollerCoin card to pick up the fresh config.
    try { window.dispatchEvent(new CustomEvent("rollercoin-sync-complete")); } catch { /* ignore */ }

    // Mark seeded *before* the network call so a flaky network doesn't
    // cause us to re-seed (and double up the project) on next load.
    window.localStorage.setItem(DEMO_FLAG_KEY, "true");

    // Pull the real earnings history so the Nosana investment project
    // appears immediately with all 30+ days of transactions.
    const result = await syncNosanaEarnings({ silent: true });
    return { seeded: true, ...result };
  } catch (err) {
    console.warn("Demo bootstrap failed:", err);
    return { seeded: false, reason: "error", error: String(err) };
  }
}
