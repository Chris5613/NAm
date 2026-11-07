import { useCallback, useEffect, useState } from "react";
import { subscribe } from "@/lib/serverStore";
import { STOCK_DIVIDEND_PAYOUTS_KEY } from "@/lib/stockDividendPayouts";
import { getTodayKey, readObject, saveObject } from "@/lib/yieldFarmingAccounting";

export function useStockDividendPayouts() {
  const [stockPayouts, setStockPayouts] = useState(() =>
    readObject(STOCK_DIVIDEND_PAYOUTS_KEY)
  );

  useEffect(
    () =>
      subscribe((key) => {
        if (key == null || key === STOCK_DIVIDEND_PAYOUTS_KEY) {
          setStockPayouts(readObject(STOCK_DIVIDEND_PAYOUTS_KEY));
        }
      }),
    []
  );

  const recordStockPayout = useCallback((symbol, date, amount) => {
    if (
      !["VTI", "VOO"].includes(symbol) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      date > getTodayKey() ||
      !Number.isFinite(amount) ||
      amount < 0.01 ||
      amount > 100000000
    ) {
      return;
    }

    const next = {
      ...readObject(STOCK_DIVIDEND_PAYOUTS_KEY),
      [`${symbol}:${date}`]: {
        symbol,
        date,
        amount: Number(amount.toFixed(2)),
        source: "manual",
      },
    };

    for (const [key, payout] of Object.entries(next)) {
      if (
        key !== `${symbol}:${date}` &&
        payout?.symbol === symbol &&
        payout?.source === "announced" &&
        Math.abs(Date.parse(payout.date) - Date.parse(date)) <= 3 * 86400000
      ) {
        delete next[key];
      }
    }

    saveObject(STOCK_DIVIDEND_PAYOUTS_KEY, next);
    setStockPayouts(next);
  }, []);

  const removeStockPayout = useCallback((symbol, date) => {
    const next = { ...readObject(STOCK_DIVIDEND_PAYOUTS_KEY) };
    next[`${symbol}:${date}`] = {
      symbol,
      date,
      amount: 0,
      source: "excluded",
    };
    saveObject(STOCK_DIVIDEND_PAYOUTS_KEY, next);
    setStockPayouts(next);
  }, []);

  const restoreStockPayout = useCallback((symbol, date) => {
    const next = { ...readObject(STOCK_DIVIDEND_PAYOUTS_KEY) };
    delete next[`${symbol}:${date}`];
    saveObject(STOCK_DIVIDEND_PAYOUTS_KEY, next);
    setStockPayouts(next);
  }, []);

  const recordAnnouncedStockPayouts = useCallback((candidates) => {
    const next = { ...readObject(STOCK_DIVIDEND_PAYOUTS_KEY) };
    let changed = false;

    for (const [key, payout] of Object.entries(candidates)) {
      if (Object.prototype.hasOwnProperty.call(next, key)) continue;
      if (
        Object.values(next).some(
          (saved) =>
            saved?.symbol === payout.symbol &&
            saved?.source !== "announced" &&
            Number(saved?.amount) > 0 &&
            Math.abs(Date.parse(saved.date) - Date.parse(payout.date)) <=
              3 * 86400000
        )
      ) {
        continue;
      }
      next[key] = payout;
      changed = true;
    }

    if (changed) {
      saveObject(STOCK_DIVIDEND_PAYOUTS_KEY, next);
      setStockPayouts(next);
    }
  }, []);

  return {
    stockPayouts,
    recordStockPayout,
    removeStockPayout,
    restoreStockPayout,
    recordAnnouncedStockPayouts,
  };
}
