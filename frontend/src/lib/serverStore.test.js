import { resourceApi, settingsApi } from "./apiClient";
import { hydrate, remoteStorage, flushPendingWrites, resetStore, setStoreErrorHandler, refreshCollection } from "./serverStore";

jest.mock("./apiClient", () => ({
  resourceApi: { list: jest.fn(), patchProjects: jest.fn(), replaceAll: jest.fn() },
  settingsApi: { all: jest.fn(), set: jest.fn() },
}));
const key = "networth_projects";
const initial = [{ id: "p", earned: 1 }, { id: "q", earned: 2 }];
const read = () => JSON.parse(remoteStorage.getItem(key));
const write = (rows) => remoteStorage.setItem(key, JSON.stringify(rows));

beforeEach(async () => {
  resetStore();
  jest.clearAllMocks();
  settingsApi.all.mockResolvedValue({});
  resourceApi.list.mockImplementation(async (name) => name === "projects" ? initial : []);
  await hydrate();
});
afterEach(() => resetStore());

test("overlapping flushes serialize writes and preserve newer local edits", async () => {
  let finish;
  const first = new Promise((resolve) => { finish = resolve; });
  resourceApi.patchProjects.mockReturnValueOnce(first).mockResolvedValueOnce([{ id: "p", earned: 3 }, initial[1]]);
  write([{ id: "p", earned: 2 }, initial[1]]);
  const pending = flushPendingWrites();
  await Promise.resolve();
  await Promise.resolve();
  write([{ id: "p", earned: 3 }, initial[1]]);
  const next = flushPendingWrites();
  finish([{ id: "p", earned: 2 }, initial[1]]);
  await Promise.all([pending, next]);
  expect(resourceApi.patchProjects).toHaveBeenCalledTimes(2);
  expect(resourceApi.patchProjects.mock.calls[1][0]).toEqual([{ id: "p", before: { id: "p", earned: 2 }, after: { id: "p", earned: 3 } }]);
  expect(read()[0].earned).toBe(3);
  expect(resourceApi.replaceAll).not.toHaveBeenCalled();
});

test("conflicts retain unsaved history and stop automatic overwrites", async () => {
  const onError = jest.fn();
  setStoreErrorHandler(onError);
  resourceApi.patchProjects.mockRejectedValue(Object.assign(new Error("Reload before saving"), { status: 409 }));
  write([{ id: "p", earned: 4 }, initial[1]]);
  await flushPendingWrites();
  await refreshCollection(key);
  write([{ id: "p", earned: 5 }, initial[1]]);
  await flushPendingWrites();
  expect(resourceApi.patchProjects).toHaveBeenCalledTimes(1);
  expect(onError).toHaveBeenCalledTimes(1);
  expect(read()[0].earned).toBe(5);
});

test("late responses cannot repopulate a signed-out store", async () => {
  let finish;
  resourceApi.patchProjects.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  write([{ id: "p", earned: 2 }]);
  const pending = flushPendingWrites();
  await Promise.resolve();
  await Promise.resolve();
  resetStore();
  finish([{ id: "p", earned: 2 }]);
  await pending;
  expect(remoteStorage.getItem(key)).toBeNull();
});

test("same-name financial projects retain both distinct IDs through local save", async () => {
  const projects = [
    ...initial,
    { id: "lulo-one", category: "yield", name: "Lulo", earned: 4 },
    { id: "lulo-two", category: "yield", name: "Lulo", earned: 9 },
  ];
  resourceApi.patchProjects.mockResolvedValue(projects);
  write(projects);
  expect(read()).toHaveLength(4);
  await flushPendingWrites();
  expect(resourceApi.patchProjects).toHaveBeenCalledTimes(1);
  expect(resourceApi.patchProjects.mock.calls[0][0].map((change) => change.id))
    .toEqual(["lulo-one", "lulo-two"]);
  expect(read().map((project) => project.id)).toEqual(projects.map((project) => project.id));
});

test("invalid duplicate project IDs stay in memory without a destructive save", async () => {
  const onError = jest.fn();
  setStoreErrorHandler(onError);
  const duplicates = [{ id: "p", earned: 11 }, { id: "p", earned: 22 }];
  write(duplicates);
  expect(read()).toEqual(duplicates);
  await flushPendingWrites();
  expect(resourceApi.patchProjects).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledWith(expect.stringContaining("unique, nonempty string IDs"));
  expect(read()).toEqual(duplicates);
  // A later automatic flush cannot turn the duplicate into a replace-all write.
  await flushPendingWrites();
  expect(resourceApi.patchProjects).not.toHaveBeenCalled();
  expect(resourceApi.replaceAll).not.toHaveBeenCalled();
});
