import { useEffect, useMemo } from "react";
import { api } from "@/lib/apiClient";

// Only public Solana addresses are sent. The server independently validates
// and persists the allowlist; it never receives wallets' private keys.
export function useRegisteredYieldWallets(luloProjects, loopscaleWallet) {
  const wallets = useMemo(() => Array.from(new Set(
    (luloProjects || [])
      .filter(project => project?.yield_tracking === "lulo_lending")
      .map(project => project?.lulo_wallet_address)
      .filter(value => typeof value === "string" && value.trim())
  )).sort(), [luloProjects]);
  const signature = JSON.stringify(wallets);

  useEffect(() => {
    const lulo = JSON.parse(signature);
    // Register once per wallet-list change; backend polling is independent
    // from this page after configuration is durably saved.
    api.put("/api/yield-sources/wallets", {
      lulo, loopscale: loopscaleWallet || null,
    }).catch(() => {
      // No interruption: direct Lulo/Loopscale API paths stay operational.
    });
  }, [signature, loopscaleWallet]);
}
