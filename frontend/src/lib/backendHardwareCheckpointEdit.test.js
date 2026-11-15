import { api } from "@/lib/apiClient";
import { previewHardwareCheckpointEdit } from "./backendHardwareCheckpointEdit";

jest.mock("@/lib/apiClient", () => ({
  api: { post: jest.fn() },
}));

const existing = [{
  id: "2080", name: "RTX 2080", earningsStartDay: "2026-11-01",
  sources: ["Kryptex"], checkpoint: { baseline: 2.5, carried: 9.1 },
}];

beforeEach(() => api.post.mockReset());

test("returns only backend-reviewed edits without browser recomputation", async () => {
  const proposed = [{ ...existing[0], name: "Renamed RTX 2080" }];
  const reviewed = [{
    ...proposed[0], checkpoint: { ...existing[0].checkpoint },
  }];
  api.post.mockResolvedValue({
    sourceOfCalculation: "backend-hardware-checkpoint-preview-v1",
    complete: true, readOnly: true, checkpointWrites: false,
    financialLedgerMutated: false, devices: reviewed,
  });
  await expect(previewHardwareCheckpointEdit(existing, proposed))
    .resolves.toEqual(reviewed);
  expect(api.post).toHaveBeenCalledWith(
    "/api/project-tracking/hardware-payback/checkpoint-preview",
    { expectedDevices: existing, proposedDevices: proposed },
  );
  expect(existing[0].checkpoint).toEqual({ baseline: 2.5, carried: 9.1 });
});

test("rejects any response that cannot certify server checkpoint decisions", async () => {
  const proposals = [[{ id: "new" }]];
  for (const response of [
    null,
    { sourceOfCalculation: "browser-hardware", complete: true, devices: proposals[0] },
    { sourceOfCalculation: "backend-hardware-checkpoint-preview-v1",
      complete: true, readOnly: true, checkpointWrites: false,
      financialLedgerMutated: true, devices: proposals[0] },
    { sourceOfCalculation: "backend-hardware-checkpoint-preview-v1",
      complete: true, readOnly: true, checkpointWrites: false,
      financialLedgerMutated: false, devices: [{ id: "wrong" }] },
  ]) {
    api.post.mockResolvedValueOnce(response);
    await expect(previewHardwareCheckpointEdit([], proposals[0]))
      .rejects.toThrow("Backend hardware checkpoint preview unavailable");
  }
});

test("propagates stale-register conflicts instead of falling back to local math", async () => {
  api.post.mockRejectedValue(new Error(
    "Saved hardware changed; reload before editing"));
  await expect(previewHardwareCheckpointEdit(existing, existing))
    .rejects.toThrow("Saved hardware changed");
});
