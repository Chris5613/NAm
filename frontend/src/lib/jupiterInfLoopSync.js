import { INF_MINT, SOL_MINT } from "./infYieldSync";

const JUPITER_LEND_POSITIONS_URL = "https://lite-api.jup.ag/lend/v1/borrow/positions";
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function tokenAmount(rawAmount, decimals) {
  return Number(rawAmount || 0) / (10 ** Number(decimals || 0));
}

export function parseFluidPnl(pnl, borrowToken) {
  const tokenPnl = tokenAmount(pnl?.amount, borrowToken?.decimals);
  const tokenPrice = Number(borrowToken?.price) || 0;
  return {
    pnlUsd: tokenPnl * tokenPrice,
    pnlPercentage: (Number(pnl?.percentage) || 0) / 100,
  };
}

function toDayKey(date) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

export async function getJupiterInfLoopSnapshot(walletAddress, positionId) {
  const url = `${JUPITER_LEND_POSITIONS_URL}?users=${encodeURIComponent(walletAddress)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Jupiter Lend returned HTTP ${response.status}`);

  const positions = await response.json();
  const position = (Array.isArray(positions) ? positions : []).find(
    (item) => String(item.id) === String(positionId)
  );
  if (!position) throw new Error(`Jupiter Lend position #${positionId} was not found`);

  const supplyToken = position.vault?.supplyToken || {};
  const borrowToken = position.vault?.borrowToken || {};
  if (supplyToken.address !== INF_MINT || borrowToken.address !== SOL_MINT) {
    throw new Error(`Position #${positionId} is not an INF/SOL loop`);
  }

  const collateralInf = tokenAmount(position.supply, supplyToken.decimals);
  const borrowedSol = tokenAmount(position.borrow, borrowToken.decimals);
  const infUsd = Number(supplyToken.price) || 0;
  const solUsd = Number(borrowToken.price) || 0;
  const supplyApy = (Number(supplyToken.stakingApr) || 0) / 100;
  const borrowApy = (Number(position.vault?.borrowRate) || 0) / 100;
  const netEquityUsd = (collateralInf * infUsd) - (borrowedSol * solUsd);
  const annualNetUsd = (collateralInf * infUsd * supplyApy / 100)
    - (borrowedSol * solUsd * borrowApy / 100);
  let pnlUsd = null;
  let pnlPercentage = null;

  const BACKEND_URL = "https://nam1-dmte.onrender.com";

  try {
    const pnlUrl =
      `${BACKEND_URL}/api/jupiter/fluid-pnl` +
      `?vault_id=${encodeURIComponent(position.vaultId)}` +
      `&position_id=${encodeURIComponent(position.id)}`;

    const pnlResponse = await fetch(pnlUrl);

    if (!pnlResponse.ok) {
      const errorText = await pnlResponse.text().catch(() => "");
      throw new Error(
        `Fluid P&L proxy returned HTTP ${pnlResponse.status}${errorText ? `: ${errorText}` : ""}`
      );
    }

    const pnl = await pnlResponse.json();

    ({ pnlUsd, pnlPercentage } = parseFluidPnl(pnl, borrowToken));

    console.info("[Jupiter INF Loop] Fluid P&L sync", {
      url: pnlUrl,
      raw: pnl,
      parsedPnlUsd: pnlUsd,
      parsedPnlPercentage: pnlPercentage,
    });
  } catch (error) {
    console.warn("[Jupiter INF Loop] Fluid P&L fetch failed:", error);
  }

  if (!Number.isFinite(pnlUsd)) {
    const directUsdCandidates = [
      position?.pnlUsd,
      position?.pnl_usd,
      position?.positionPnlUsd,
      position?.position_pnl_usd,
      position?.stats?.pnlUsd,
      position?.stats?.pnl_usd,
      position?.pnl?.usd,
      position?.pnl?.valueUsd,
    ];

    const directUsd = directUsdCandidates
      .map(Number)
      .find(Number.isFinite);

    if (Number.isFinite(directUsd)) {
      pnlUsd = directUsd;
      console.info("[Jupiter INF Loop] Using Jupiter position P&L fallback:", pnlUsd);
    }
  }

  if (!Number.isFinite(pnlPercentage)) {
    const directPctCandidates = [
      position?.pnlPercentage,
      position?.pnl_percentage,
      position?.positionPnlPercentage,
      position?.position_pnl_percentage,
      position?.stats?.pnlPercentage,
      position?.stats?.pnl_percentage,
      position?.pnl?.percentage,
    ];

    const directPct = directPctCandidates
      .map(Number)
      .find(Number.isFinite);

    if (Number.isFinite(directPct)) {
      pnlPercentage = Math.abs(directPct) > 10 ? directPct / 100 : directPct;
    }
  }

  return {
    walletAddress,
    positionId: Number(position.id),
    collateralInf,
    borrowedSol,
    infUsd,
    solUsd,
    infSolRate: infUsd / solUsd,
    supplyApy,
    borrowApy,
    netEquityUsd,
    netApy: netEquityUsd > 0 ? (annualNetUsd / netEquityUsd) * 100 : 0,
    pnlUsd: Number.isFinite(pnlUsd) ? pnlUsd : null,
    pnlPercentage: Number.isFinite(pnlPercentage) ? pnlPercentage : null,
    pnlAvailable: Number.isFinite(pnlUsd),
    source: "jupiter_lend",
  };
}

