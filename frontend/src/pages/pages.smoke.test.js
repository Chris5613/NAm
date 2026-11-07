import React from "react";
import { renderToString } from "react-dom/server";

import SpendingPage from "./SpendingPage";
import CloudPage from "./CloudPage";
import CryptoPage from "./CryptoPage";
import DoorDashPage from "./DoorDashPage";

jest.mock("../lib/AuthContext", () => ({
  useAuth: () => ({
    user: { username: "test" },
    isAuthenticated: true,
    loading: false,
  }),
}));

jest.mock("../lib/apiClient", () => ({
  api: {
    get: jest.fn(async () => ({})),
    post: jest.fn(async () => ({})),
    put: jest.fn(async () => ({})),
    patch: jest.fn(async () => ({})),
    delete: jest.fn(async () => ({})),
  },
  settingsApi: {
    get: jest.fn(async () => null),
    set: jest.fn(async () => ({})),
  },
  spendingApi: {
    accounts: jest.fn(async () => []),
    transactions: jest.fn(async () => []),
    hiddenTransactions: jest.fn(async () => []),
    budget: jest.fn(async () => ({ budget: 0 })),
  },
}));

jest.mock("../lib/external-apis", () => ({
  coinGeckoApi: {
    getPrice: jest.fn(async () => 0),
    getPrices: jest.fn(async () => ({})),
  },
}));

describe("major page smoke rendering", () => {
  const pages = [
    ["Spending", SpendingPage],
    ["Cloud", CloudPage],
    ["Crypto", CryptoPage],
    ["DoorDash", DoorDashPage],
  ];

  test.each(pages)("%s page renders without a synchronous crash", (_name, Page) => {
    expect(() => renderToString(<Page />)).not.toThrow();
  });
});
