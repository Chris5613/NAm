import { summarizeKryptexStatus } from "./kryptexSync";

describe("Kryptex local status", () => {
  it("summarizes current GPU telemetry and account balances", () => {
    const result = summarizeKryptexStatus({
      balance: { total: 2.854599, withdrawable: 2.362266 },
      devices: [{
        device: { type: "gpu", name: "NVIDIA GeForce RTX 5070" },
        reading: { core_temperature: 75, power_usage: 247, fan_speed: 77 },
        state: { state: "mining" },
        process: {
          miner_version: { miner: { name: "srbminer" } },
          algorithm_combination: {
            algorithms: [{
              coin: "prl",
              algorithm: "pearlhash",
              reading: {
                hashrate: 122157778826875.55,
                profitability: 1.336406,
                shares: { accepted: 25, rejected: 1 },
              },
            }],
          },
        },
      }],
    });

    expect(result.balance_usd).toBe(2.854599);
    expect(result.withdrawable_usd).toBe(2.362266);
    expect(result.profitability_usd_day).toBe(1.336406);
    expect(result.miners).toEqual([expect.objectContaining({
      device: "NVIDIA GeForce RTX 5070",
      device_type: "gpu",
      coin: "prl",
      algorithm: "pearlhash",
      temperature_c: 75,
      power_w: 247,
      fan_percent: 77,
      accepted_shares: 25,
      rejected_shares: 1,
      state: "mining",
    })]);
  });

  it("ignores devices without a running process", () => {
    const result = summarizeKryptexStatus({
      balance: { total: 1 },
      devices: [{ device: { name: "Offline GPU" }, process: null }],
    });

    expect(result.miners).toEqual([]);
    expect(result.profitability_usd_day).toBe(0);
  });
});