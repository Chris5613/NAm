import { resourceApi, settingsApi } from "./apiClient";
import {
  hydrate,
  remoteStorage,
  flushPendingWrites,
  resetStore,
  setStoreErrorHandler,
  refreshCollection,
  isHydrated,
} from "./serverStore";

vi.mock("./apiClient", () => ({
  resourceApi: {
    list: vi.fn(),
    patchProjects: vi.fn(),
    patchRecords: vi.fn(),
    replaceAll: vi.fn(),
  },
  settingsApi: {
    all: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    patch: vi.fn((key, before, after) => Promise.resolve(after)),
  },
}));

const key = "networth_projects";
const initial = [{ id: "p", earned: 1 }, { id: "q", earned: 2 }];
const read = () => JSON.parse(remoteStorage.getItem(key));
const write = (rows) => remoteStorage.setItem(key, JSON.stringify(rows));

beforeEach(async () => {
  resetStore();
  window.sessionStorage.clear();
  vi.clearAllMocks();

  settingsApi.all.mockResolvedValue({});
  settingsApi.get.mockResolvedValue(null);
  settingsApi.patch.mockImplementation((settingKey, before, after) => Promise.resolve(after));
  resourceApi.list.mockImplementation(async (name) =>
    name === "projects" ? initial : []
  );
  resourceApi.patchProjects.mockReset();
  resourceApi.patchRecords.mockReset();

  await hydrate();
});

afterEach(() => resetStore());

test("legacy unsaved journals are discarded and server copy wins on hydrate", async () => {
  resetStore();
  window.sessionStorage.setItem(
    "nam_unsaved_v1:default:networth_prefs",
    JSON.stringify({
      before: { theme: "light" },
      after: { theme: "dark" },
    })
  );
  settingsApi.all.mockResolvedValue({
    networth_prefs: { theme: "server" },
  });

  await hydrate();

  expect(JSON.parse(remoteStorage.getItem("networth_prefs"))).toEqual({
    theme: "server",
  });
  expect(window.sessionStorage.getItem(
    "nam_unsaved_v1:default:networth_prefs"
  )).toBeNull();
  expect(settingsApi.patch).not.toHaveBeenCalled();
});

test("saving an unchanged settings value does not repeat an API write", async () => {
  remoteStorage.setItem("networth_prefs", JSON.stringify({ theme: "dark" }));
  await flushPendingWrites();
  expect(settingsApi.patch).toHaveBeenCalledTimes(1);

  settingsApi.patch.mockClear();
  remoteStorage.setItem("networth_prefs", JSON.stringify({ theme: "dark" }));
  await flushPendingWrites();

  expect(settingsApi.patch).not.toHaveBeenCalled();
});

test("overlapping project flushes serialize writes and preserve newer local edits", async () => {
  let finish;
  const first = new Promise((resolve) => { finish = resolve; });

  resourceApi.patchProjects
    .mockReturnValueOnce(first)
    .mockResolvedValueOnce([{ id: "p", earned: 3 }, initial[1]]);

  write([{ id: "p", earned: 2 }, initial[1]]);
  const pending = flushPendingWrites();

  await Promise.resolve();
  await Promise.resolve();

  write([{ id: "p", earned: 3 }, initial[1]]);
  const next = flushPendingWrites();

  finish([{ id: "p", earned: 2 }, initial[1]]);
  await Promise.all([pending, next]);

  expect(resourceApi.patchProjects).toHaveBeenCalledTimes(2);
  expect(resourceApi.patchProjects.mock.calls[1][0]).toEqual([
    {
      id: "p",
      before: { id: "p", earned: 2 },
      after: { id: "p", earned: 3 },
    },
  ]);
  expect(read()[0].earned).toBe(3);
});

test("project stale-write conflict automatically replaces local data with server copy", async () => {
  const onError = vi.fn();
  setStoreErrorHandler(onError);

  const server = [
    { id: "p", earned: 8 },
    { id: "q", earned: 2 },
    { id: "remote", earned: 4 },
  ];
  resourceApi.patchProjects.mockRejectedValueOnce(
    Object.assign(new Error("stale"), { status: 409 })
  );
  resourceApi.list.mockImplementation(async (name) =>
    name === "projects" ? server : []
  );

  write([{ id: "p", earned: 5 }, initial[1]]);
  await flushPendingWrites();

  expect(read()).toEqual(server);
  expect(onError).not.toHaveBeenCalled();
});

test("setting stale-write conflict automatically replaces local data with server copy", async () => {
  const onError = vi.fn();
  setStoreErrorHandler(onError);

  remoteStorage.setItem("networth_prefs", JSON.stringify({ theme: "local" }));
  settingsApi.patch.mockRejectedValueOnce(
    Object.assign(new Error("stale"), { status: 409 })
  );
  settingsApi.get.mockResolvedValue({ theme: "server" });

  await flushPendingWrites();

  expect(JSON.parse(remoteStorage.getItem("networth_prefs"))).toEqual({
    theme: "server",
  });
  expect(onError).not.toHaveBeenCalled();
});

