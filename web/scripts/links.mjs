/**
 * Static + live audit of the seams: every internal link must resolve to a router
 * route, every /api path the client calls must exist in the OpenAPI schema, and every
 * demo deep-link (?demo=1&plan=…&next=…) must actually land where it promises.
 *   node scripts/links.mjs
 */
import { JSDOM, VirtualConsole } from "jsdom";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = process.env.API_ORIGIN || "http://127.0.0.1:8000";
const src = path.join(root, "src");

let failed = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${ok ? "" : ` — ${extra}`}`);
  if (!ok) failed += 1;
};

const files = [];
const fs = await import("node:fs");
const readdir = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) readdir(p); else if (/\.jsx?$/.test(e.name)) files.push(p);
  }
};
readdir(src);
const all = files.map((f) => ({ f, text: fs.readFileSync(f, "utf8") }));

/* ---------------------------------------------------- 1. router route table */
// React Router nests: children are relative to their parent, so compose the full
// table before matching anything against it.
const app = all.find((x) => x.f.endsWith("App.jsx")).text;
const raw = [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);
const absolute = raw.filter((r) => r.startsWith("/"));
const appParent = absolute.find((r) => /^\/app\/\*$/.test(r)) || "/app";
const base = appParent.replace(/\/?\*$/, "");
const children = raw.filter((r) => !r.startsWith("/")).map((r) => `${base}/${r.replace(/\/?\*$/, "")}`);
const table = [...new Set([...absolute, ...children])]
  .map((r) => r.replace(/\/?\*$/, "") || "/")
  .filter((r) => r !== "");
const staticRoutes = table.filter((r) => !r.includes(":"));
const patternRoutes = table.filter((r) => r.includes(":"));
const known = new Set(staticRoutes);
const regexes = patternRoutes.map((r) => new RegExp(`^${r.replace(/:[a-zA-Z]+/g, "[^/]+")}$`));
const resolves = (to) => {
  const [p] = to.split("?");
  // interpolate template literals into a segment that the :param patterns accept
  const clean = p.replace(/\$\{[^}]*\}/g, "x").replace(/\/$/, "") || "/";
  return known.has(clean) || regexes.some((re) => re.test(clean));
};

const links = [];
for (const { f, text } of all) {
  for (const m of text.matchAll(/to="([^"]+)"/g)) links.push([f, m[1]]);
  for (const m of text.matchAll(/to=\{`([^`]+)`\}/g)) links.push([f, m[1]]);
  for (const m of text.matchAll(/nav\(`([^`]+)`/g)) links.push([f, m[1]]);
  for (const m of text.matchAll(/next=([^"`&\s]+)/g)) links.push([f, m[1].startsWith("/") ? m[1] : `/${m[1]}`]);
  for (const m of text.matchAll(/window\.location\.href = "([^"]+)"/g)) links.push([f, m[1]]);
}
const internal = links.filter(([, to]) => to.startsWith("/") && !to.startsWith("//"));
const badLinks = [...new Set(internal.filter(([, to]) => !resolves(to)).map(([f, to]) => `${path.relative(root, f)} → ${to}`))];
check(`every internal link resolves to a route (${internal.length} checked, ${table.length} routes)`,
  badLinks.length === 0, badLinks.join(" | "));

/* -------------------------------------------------- 2. API paths vs OpenAPI */
const spec = await (await fetch(`${API}/openapi.json`)).json();
const apiPaths = new Set(Object.keys(spec.paths));
const declared = (p) => apiPaths.has(p)
  || [...apiPaths].some((d) => new RegExp(`^${d.replace(/\{[a-zA-Z_]+\}/g, "[^/]+")}$`).test(p));
