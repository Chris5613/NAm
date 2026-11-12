import { useEffect, useState } from "react";

import {
  getStoredProjectCryptoPortfolio,
  refreshProjectCryptoPortfolio,
} from "@/lib/projectCryptoPortfolio";

import {
  remoteStorage, subscribe,
} from "@/lib/serverStore";
import { getFinancialTotalAssets } from "@/lib/financialAssetsSnapshot";

import {
  Card,
  CardContent,
} from "@/components/ui/card";

import { Button } from "@/components/ui/button";

import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Wallet,
} from "lucide-react";

const PROJECT_INCOME_PORTFOLIO_SUMMARY_KEY =
  "project_income_portfolio_summary_v1";

function getProjectIncomePortfolioSummary() {
  try {
    const raw =
      remoteStorage.getItem(
        PROJECT_INCOME_PORTFOLIO_SUMMARY_KEY
      );

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(raw);

    return (
      parsed &&
      typeof parsed === "object"
    )
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function ProjectPortfolioEntry({
  balance,
  activePositions = 0,
}) {
  const positionCount =
    Number(
      activePositions
    ) || 0;

  return (
    <Card className="border-border/50 bg-card/70">
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-secondary">
            <Wallet className="h-4 w-4 text-foreground" />
          </div>

          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">
              Project Income Portfolio
            </p>

            <p className="text-xs text-muted-foreground">
              {positionCount > 0
                ? `${positionCount} active ${
                    positionCount === 1
                      ? "project"
                      : "projects"
                  }`
                : "Active project balances"}
            </p>
          </div>
        </div>

        <p className="shrink-0 font-mono text-lg font-semibold text-foreground">
          {formatCurrency(
            balance
          )}
        </p>
      </CardContent>
    </Card>
  );
}

export default function CryptoBreakdown({
  defaultOpen = false,
}) {
  const [portfolio, setPortfolio] =
    useState(() =>
      getStoredProjectCryptoPortfolio()
    );

  const [cryptoOpen, setCryptoOpen] =
    useState(defaultOpen);

  const [refreshing, setRefreshing] =
    useState(false);
  const [financialAssets, setFinancialAssets] = useState(getFinancialTotalAssets);

  useEffect(() => {
    const refresh = () => setFinancialAssets(getFinancialTotalAssets());
    const unsubscribe = subscribe(refresh);
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("project-crypto-updated", refresh);
    window.addEventListener("project-income-portfolio-balance-updated", refresh);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("project-crypto-updated", refresh);
      window.removeEventListener("project-income-portfolio-balance-updated", refresh);
    };
  }, []);

  const [
    projectIncomeSummary,
    setProjectIncomeSummary,
  ] =
    useState(() =>
      getProjectIncomePortfolioSummary()
    );

  useEffect(() => {
    const handlePortfolioBalance =
      (event) => {
        const next =
          event?.detail ||
          getProjectIncomePortfolioSummary();

        if (
          next &&
          typeof next === "object"
        ) {
          setProjectIncomeSummary(
            next
          );
        }
      };

    window.addEventListener(
      "project-income-portfolio-balance-updated",
      handlePortfolioBalance
    );

    return () => {
      window.removeEventListener(
        "project-income-portfolio-balance-updated",
        handlePortfolioBalance
      );
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const next =
          await refreshProjectCryptoPortfolio();

        if (!cancelled) {
          setPortfolio(next);
      setFinancialAssets(getFinancialTotalAssets());
        }
      } catch {
        // Keep the last saved values visible.
      }
    };

    refresh();

    const handleUpdate = (event) => {
      if (
        !cancelled &&
        event?.detail
      ) {
        setPortfolio(event.detail);
      }
    };

    window.addEventListener(
      "project-crypto-updated",
      handleUpdate
    );

    return () => {
      cancelled = true;

      window.removeEventListener(
        "project-crypto-updated",
        handleUpdate
      );
    };
  }, []);

  const summary =
    portfolio?.summary || {};

  const projectIncomeBalance =
    Number(
      projectIncomeSummary
        ?.portfolioBalance
    );

  const displayedProjectBalance =
    Number.isFinite(
      projectIncomeBalance
    )
      ? projectIncomeBalance
      : (
          Number(
            summary?.projectBalance
          ) || 0
        );

  const displayedActivePositions =
    Number.isFinite(
      Number(
        projectIncomeSummary
          ?.activePositions
      )
    )
      ? Number(
          projectIncomeSummary
            ?.activePositions
        )
      : (
          Number(
            summary?.activePositions
          ) || 0
        );

  const hasProjectPortfolio =
    displayedProjectBalance > 0;

  const handleRefresh = async (event) => {
    event.stopPropagation();
    setRefreshing(true);

    try {
      const next =
        await refreshProjectCryptoPortfolio();

      setPortfolio(next);
      setFinancialAssets(getFinancialTotalAssets());
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div
      className="space-y-3"
      data-testid="crypto-breakdown"
    >
      <Card
        className="border-border/40 bg-card transition-colors hover:border-white/10"
        data-testid="crypto-top-card"
      >
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() =>
                setCryptoOpen(
                  (value) => !value
                )
              }
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              {cryptoOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}

              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary">
                <Wallet className="h-4 w-4 text-foreground" />
              </div>

              <p className="text-lg font-semibold text-foreground">
                Total Assets
              </p>
            </button>

            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="border-border/40"
              >
                <RefreshCw
                  className={`mr-2 h-3.5 w-3.5 ${
                    refreshing
                      ? "animate-spin"
                      : ""
                  }`}
                />

                Refresh
              </Button>

              <div className="min-w-[130px] text-right">
                <p className="font-mono text-lg font-bold text-foreground">
                  {financialAssets.value === null ? "—" : formatCurrency(financialAssets.value)}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  {financialAssets.incomplete ? "Some balances are unverified" : "From Financials · Balance Sheet"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {cryptoOpen && (
        <div className="ml-6 space-y-2">
          {hasProjectPortfolio && (
            <ProjectPortfolioEntry
              balance={
                displayedProjectBalance
              }
              activePositions={
                displayedActivePositions
              }
            />
          )}

          {!hasProjectPortfolio &&
            !portfolio?.projectEntries?.length && (
              <Card className="border-border/40 bg-card/70">
                <CardContent className="p-5 text-sm text-muted-foreground">
                  No project balances recorded. Check Financials for your full asset breakdown.
                </CardContent>
              </Card>
            )}

          {Array.isArray(
            portfolio?.errors
          ) &&
            portfolio.errors.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
                {portfolio.errors.join(
                  " · "
                )}
              </div>
            )}
        </div>
      )}
    </div>
  );
}
