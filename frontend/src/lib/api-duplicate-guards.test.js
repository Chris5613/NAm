import { walletIdentityKey, exactNameKey } from "./api";

describe("exact duplicate guards", () => {
  it("treats exact wallet identity as the same record", () => {
    expect(walletIdentityKey({ chain: "solana", address: "abc123" })).toBe("solana::abc123");
    expect(walletIdentityKey({ chain: "solana", address: "abc123" })).toBe(
      walletIdentityKey({ chain: "solana", address: " abc123 " })
    );
  });

  it("keeps project and asset names exact rather than fuzzy", () => {
    expect(exactNameKey("My Project")).toBe("My Project");
    expect(exactNameKey("my project")).not.toBe(exactNameKey("My Project"));
    expect(exactNameKey("BTC")).toBe("BTC");
    expect(exactNameKey("btc")).not.toBe(exactNameKey("BTC"));
  });

  it("does not collapse different wallet addresses by casing or spacing", () => {
    expect(walletIdentityKey({ chain: "solana", address: "abc123" })).not.toBe(
      walletIdentityKey({ chain: "solana", address: "ABC123" })
    );
    expect(walletIdentityKey({ chain: "solana", address: "abc123" })).not.toBe(
      walletIdentityKey({ chain: "solana", address: " abc123 " })
    );
  });
});