const calls = new Map();   // path -> was it an interpolated prefix (…/${id})
for (const { text } of all) {
  for (const m of text.matchAll(/["'`]\/api\/([^"'`]+)/g)) {
    const rest = m[1];
    const interp = rest.includes("${");
    const p = "/api/" + rest.split("?")[0].split("${")[0];
    if (!p.includes("${")) calls.set(p.replace(/\/$/, "") || "/api", interp);
  }
}
const unknown = [...calls].filter(([p, interp]) => !(declared(p) || (interp && [...apiPaths].some((d) => d.startsWith(p.replace(/\/$/, "") + "/")))))
  .map(([p]) => p);
check(`every /api path exists in the spec (${calls.size} used)`, unknown.length === 0, unknown.join(" | "));

/* --- response shapes the SPA reads, straight from the spec's examples --- */
const required = ["/api/health", "/api/meta", "/api/me", "/api/documents", "/api/templates",
                  "/api/prompts", "/api/analytics/usage", "/api/billing/plans", "/api/billing/subscription",
                  "/api/workspaces"];
const missingSpec = required.filter((p) => !apiPaths.has(p));
check(`core endpoints are documented in OpenAPI (${required.length} checked)`, missingSpec.length === 0, missingSpec.join(" | "));

/* --------------------------------- 3. media/asset references exist on disk */
const assetRefs = [...new Set(all.flatMap(({ text }) => [...text.matchAll(/["'`](\/(?!api\/)[a-zA-Z0-9._/-]+\.(svg|png|jpg|ico|json|webmanifest))/g)].map((m) => m[1])))];
const { existsSync } = fs;
const missingAssets = assetRefs.filter((a) => {
  const publicFile = path.join(root, "public", a);
  const distFile = path.join(root, "dist", a);
  const srcFile = path.join(root, "src", a);
  return !(existsSync(publicFile) || existsSync(distFile) || existsSync(srcFile));
});
check(`static assets referenced by the app exist (${assetRefs.length || 0} refs)`, missingAssets.length === 0, missingAssets.join(" | "));

/* ------------------------------------- 4. demo deep-links from the marketing pages */
await build({
  entryPoints: [path.join(root, "src/main.jsx")],
  bundle: true, format: "iife", outfile: path.join(root, ".smoke/app.js"),
  loader: { ".js": "jsx", ".css": "css" }, jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "error",
});
const js = fs.readFileSync(path.join(root, ".smoke/app.js"), "utf8");

const demoLinks = [...new Set(all.flatMap(({ text }) => [...text.matchAll(/to="(\/signin\?[^"]+)"/g)].map((m) => m[1])))];
check(`demo deep-links present (${demoLinks.length})`, demoLinks.length > 0);

for (const link of demoLinks) {
  const problems = [];
  const vc = new VirtualConsole();
  vc.on("error", (...a) => problems.push(a.join(" ").slice(0, 160)));
  vc.on("jsdomError", (e) => problems.push(e.message.slice(0, 160)));
  const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
    url: `http://preview.local${link}`, runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc,
  });
  const { window } = dom;
  window.fetch = (i, init) => fetch(typeof i === "string" && i.startsWith("/") ? API + i : i, init);
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe(t) { this.cb([{ isIntersecting: true, target: t }], this); } unobserve() {} disconnect() {} };
  window.scrollTo = () => {};
  window.eval(js);
  await new Promise((r) => setTimeout(r, 2600));
  const q = new URLSearchParams(link.split("?")[1] || "");
  const want = q.get("next") || "/app";
  const got = window.document.location.pathname;
  const landed = got === want.split("?")[0] || (want.startsWith("/app/create") && got.startsWith("/app/create"));
  check(`deep-link ${link}`, landed && !problems.length, `landed=${got} problems=${problems.slice(0, 1).join(" / ") || "-"}`);

  if (q.get("plan")) {
    const me = await (await fetch(`${API}/api/me`, { headers: { Authorization: `Bearer ${window.localStorage.getItem("nebula.token")}` } })).json();
    check(`  plan=${q.get("plan")} applied`, me.user.plan === q.get("plan"), `got ${me.user.plan}`);
  }
  window.close();
}

console.log(failed ? `\n${failed} audit issues` : "\nno dead links, no unknown endpoints, all demo deep-links land");
process.exit(failed ? 1 : 0);
