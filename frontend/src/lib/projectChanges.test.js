import { projectChanges, rebaseProjects } from "./projectChanges";

test("only the changed project is sent; transaction order is significant", () => {
  const a = { id: "a", transactions: [1, 2] };
  const b = { id: "b", earned: 1 };
  expect(projectChanges([a, b], [{ transactions: [1, 2], id: "a" }, b])).toEqual([]);
  expect(projectChanges([a, b], [{ ...a, transactions: [2, 1] }, b])).toHaveLength(1);
});

test("remote updates and local edits during a save both survive", () => {
  const sent = [{ id: "a", earned: 1 }, { id: "b", earned: 2 }];
  const local = [{ id: "a", earned: 3 }, sent[1], { id: "c" }];
  const saved = [sent[0], { id: "b", earned: 4 }, { id: "d" }];
  expect(rebaseProjects(sent, local, saved)).toEqual([
    { id: "a", earned: 3 }, { id: "b", earned: 4 }, { id: "d" }, { id: "c" },
  ]);
});

test("explicit deletion survives a save response", () => {
  expect(rebaseProjects([{ id: "a" }], [], [{ id: "a" }, { id: "b" }])).toEqual([{ id: "b" }]);
});
