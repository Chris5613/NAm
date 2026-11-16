import { hardwareImageFor } from "./hardwarePhotos";

describe("Shared RTX 5080 transparent image", () => {
  test("uses the transparent ASUS cutout for RTX 5080 on both screens", () => {
    expect(hardwareImageFor({ name: "ASUS RTX 5080" }))
      .toBe("/gpu/asus-rtx5080-transparent.webp");
    expect(hardwareImageFor({ name: "RTX 5080" }))
      .toBe("/gpu/asus-rtx5080-transparent.webp");
  });

  test("RTX 5080 uses transparent cutout instead of a legacy uploaded photo", () => {
    const photo = "data:image/png;base64,iVBORw0KGgo=";
    expect(hardwareImageFor({ name: "ASUS RTX 5080", photo }))
      .toBe("/gpu/asus-rtx5080-transparent.webp");
    expect(hardwareImageFor({ name: "RTX 2080 Super", photo })).toBe(photo);
  });

  test("does not change the other GPU images", () => {
    expect(hardwareImageFor({ name: "RTX 2080 Super" })).toBe("/gpu/rtx2080-super.webp");
    expect(hardwareImageFor({ name: "RTX 5070" })).toBe("/gpu/rtx5070-msi.webp");
  });
});
