/* Static style regression check for NAm. */
const fs = require("node:fs");
const path = require("node:path");
const postcss = require("postcss");

const srcDir = path.resolve(__dirname, "../src");
const errors = [];
function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(filename) : [filename];
  });
}
const files = filesUnder(srcDir);
const cssFiles = files.filter(file => file.endsWith(".css"));
if (cssFiles.length !== 1 || cssFiles[0] !== path.join(srcDir, "index.css")) {
  errors.push("Keep exactly one global stylesheet: src/index.css");
}
if (cssFiles.length === 1) {
  const css = fs.readFileSync(cssFiles[0], "utf8");
  if (css.includes(".nam-content") || css.includes(".nam-dashboard")) {
    errors.push("Page/component styles must not live in index.css");
  }
  try {
    const root = postcss.parse(css, { from: cssFiles[0] });
    root.walkRules(rule => {
      const declarations = new Set();
      for (const node of rule.nodes || []) {
        if (node.type !== "decl") continue;
        const property = node.prop.toLowerCase();
        if (declarations.has(property)) {
          errors.push("Repeated CSS declaration " + property + " in " + rule.selector);
        }
        declarations.add(property);
      }
    });
  } catch (error) {
    errors.push("Invalid CSS: " + error.message);
  }
}
function spacing(token) {
  if (token.includes("\${") || token.includes("}")) return null;
  const parts = token.split(":");
  const utility = parts.pop().replace(/^!/, "");
  const match = /^(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr)-\S+$/.exec(utility);
  if (!match) return null;
  const axis = match[1];
  return {
    token,
    scope: parts.join(":"),
    kind: axis[0],
    edges: axis.length === 1 ? "trbl" : axis[1] === "x" ? "rl" : axis[1] === "y" ? "tb" : axis[1],
  };
}
for (const file of files.filter(file => /\.(jsx|js|tsx|ts)$/.test(file))) {
  const source = fs.readFileSync(file, "utf8");
  // Inspect only individual static JSX className values. The old string
  // scanner crossed JSX boundaries and reported unrelated classes as conflicts.
  const staticClassPattern = /\bclassName\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*"([^"]*)"\s*\}|\{\s*'([^']*)'\s*\})/g;
  for (const literal of source.matchAll(staticClassPattern)) {
    const value = literal[1] ?? literal[2] ?? literal[3] ?? literal[4];
    const utilities = value.split(/\s+/).map(spacing).filter(Boolean);
    for (let i = 0; i < utilities.length; i++) {
      for (let j = i + 1; j < utilities.length; j++) {
        const a = utilities[i];
        const b = utilities[j];
        if (a.scope !== b.scope || a.kind !== b.kind) continue;
        if (![...a.edges].some(edge => b.edges.includes(edge))) continue;
        const line = source.slice(0, literal.index).split("\n").length;
        errors.push(path.relative(srcDir, file) + ":" + line + " overlapping " + a.token + " and " + b.token);
      }
    }
  }
}
const app = fs.readFileSync(path.join(srcDir, "App.js"), "utf8");
const sidebar = fs.readFileSync(path.join(srcDir, "components/Sidebar.jsx"), "utf8");
const sidebarWidth = /w-\[(\d+)px\]/.exec(sidebar)?.[1];
if (!sidebarWidth || !app.includes("pl-[" + sidebarWidth + "px]")) {
  errors.push("Sidebar width and main content left padding must match");
}
if (errors.length) {
  console.error("Style conflict check failed:\n" + errors.map(issue => "- " + issue).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Style conflict check passed: unique CSS rules, no overlapping static spacing utilities, matching sidebar offset.");
}
