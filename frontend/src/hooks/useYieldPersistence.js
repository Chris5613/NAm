import { useEffect } from "react";
import {
  saveLoopscaleHistory,
  saveLuloMonthlyBaselines,
  saveMonthlyBackfills,
  savePositions,
  saveProjectLogos,
  saveRollerCoinTracker,
  saveSaladTracker,
  saveUnetworkTracker,
} from "@/lib/yieldFarmingAccounting";

export function useYieldPersistence({
  manualPositions,
  projectLogos,
  monthlyBackfills,
  luloMonthlyBaselines,
  loopscaleHistory,
  saladTracker,
  rollerCoinTracker,
  unetworkTracker,
}) {
  useEffect(() => savePositions(manualPositions), [manualPositions]);
  useEffect(() => saveProjectLogos(projectLogos), [projectLogos]);
  useEffect(() => saveMonthlyBackfills(monthlyBackfills), [monthlyBackfills]);
  useEffect(() => saveLuloMonthlyBaselines(luloMonthlyBaselines), [luloMonthlyBaselines]);
  useEffect(() => saveLoopscaleHistory(loopscaleHistory), [loopscaleHistory]);
  useEffect(() => saveSaladTracker(saladTracker), [saladTracker]);
  useEffect(() => saveRollerCoinTracker(rollerCoinTracker), [rollerCoinTracker]);
  useEffect(() => saveUnetworkTracker(unetworkTracker), [unetworkTracker]);
}