test("non-conflict failed setting save remains visible only in the current tab", async () => {
  const onError = vi.fn();
  setStoreErrorHandler(onError);

  settingsApi.patch.mockRejectedValueOnce(new Error("offline"));
  remoteStorage.setItem("networth_prefs", JSON.stringify({ theme: "local" }));

  await flushPendingWrites();

  expect(JSON.parse(remoteStorage.getItem("networth_prefs"))).toEqual({
    theme: "local",
  });
  expect(onError).toHaveBeenCalledTimes(1);
  expect(window.sessionStorage.length).toBe(0);

  resetStore();
  settingsApi.all.mockResolvedValue({
    networth_prefs: { theme: "server" },
  });
  await hydrate();

  expect(JSON.parse(remoteStorage.getItem("networth_prefs"))).toEqual({
    theme: "server",
  });
});

test("late responses cannot repopulate a signed-out store", async () => {
  let finish;
  resourceApi.patchProjects.mockImplementation(
    () => new Promise((resolve) => { finish = resolve; })
  );

  write([{ id: "p", earned: 2 }]);
  const pending = flushPendingWrites();

  await Promise.resolve();
  await Promise.resolve();

  resetStore();
  finish([{ id: "p", earned: 2 }]);
  await pending;

  expect(remoteStorage.getItem(key)).toBeNull();
});

test("same-name financial projects retain distinct IDs through local save", async () => {
  const projects = [
    ...initial,
    { id: "lulo-one", category: "yield", name: "Lulo", earned: 4 },
    { id: "lulo-two", category: "yield", name: "Lulo", earned: 9 },
  ];

  resourceApi.patchProjects.mockResolvedValue(projects);
  write(projects);
  await flushPendingWrites();

  expect(resourceApi.patchProjects).toHaveBeenCalledTimes(1);
  expect(resourceApi.patchProjects.mock.calls[0][0].map((change) => change.id))
    .toEqual(["lulo-one", "lulo-two"]);
  expect(read().map((project) => project.id))
    .toEqual(projects.map((project) => project.id));
});

test("invalid duplicate project IDs stay visible without a destructive save", async () => {
  const onError = vi.fn();
  setStoreErrorHandler(onError);

  const duplicates = [
    { id: "p", earned: 11 },
    { id: "p", earned: 22 },
  ];

  write(duplicates);
  await flushPendingWrites();

  expect(resourceApi.patchProjects).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledWith(
    expect.stringContaining("unique, nonempty string IDs")
  );
  expect(read()).toEqual(duplicates);
  expect(resourceApi.replaceAll).not.toHaveBeenCalled();
});

test("a delayed old-account hydrate cannot refill memory after sign-out", async () => {
  let finishSettings;
  settingsApi.all.mockImplementationOnce(
    () => new Promise((resolve) => { finishSettings = resolve; })
  );

  const pending = hydrate();
  expect(isHydrated()).toBe(false);

  resetStore();
  finishSettings({ "sensitive-old-account-key": { amount: 123 } });
  await pending;

  expect(isHydrated()).toBe(false);
  expect(remoteStorage.getItem("sensitive-old-account-key")).toBeNull();
  expect(remoteStorage.getItem("networth_projects")).toBeNull();
});

test("late collection refresh cannot repopulate the signed-out cache", async () => {
  let finish;
  resourceApi.list.mockImplementationOnce(
    () => new Promise((resolve) => { finish = resolve; })
  );

  const pending = refreshCollection("networth_assets");
  while (!finish) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  resetStore();
  finish([{ id: "old-account-asset", manual_value: 999 }]);
  await pending;

  expect(remoteStorage.getItem("networth_assets")).toBeNull();
  expect(isHydrated()).toBe(false);
});

test("a superseded hydrate cannot overwrite a newer successful login", async () => {
  let finishOldSettings;
  settingsApi.all
    .mockImplementationOnce(
      () => new Promise((resolve) => { finishOldSettings = resolve; })
    )
    .mockResolvedValueOnce({ "account-label": "new" });

  const stale = hydrate();
  const fresh = hydrate();

  await fresh;
  finishOldSettings({ "account-label": "old" });
  await stale;

  expect(isHydrated()).toBe(true);
  expect(remoteStorage.getItem("account-label")).toBe("new");
});

test("other collections send only changed records", async () => {
  resourceApi.patchRecords.mockResolvedValue([
    { id: "asset", name: "New" },
  ]);

  remoteStorage.setItem(
    "networth_assets",
    JSON.stringify([{ id: "asset", name: "New" }])
  );
  await flushPendingWrites();

  expect(resourceApi.patchRecords).toHaveBeenCalledWith("assets", [
    {
      id: "asset",
      before: null,
      after: { id: "asset", name: "New" },
    },
  ]);
});

test("refresh preserves current-tab asset edits after a non-conflict save failure", async () => {
  resourceApi.patchRecords.mockRejectedValueOnce(new Error("offline"));

  remoteStorage.setItem(
    "networth_assets",
    JSON.stringify([{ id: "asset", name: "Mine" }])
  );
  await flushPendingWrites();
  await refreshCollection("networth_assets");

  expect(
    JSON.parse(remoteStorage.getItem("networth_assets"))[0].name
  ).toBe("Mine");
});
