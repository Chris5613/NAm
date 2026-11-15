import fs from "fs";
import path from "path";

const load = file => fs.readFileSync(path.resolve(__dirname,file),"utf8");

test("Passive Income uses in-page provider polling, never a browser page reload", () => {
  const page = load("./YieldFarmingPage.jsx");
  expect(page).toMatch(/window\.setInterval\(fullRefresh,\s*60000\)/);
  expect(page).toMatch(/window\.setInterval\(quickRefresh,\s*15000\)/);
  expect(page).toMatch(/document\.addEventListener\("visibilitychange",\s*onVisible\)/);
  // Also reject hidden navigation or router redirects on an idle page.
  expect(page).not.toMatch(/window\.location\.(?:reload|assign|replace)\s*\(/);
  expect(page).not.toMatch(/window\.location\s*=\s*/);
});

test("Passive Income and Crypto Dashboard remain distinct direct SPA routes", () => {
  const app=load("../App.js");
  expect(app).toMatch(/path="\/yield-farming"/);
  expect(app).toMatch(/<YieldFarmingPage\s*\/>/);
  expect(app).toMatch(/path="\/crypto-dashboard"/);
  expect(app).toMatch(/<SideHustleDashboard\s*\/>/);
});
