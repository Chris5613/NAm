import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCurrentMonthKey,
  getTodayKey,
  loadRollerCoinTracker,
} from "@/lib/yieldFarmingAccounting";
import {
  latestRollerCoinTimestamp,
  shouldAcceptRollerCoinBalance,
} from "@/lib/rollerCoinFreshness";

export function rollerCoinAffectedMonths(rows = []) {
  const months = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const date = String(row?.date || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) months.add(date.slice(0, 7));
  }
  return months;
}

export function updateRollerCoinTracker(
  current,
  payload,
  nowIso = new Date().toISOString()
) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const incomingBalanceTrx =
    payload?.current_balance_trx === null ||
    payload?.current_balance_trx === undefined
      ? NaN
      : Number(payload.current_balance_trx);
  const hasLiveBalance =
    Number.isFinite(incomingBalanceTrx) && incomingBalanceTrx >= 0;
  const trxPrice = Number(payload?.trx_usd_price) || 0;
  const acceptBalance = shouldAcceptRollerCoinBalance(current, payload);
  const nextDaily = { ...(current?.daily || {}) };

  const priceToUse =
    trxPrice > 0 && (acceptBalance || !Number(current?.lastTrxPrice))
      ? trxPrice
      : Number(current?.lastTrxPrice) || 0;

  rows.forEach(row => {
    const date = String(row?.date || "").slice(0, 10);
    const trx = Number(row?.trx ?? row?.sol ?? 0) || 0;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

    const previous = nextDaily[date];
    const priorTrx = Number(previous?.trx ?? previous?.sol);

    // Partial range syncs must never erase a larger confirmed total.
    if (
      !Number.isFinite(trx) ||
      trx < 0 ||
      (Number.isFinite(priorTrx) &&
        priorTrx > 0 &&
        trx < priorTrx - 1e-9)
    ) {
      return;
    }
    if (trx === 0 && Number.isFinite(priorTrx) && priorTrx > 0) {
      return;
    }

    const sameTrx =
      previous &&
      Math.abs((Number(previous.trx ?? previous.sol) || 0) - trx) < 1e-12;
    const rowPrice = sameTrx
      ? Number(previous.trxPrice ?? previous.solPrice) || priceToUse
      : priceToUse;

    nextDaily[date] = {
      trx,
      usd:
        sameTrx && Number(previous?.usd) > 0
          ? Number(previous.usd)
          : Number((trx * rowPrice).toFixed(8)),
      trxPrice: rowPrice,
      syncedAt: payload?.synced_at || payload?.syncedAt || nowIso,
    };
  });

  const previousBalance = Number(current?.currentTrxBalance);
  const currentTrxBalance = acceptBalance
    ? incomingBalanceTrx
    : Number.isFinite(previousBalance)
      ? previousBalance
      : 0;

  const snapshotAt = acceptBalance
    ? payload?.balance_synced_at || null
    : null;
  const snapshotTime = Date.parse(snapshotAt || "");
  const priorTime = Date.parse(current?.walletLastObservedAt || "");
  const isFresh =
    hasLiveBalance &&
    Number.isFinite(snapshotTime) &&
    (!Number.isFinite(priorTime) || snapshotTime > priorTime);

  const day = isFresh
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Los_Angeles",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(snapshotTime))
    : null;

  const previousObserved = current?.walletLastObservedTrx;
  const hasPrevious =
    previousObserved !== null &&
    previousObserved !== undefined &&
    Number.isFinite(Number(previousObserved));

  const legacyBalance = current?.currentTrxBalance;
  const legacyTime = Date.parse(current?.balanceSyncedAt || "");
  const hasLegacyReference =
    !hasPrevious &&
    legacyBalance !== null &&
    legacyBalance !== undefined &&
    Number.isFinite(Number(legacyBalance)) &&
    Number(legacyBalance) >= 0 &&
    Number.isFinite(legacyTime) &&
    Number.isFinite(snapshotTime) &&
    legacyTime < snapshotTime;

  const referenceBalance = hasPrevious
    ? Number(previousObserved)
    : hasLegacyReference
      ? Number(legacyBalance)
      : null;
  const difference =
    isFresh && referenceBalance !== null
      ? incomingBalanceTrx - referenceBalance
      : 0;

  const walletDaily = { ...(current?.walletDaily || {}) };
  if (isFresh && day) {
    const priorDay = walletDaily[day] || {};
    walletDaily[day] = {
      trx: Number(((Number(priorDay.trx) || 0) + difference).toFixed(8)),
      usd: Number((
        (Number(priorDay.usd) || 0) +
        difference * priceToUse
      ).toFixed(8)),
      lastSyncedAt: snapshotAt,
    };
  }

  return {
    ...current,
    walletDaily,
    walletLastObservedTrx: isFresh
      ? incomingBalanceTrx
      : (current?.walletLastObservedTrx ?? null),
    walletLastObservedAt: isFresh
      ? snapshotAt
      : (current?.walletLastObservedAt || null),
    daily: nextDaily,
    currentTrxBalance,
    balanceSyncedAt: acceptBalance
      ? (
          payload?.balance_synced_at ||
          payload?.synced_at ||
          payload?.syncedAt ||
          nowIso
        )
      : latestRollerCoinTimestamp(
          current?.balanceSyncedAt,
          current?.walletLastObservedAt
        ),
    balanceSource: acceptBalance
      ? (payload?.balance_source || "extension")
      : (current?.balanceSource || null),
    lastSyncedAt:
      (
        payload?.from && payload?.to
          ? latestRollerCoinTimestamp(
              current?.lastSyncedAt,
              payload?.synced_at || payload?.syncedAt || nowIso
            )
          : current?.lastSyncedAt
      ) || null,
    lastRange:
      payload?.from && payload?.to
        ? { from: payload.from, to: payload.to }
        : (current?.lastRange || null),
    lastTrxPrice: priceToUse,
  };
}

