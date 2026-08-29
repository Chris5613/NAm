import { applyKryptexExtensionPayload, getKryptexExtensionState } from "./kryptexExtensionSync";
import { localStorage as storage } from "./localStorage";
import * as api from "./api";

jest.mock("./api", () => ({
  projectsApi: {
    getAll: jest.fn(),
    create: jest.fn(),
    addTransaction: jest.fn(),
    update: jest.fn(),
    addToCategory: jest.fn(),
  },
}));

function makeProject(overrides = {}) {
  return { id: "kryptex-1", name: "Kryptex", earned: 0, invested: 0, transactions: [], ...overrides };
}

describe("Kryptex extension bridge", () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.clearAllMocks();
  });

  it("initializes the baseline from the first push without posting an earning", async () => {
    storage.setKryptexConfig({ enabled: true, project_name: "Kryptex", label: "Mining" });
    api.projectsApi.getAll.mockResolvedValue({ data: [] });
    api.projectsApi.create.mockResolvedValue({ data: makeProject() });

    const result = await applyKryptexExtensionPayload({
      synced_at: "2026-08-29T00:00:00.000Z",
      status: { balance_usd: 2.85, withdrawable_usd: 2.36, profitability_usd_day: 1.7, miners: [] },
    });

    expect(result.applied).toBe(true);
    expect(result.action).toBe("initialized");
    expect(api.projectsApi.create).toHaveBeenCalledTimes(1);
    expect(api.projectsApi.addTransaction).not.toHaveBeenCalled();
    expect(storage.getKryptexConfig().baseline_balance_usd).toBe(2.85);
    expect(getKryptexExtensionState().extension_detected).toBe(true);
  });

  it("posts one earning transaction for a balance increase and ignores a repeated push", async () => {
    storage.setKryptexConfig({ enabled: true, project_name: "Kryptex", label: "Mining", baseline_balance_usd: 2.85 });
    api.projectsApi.getAll.mockResolvedValue({ data: [makeProject()] });
    api.projectsApi.addTransaction.mockResolvedValue({ data: [] });
    api.projectsApi.update.mockResolvedValue({ data: {} });
    api.projectsApi.addToCategory.mockResolvedValue({ data: {} });

    const payload = {
      synced_at: "2026-08-29T00:05:00.000Z",
      status: { balance_usd: 2.95, withdrawable_usd: 2.4, profitability_usd_day: 1.7, miners: [] },
    };

    const first = await applyKryptexExtensionPayload(payload);
    const second = await applyKryptexExtensionPayload(payload);

    expect(first.applied).toBe(true);
    expect(first.action).toBe("earning");
    expect(second.applied).toBe(false);
    expect(second.reason).toBe("already_applied");
    expect(api.projectsApi.addTransaction).toHaveBeenCalledTimes(1);
    expect(api.projectsApi.addTransaction).toHaveBeenCalledWith(
      "kryptex-1",
      expect.objectContaining({ type: "earning", amount: 0.1, source: "kryptex" }),
    );
  });

  it("does not apply a payout drop as negative income and just resets the baseline", async () => {
    storage.setKryptexConfig({ enabled: true, project_name: "Kryptex", label: "Mining", baseline_balance_usd: 2.85 });
    api.projectsApi.getAll.mockResolvedValue({ data: [makeProject()] });

    const result = await applyKryptexExtensionPayload({
      synced_at: "2026-08-29T00:10:00.000Z",
      status: { balance_usd: 0, withdrawable_usd: 0, profitability_usd_day: 1.7, miners: [] },
    });

    expect(result.applied).toBe(true);
    expect(result.action).toBe("withdrawal");
    expect(api.projectsApi.addTransaction).not.toHaveBeenCalled();
    expect(storage.getKryptexConfig().baseline_balance_usd).toBe(0);
  });
});
