import { reconcileKryptexStatus } from "./kryptexSync";
import { projectsApi } from "./api";
import { localStorage as storage } from "./localStorage";

jest.mock("./api", () => ({ projectsApi: {
  getAll: jest.fn(async () => ({ data: [{ id: "k", name: "Kryptex" }] })),
  update: jest.fn(async () => ({})),
  addTransaction: jest.fn(async () => ({})),
  addToCategory: jest.fn(async () => ({})),
} }));
jest.mock("./localStorage", () => ({ localStorage: {
  getKryptexConfig: jest.fn(), setKryptexConfig: jest.fn(),
} }));

const status = balance_usd => ({ balance_usd, withdrawable_usd: balance_usd, profitability_usd_day: 1, miners: [] });

beforeEach(() => {
  jest.clearAllMocks();
  projectsApi.getAll.mockResolvedValue({ data: [{ id: "k", name: "Kryptex" }] });
  projectsApi.update.mockResolvedValue({});
  projectsApi.addTransaction.mockResolvedValue({});
  projectsApi.addToCategory.mockResolvedValue({});
  let config = { enabled: true, baseline_balance_usd: 100, peak_balance_usd: 100 };
  storage.getKryptexConfig.mockImplementation(() => config);
  storage.setKryptexConfig.mockImplementation(next => { config = next; });
});

test("withdrawal and redeposit preserve the previous earnings peak", async () => {
  expect((await reconcileKryptexStatus(status(60))).action).toBe("withdrawal");
  expect((await reconcileKryptexStatus(status(100))).action).toBe("recovery");
  expect(projectsApi.addTransaction).not.toHaveBeenCalled();
  expect(storage.getKryptexConfig().peak_balance_usd).toBe(100);
  await reconcileKryptexStatus(status(101));
  expect(projectsApi.addTransaction).toHaveBeenCalledTimes(1);
  expect(projectsApi.addTransaction.mock.calls[0][1]).toEqual(expect.objectContaining({ type: "earning", amount: 1 }));
});

test("first reading without a baseline initializes instead of booking a deposit", async () => {
  storage.getKryptexConfig.mockReturnValueOnce({ enabled: true, baseline_balance_usd: null });
  expect((await reconcileKryptexStatus(status(100))).action).toBe("initialized");
  expect(projectsApi.addTransaction).not.toHaveBeenCalled();
});