export function applyJupiterInfLoopSnapshot(project, snapshot, now = new Date()) {
  if (project?.yield_tracking !== "jupiter_inf_loop") return project;

  const currentRate = Number(snapshot?.infSolRate) || 0;
  const solUsd = Number(snapshot?.solUsd) || 0;
  const currentTime = now.getTime();
  const lastTime = new Date(project.jupiter_last_synced_at || 0).getTime();
  const dayKey = toDayKey(now);
  if (!(currentRate > 0) || !(solUsd > 0) || !dayKey) return project;

  const startingEquityUsd = Number(project.invested) || 0;
  const authoritativePnl = Number(snapshot?.pnlUsd);
  const hasAuthoritativePnl = snapshot?.pnlUsd != null && Number.isFinite(authoritativePnl);
  const positionPnlUsd = startingEquityUsd > 0
    ? Number(((Number(snapshot.netEquityUsd) || 0) - startingEquityUsd).toFixed(6))
    : 0;
  const positionPnlPercentage = startingEquityUsd > 0
    ? Number(((positionPnlUsd / startingEquityUsd) * 100).toFixed(6))
    : 0;

  const positionState = {
    jupiter_collateral_inf: Number(snapshot.collateralInf) || 0,
    jupiter_borrowed_sol: Number(snapshot.borrowedSol) || 0,
    jupiter_supply_apy: Number(snapshot.supplyApy) || 0,
    jupiter_borrow_apy: Number(snapshot.borrowApy) || 0,
    jupiter_net_apy: Number(snapshot.netApy) || 0,
    jupiter_net_equity_usd: Number(snapshot.netEquityUsd) || 0,
    jupiter_inf_usd: Number(snapshot.infUsd) || 0,
    jupiter_sol_usd: solUsd,
    jupiter_last_rate: currentRate,
    jupiter_last_synced_at: now.toISOString(),
    // Prefer Fluid's authoritative live position P&L whenever the endpoint
    // returns it. The old code always saved netEquity - startingEquity here,
    // which is why the dashboard could show +$29 while Jupiter showed +$1.xx.
    jupiter_position_pnl_usd: hasAuthoritativePnl
      ? authoritativePnl
      : positionPnlUsd,
    jupiter_position_pnl_percentage: hasAuthoritativePnl
      ? (Number.isFinite(Number(snapshot.pnlPercentage))
          ? Number(snapshot.pnlPercentage)
          : 0)
      : positionPnlPercentage,

    jupiter_apy_earned_usd: hasAuthoritativePnl ? authoritativePnl : null,
    jupiter_apy_earned_percentage: hasAuthoritativePnl
      ? (Number.isFinite(Number(snapshot.pnlPercentage))
          ? Number(snapshot.pnlPercentage)
          : 0)
      : null,
    jupiter_pnl_source: hasAuthoritativePnl
      ? "fluid_position_stats"
      : "net_equity_fallback",
  };

  let transactions = [...(project.transactions || [])];

  if (hasAuthoritativePnl) {
    const isFirstFluidSync = project.jupiter_pnl_tracking_version !== "fluid_v1";
    const previousPnl = isFirstFluidSync ? 0 : Number(project.jupiter_last_pnl_usd) || 0;
    const pnlDelta = Number((authoritativePnl - previousPnl).toFixed(6));

    if (isFirstFluidSync) {
      transactions = transactions.filter((transaction) => transaction.source !== "jupiter_inf_loop");
    }

    if (pnlDelta !== 0) {
      const existingIndex = transactions.findIndex(
        (transaction) => transaction.source === "jupiter_inf_loop" && transaction.source_date === dayKey
      );
      if (existingIndex >= 0) {
        transactions[existingIndex] = {
          ...transactions[existingIndex],
          amount: Number(((Number(transactions[existingIndex].amount) || 0) + pnlDelta).toFixed(6)),
          pnl_to_usd: authoritativePnl,
          sync_to: now.toISOString(),
        };
      } else {
        transactions.push({
          type: "earning",
          amount: pnlDelta,
          category: "Jupiter INF Loop",
          notes: `Jupiter flow-adjusted P&L (${dayKey})`,
          date: dayKey,
          source: "jupiter_inf_loop",
          source_date: dayKey,
          accrual_model: "fluid_pnl_v1",
          pnl_from_usd: previousPnl,
          pnl_to_usd: authoritativePnl,
          sync_from: project.jupiter_last_synced_at,
          sync_to: now.toISOString(),
        });
      }
    }

    return {
      ...project,
      ...positionState,
      transactions,
      jupiter_initial_earned: 0,
      jupiter_last_pnl_usd: authoritativePnl,
      jupiter_pnl_tracking_version: "fluid_v1",
      earned: authoritativePnl,
    };
  }

  if (project.jupiter_pnl_tracking_version === "fluid_v1") {
    return { ...project, ...positionState, transactions };
  }

  const initialEarned = Number(project.jupiter_initial_earned) || 0;
  const getNetApyEarned = (items) => initialEarned + items
    .filter((transaction) => transaction.source === "jupiter_inf_loop")
    .reduce((total, transaction) => total + (Number(transaction.amount) || 0), 0);

  if (!Number.isFinite(lastTime) || lastTime <= 0 || currentTime <= lastTime) {
    return {
      ...project,
      ...positionState,
      jupiter_initial_earned: initialEarned,
      earned: getNetApyEarned(transactions),
    };
  }

  const elapsedYears = (currentTime - lastTime) / YEAR_MS;
  const collateralInf = Number(snapshot.collateralInf) || 0;
  const borrowedSol = Number(snapshot.borrowedSol) || 0;
  const infUsd = Number(snapshot.infUsd) || 0;
  const supplyApy = Number(snapshot.supplyApy) || 0;
  const borrowApy = Number(snapshot.borrowApy) || 0;
  const grossYieldUsd = collateralInf * infUsd * (supplyApy / 100) * elapsedYears;
  const borrowCostUsd = borrowedSol * (borrowApy / 100) * elapsedYears * solUsd;
  const netYieldUsd = Number((grossYieldUsd - borrowCostUsd).toFixed(6));

  if (netYieldUsd === 0) {
    return {
      ...project,
      ...positionState,
      jupiter_initial_earned: initialEarned,
      earned: getNetApyEarned(transactions),
    };
  }

  const existingIndex = transactions.findIndex(
    (transaction) => transaction.source === "jupiter_inf_loop" && transaction.source_date === dayKey
  );

  if (existingIndex >= 0) {
    const existing = transactions[existingIndex];
    const isLiveApyAccrual = existing.accrual_model === "jupiter_live_apy_v2";
    transactions[existingIndex] = {
      ...existing,
      amount: Number(((isLiveApyAccrual ? Number(existing.amount) || 0 : 0) + netYieldUsd).toFixed(6)),
      gross_yield_usd: Number(((isLiveApyAccrual ? Number(existing.gross_yield_usd) || 0 : 0) + grossYieldUsd).toFixed(6)),
      borrow_cost_usd: Number(((isLiveApyAccrual ? Number(existing.borrow_cost_usd) || 0 : 0) + borrowCostUsd).toFixed(6)),
      accrual_model: "jupiter_live_apy_v2",
      inf_to_rate: currentRate,
      sync_to: now.toISOString(),
    };
  } else {
    transactions.push({
      type: "earning",
      amount: netYieldUsd,
      category: "Jupiter INF Loop",
      notes: `Jupiter INF loop net yield (${dayKey})`,
      date: dayKey,
      source: "jupiter_inf_loop",
      source_date: dayKey,
      accrual_model: "jupiter_live_apy_v2",
      gross_yield_usd: Number(grossYieldUsd.toFixed(6)),
      borrow_cost_usd: Number(borrowCostUsd.toFixed(6)),
      inf_from_rate: Number(project.jupiter_last_rate) || currentRate,
      inf_to_rate: currentRate,
      sync_from: project.jupiter_last_synced_at,
      sync_to: now.toISOString(),
    });
  }

  return {
    ...project,
    ...positionState,
    transactions,
    jupiter_initial_earned: initialEarned,
    earned: getNetApyEarned(transactions),
  };
}