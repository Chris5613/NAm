import { walletIdentityKey, exactNameKey } from "./api";

describe("wallet duplicate guards", () => {
  it("treats exact wallet identity as the same record", () => {
    expect(walletIdentityKey({ chain: "solana", address: "abc123" })).toBe("solana::abc123");
    expect(walletIdentityKey({ chain: "solana", address: "abc123" })).toBe(
      walletIdentityKey({ chain: "solana", address: " abc123 " })
    );
  });

  it("does not collapse different names by fuzzy casing or whitespace", () => {
    expect(exactNameKey("My Wallet")).toBe("My Wallet");
    expect(exactNameKey("my wallet")).not.toBe(exactNameKey("My Wallet"));
    expect(walletIdentityKey({ chain: "solana", address: "abc123" })).not.toBe(
      walletIdentityKey({ chain: "solana", address: "ABC123" })
    );
  });
});
