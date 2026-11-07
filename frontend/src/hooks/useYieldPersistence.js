import { useEffect } from "react";
import {
  saveKryptexTracker,
  saveLoopscaleHistory,
  saveLuloMonthlyBaselines,
  saveMonthlyBackfills,
  saveMonthlySnapshots,
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
  kryptexTracker,
  rollerCoinTracker,
  unetworkTracker,
  monthlySnapshots,
}) {
  useEffect(() => savePositions(manualPositions), [manualPositions]);
  useEffect(() => saveProjectLogos(projectLogos), [projectLogos]);
  useEffect(() => saveMonthlyBackfills(monthlyBackfills), [monthlyBackfills]);
  useEffect(() => saveLuloMonthlyBaselines(luloMonthlyBaselines), [luloMonthlyBaselines]);
  useEffect(() => saveLoopscaleHistory(loopscaleHistory), [loopscaleHistory]);
  useEffect(() => saveSaladTracker(saladTracker), [saladTracker]);
  useEffect(() => saveKryptexTracker(kryptexTracker), [kryptexTracker]);
  useEffect(() => saveRollerCoinTracker(rollerCoinTracker), [rollerCoinTracker]);
  useEffect(() => saveUnetworkTracker(unetworkTracker), [unetworkTracker]);
  useEffect(() => saveMonthlySnapshots(monthlySnapshots), [monthlySnapshots]);
}
