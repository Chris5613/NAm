import { rtx5080PaybackPhoto } from "./MiningPowerCard";
import { hardwareImageFor } from "@/lib/hardwarePhotos";

describe("Mining Power RTX 5080 hardware photo", () => {
  test("reuses the exact uploaded ASUS RTX 5080 photo from Hardware Payback", () => {
    const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==";
    const rows = [
      { name: "RTX 2080 Super", photo: "" },
      { name: "ASUS RTX 5080", photo },
    ];
    expect(rtx5080PaybackPhoto(rows)).toBe(photo);
  });

  test("prefers the matching ASUS photo over a different RTX 5080", () => {
    const asus = "data:image/jpeg;base64,asus";
    const other = "data:image/jpeg;base64,other";
    expect(rtx5080PaybackPhoto([
      { name: "RTX 5080", photo: other },
      { name: "ASUS GeForce RTX 5080", photo: asus },
    ])).toBe(asus);
  });

  test("falls back to Hardware Payback's built-in RTX 5080 illustration", () => {
    const expected = hardwareImageFor({ name: "ASUS RTX 5080" });
    expect(rtx5080PaybackPhoto([])).toBe(expected);
    expect(rtx5080PaybackPhoto([{ name: "ASUS RTX 5080" }])).toBe(expected);
  });
});
