import { sharedPaybackSources, fullSourceDailyPaybackCredit } from "./hardwarePaybackReporting";

const sources = device => device.sources || [];

test("shared Kryptex earnings are disclosed when both GPUs claim their full rewards", () => {
  const devices = [
    {id: "2080", sources: ["Kryptex"]},
    {id: "5080", sources: ["Kryptex", "Salad"]},
  ];
  expect(sharedPaybackSources(devices, sources)).toEqual(["Kryptex"]);
});

test("a sole source per device has no overlap disclosure", () => {
  expect(sharedPaybackSources([
    {id: "2080", sources: ["Kryptex"]},
    {id: "5080", sources: ["Salad"]},
  ], sources)).toEqual([]);
});

test("duplicate provider in one device is not shared unless another device uses it", () => {
  expect(sharedPaybackSources([
    {id: "2080", sources: ["Kryptex", "Kryptex"]},
  ], sources)).toEqual([]);
});

test("daily GPU estimates use full shared Kryptex income, not cost-weighted shares", () => {
  const daily = provider => ({ Kryptex: 4, Salad: 0.5 })[provider] || 0;
  const rtx2080 = fullSourceDailyPaybackCredit(["Kryptex"], daily);
  const rtx5080 = fullSourceDailyPaybackCredit(["Kryptex", "Salad"], daily);
  expect(rtx2080).toBe(4);
  expect(rtx5080).toBe(4.5);
  // The numbers are per-device payback credits, NOT unique revenue of $8.50.
  expect(sharedPaybackSources([
    { sources: ["Kryptex"] },
    { sources: ["Kryptex", "Salad"] },
  ], sources)).toEqual(["Kryptex"]);
});

test("duplicate source selection on one device is credited once", () => {
  expect(fullSourceDailyPaybackCredit(["Kryptex", "Kryptex"], () => 3.5)).toBe(3.5);
  expect(fullSourceDailyPaybackCredit(["Kryptex"], () => NaN)).toBe(0);
});
