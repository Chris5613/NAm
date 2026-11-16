import { rtx5080PaybackPhoto } from "./MiningPowerCard";
import { hardwareImageFor } from "@/lib/hardwarePhotos";

describe("Mining Power RTX 5080 hardware photo", () => {
  test("shows the transparent default rather than a legacy photo background", () => {
    const photo = "data:image/png;base64,iVBORw0KGgo=";
    const hardware = [
      { name: "RTX 5080", photo },
      { name: "ASUS GeForce RTX 5080", photo },
    ];
    expect(rtx5080PaybackPhoto(hardware))
      .toBe("/gpu/asus-rtx5080-transparent.webp");
  });

  test("falls back to Hardware Payback's built-in RTX 5080 illustration", () => {
    const expected = hardwareImageFor({ name: "ASUS RTX 5080" });
    expect(rtx5080PaybackPhoto([])).toBe(expected);
    expect(rtx5080PaybackPhoto([{ name: "ASUS RTX 5080" }])).toBe(expected);
  });
});