export function useRollerCoinExtension({ setMonthlySnapshots }) {
  const [rollerCoinTracker, setRollerCoinTracker] =
    useState(loadRollerCoinTracker);
  const [rollerCoinConnected, setRollerCoinConnected] = useState(false);
  const [rollerCoinAuthenticated, setRollerCoinAuthenticated] = useState(false);
  const [rollerCoinOpen, setRollerCoinOpen] = useState(false);
  const [rollerCoinSyncing, setRollerCoinSyncing] = useState(false);
  const [rollerCoinMessage, setRollerCoinMessage] = useState("");
  const [rollerCoinFrom, setRollerCoinFrom] = useState(
    () => `${getCurrentMonthKey()}-01`
  );
  const [rollerCoinTo, setRollerCoinTo] = useState(getTodayKey);

  const importRollerCoinPayload = useCallback(payload => {
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    const incomingBalanceTrx =
      payload?.current_balance_trx === null ||
      payload?.current_balance_trx === undefined
        ? NaN
        : Number(payload.current_balance_trx);
    const hasLiveBalance =
      Number.isFinite(incomingBalanceTrx) && incomingBalanceTrx >= 0;

    if (!rows.length && !hasLiveBalance) {
      setRollerCoinSyncing(false);
      setRollerCoinMessage(
        "RollerCoin returned no earnings or live TRX balance."
      );
      return;
    }

    const trxPrice = Number(payload?.trx_usd_price) || 0;
    setRollerCoinTracker(current =>
      updateRollerCoinTracker(current, payload)
    );

    const affectedMonths = rollerCoinAffectedMonths(rows);
    if (affectedMonths.size) {
      setMonthlySnapshots(current => {
        const next = { ...current };
        const currentMonth = getCurrentMonthKey();
        affectedMonths.forEach(monthKey => {
          if (monthKey < currentMonth) delete next[monthKey];
        });
        return next;
      });
    }

    setRollerCoinSyncing(false);
    setRollerCoinMessage(
      trxPrice > 0
        ? `Imported ${rows.length} RollerCoin day${rows.length === 1 ? "" : "s"} into Project Income.`
        : `Imported ${rows.length} RollerCoin day${rows.length === 1 ? "" : "s"}, but TRX price could not be loaded.`
    );
  }, [setMonthlySnapshots]);

  const lastRollerCoinWalletRequestRef = useRef(0);
  const requestRollerCoinLatest = useCallback(() => {
    window.postMessage(
      { source: "rollercoin-app", type: "REQUEST_LATEST" },
      window.location.origin
    );
    window.postMessage(
      { source: "rollercoin-app", type: "REQUEST_STATUS" },
      window.location.origin
    );

    const now = Date.now();
    if (now - lastRollerCoinWalletRequestRef.current >= 600000) {
      lastRollerCoinWalletRequestRef.current = now;
      window.postMessage(
        { source: "rollercoin-app", type: "SYNC_WALLET" },
        window.location.origin
      );
    }
  }, []);

  const syncRollerCoinRange = useCallback(() => {
    if (!rollerCoinFrom || !rollerCoinTo) {
      setRollerCoinMessage("Choose both dates first.");
      return;
    }
    if (rollerCoinFrom > rollerCoinTo) {
      setRollerCoinMessage("From date must be before To date.");
      return;
    }
    if (!rollerCoinConnected) {
      setRollerCoinMessage(
        "RollerCoin extension is not connected to this page."
      );
      requestRollerCoinLatest();
      return;
    }

    setRollerCoinSyncing(true);
    setRollerCoinMessage("Syncing RollerCoin earnings…");
    window.postMessage(
      {
        source: "rollercoin-app",
        type: "SYNC_RANGE",
        from: rollerCoinFrom,
        to: rollerCoinTo,
      },
      window.location.origin
    );
  }, [
    rollerCoinConnected,
    rollerCoinFrom,
    rollerCoinTo,
    requestRollerCoinLatest,
  ]);

  useEffect(() => {
    const handleMessage = event => {
      if (
        event.origin !== window.location.origin ||
        event.source !== window
      ) {
        return;
      }

      const data = event.data;
      if (data?.source !== "rollercoin-ext") return;

      if (data.type === "READY") {
        setRollerCoinConnected(true);
        requestRollerCoinLatest();
        return;
      }

      if (data.type === "ROLLERCOIN_STATUS") {
        setRollerCoinConnected(true);
        setRollerCoinAuthenticated(Boolean(data.payload?.authenticated));
        setRollerCoinOpen(Boolean(data.payload?.rollercoinOpen));
        if (data.payload?.lastPayload) {
          importRollerCoinPayload(data.payload.lastPayload);
        }
        return;
      }

      if (
        data.type === "ROLLERCOIN_PUSH" ||
        data.type === "ROLLERCOIN_SYNC_RESULT"
      ) {
        setRollerCoinConnected(true);
        if (data.payload) importRollerCoinPayload(data.payload);
        else setRollerCoinSyncing(false);
        return;
      }

      if (
        data.type === "ROLLERCOIN_SYNC_ERROR" ||
        data.type === "ROLLERCOIN_ERROR"
      ) {
        setRollerCoinConnected(true);
        setRollerCoinSyncing(false);
        setRollerCoinMessage(data.error || "RollerCoin sync failed.");
      }
    };

    window.addEventListener("message", handleMessage);
    const firstRequest = window.setTimeout(requestRollerCoinLatest, 400);
    const secondRequest = window.setTimeout(requestRollerCoinLatest, 1400);
    const handleFocus = () => requestRollerCoinLatest();
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("focus", handleFocus);
      window.clearTimeout(firstRequest);
      window.clearTimeout(secondRequest);
    };
  }, [importRollerCoinPayload, requestRollerCoinLatest]);

  useEffect(() => {
    if (!rollerCoinConnected) return;

    const key = "rollercoin-nov-1-6-2026-backfill-requested-v1";
    if (window.sessionStorage.getItem(key)) return;

    window.postMessage(
      {
        source: "rollercoin-app",
        type: "SYNC_RANGE",
        from: "2026-11-01",
        to: "2026-11-06",
      },
      window.location.origin
    );
    window.sessionStorage.setItem(key, "1");
  }, [rollerCoinConnected]);

  return {
    rollerCoinTracker,
    rollerCoinConnected,
    rollerCoinAuthenticated,
    rollerCoinOpen,
    rollerCoinSyncing,
    rollerCoinMessage,
    rollerCoinFrom,
    setRollerCoinFrom,
    rollerCoinTo,
    setRollerCoinTo,
    syncRollerCoinRange,
    requestRollerCoinLatest,
  };
}
