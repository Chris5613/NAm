import { api } from "@/lib/apiClient";

/** Preview only: the authenticated backend owns checkpoint decisions.
 * The caller remains responsible for the existing saved-settings write.
 * A stale saved register, invalid evidence or source switch fails closed.
 */
export async function previewHardwareCheckpointEdit(expectedDevices, proposedDevices) {
  const result = await api.post("/api/project-tracking/hardware-payback/checkpoint-preview", {
    expectedDevices, proposedDevices,
  });
  if (result?.sourceOfCalculation !== "backend-hardware-checkpoint-preview-v1" ||
      result.complete !== true || result.readOnly !== true ||
      result.checkpointWrites !== false || result.financialLedgerMutated !== false ||
      !Array.isArray(result.devices) || result.devices.length !== proposedDevices.length ||
      result.devices.some((device, index) =>
        String(device?.id) !== String(proposedDevices[index]?.id))) {
    throw new Error("Backend hardware checkpoint preview unavailable or inconsistent");
  }
  return result.devices;
}
