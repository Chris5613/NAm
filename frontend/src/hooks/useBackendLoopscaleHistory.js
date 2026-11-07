import { useEffect } from "react";
import { api } from "@/lib/apiClient";
import { mergeBackendLoopscaleHistory } from "@/lib/mergeBackendLoopscaleHistory";

export function useBackendLoopscaleHistory(setLoopscaleHistory) {
  useEffect(() => {
    let active = true;

    const refreshBackendHistory = async () => {
      try {
        const data = await api.get("/api/yield-sources/earnings");
        if (!active || !data?.loopscaleHistory) return;
        setLoopscaleHistory((current) =>
          mergeBackendLoopscaleHistory(current, data.loopscaleHistory)
        );
      } catch {
        // Keep the locally recorded history until the backend is available.
      }
    };

    refreshBackendHistory();
    const timer = window.setInterval(refreshBackendHistory, 60000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [setLoopscaleHistory]);
}
