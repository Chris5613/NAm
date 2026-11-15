import { sharedPaybackSources } from "./hardwarePaybackReporting";

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
