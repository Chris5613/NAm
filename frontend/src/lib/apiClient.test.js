import { api, authApi, ApiError, spendingApi } from "./apiClient";

beforeEach(() => {
  global.fetch = jest.fn();
});

const ok = (data) => ({ ok: true, status: 200, text: jest.fn().mockResolvedValue(JSON.stringify(data)) });

test("authenticated SimpleFIN sync sends only the connection ID, never access credentials", async () => {
  global.fetch.mockResolvedValue(ok({ accounts: 2, received_transactions: 4, transactions: [] }));
  const result = await api.post("/api/simplefin/sync", { connection_id: "safe-connection-id" });
  expect(result.accounts).toBe(2);
  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toContain("/api/simplefin/sync");
  expect(options.method).toBe("POST");
  expect(options.credentials).toBe("include");
  expect(JSON.parse(options.body)).toEqual({ connection_id: "safe-connection-id" });
  expect(options.body).not.toContain("access_url");
  expect(options.body).not.toContain("password");
});

test("change-password requests include credentials and do not put password in the URL", async () => {
  global.fetch.mockResolvedValue(ok({ ok: true }));
  await authApi.changePassword("old-test-only-password", "new-test-only-password");
  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toContain("/api/auth/change-password");
  expect(options.credentials).toBe("include");
  expect(url).not.toContain("password");
  expect(JSON.parse(options.body)).toEqual({
    current_password: "old-test-only-password",
    new_password: "new-test-only-password",
  });
});

test("spending save sends JSON and surfaces server validation errors", async () => {
  global.fetch.mockResolvedValueOnce({
    ok: false, status: 422, text: jest.fn().mockResolvedValue(JSON.stringify({ detail: "date must be valid" })),
  });
  await expect(spendingApi.saveTransaction({ amount: 10, date: "not-a-date" }))
    .rejects.toMatchObject({ name: "ApiError", status: 422, message: "date must be valid" });
});

test("SimpleFIN backend HTTP errors are preserved without exposing raw HTML", async () => {
  global.fetch.mockResolvedValueOnce({
    ok: false, status: 404,
    text: jest.fn().mockResolvedValue(JSON.stringify({ detail: "SimpleFIN rejected the request. HTTP 404." })),
  });
  await expect(api.post("/api/simplefin/sync", { connection_id: "safe-id" }))
    .rejects.toMatchObject({ name: "ApiError", status: 404, message: "SimpleFIN rejected the request. HTTP 404." });
});

test("network failures become a recoverable ApiError", async () => {
  global.fetch.mockRejectedValueOnce(new TypeError("failed to fetch"));
  await expect(api.get("/api/spending/accounts"))
    .rejects.toMatchObject({ name: "ApiError", status: 0 });
});

test("account reads use cookie credentials but send no body", async () => {
  global.fetch.mockResolvedValueOnce(ok([{ id: "account-1", name: "Checking" }]));
  const data = await spendingApi.accounts();
  expect(data).toHaveLength(1);
  const [, options] = global.fetch.mock.calls[0];
  expect(options.method).toBe("GET");
  expect(options.credentials).toBe("include");
  expect(options.body).toBeUndefined();
});
