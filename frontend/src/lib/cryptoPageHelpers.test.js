import { getDisplayDefiTokens, shortenAddr } from "./cryptoPageHelpers";

test("DeFi display tokens hide synthetic labels but keep real assets", () => {
  const tokens = getDisplayDefiTokens({
    type: "Lending",
    tokens: [
      { symbol: "USDC", name: "USD Coin" },
      { symbol: "deposit", name: "Deposit" },
      { symbol: "Lending", name: "Lending" },
    ],
  });
  expect(tokens.map((token) => token.symbol)).toEqual(["USDC"]);
});

test("wallet addresses are shortened without changing short values", () => {
  expect(shortenAddr("1234567890abcdef")).toBe("123456...cdef");
  expect(shortenAddr("short")).toBe("short");
});
