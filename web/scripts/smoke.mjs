/**
 * Route smoke test: bundles the app, mounts each route in jsdom against the
 * live FastAPI backend, and fails on console errors or missing content.
 *   node scripts/smoke.mjs
 */
import { JSDOM, VirtualConsole } from "jsdom";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const API = process.env.API_ORIGIN || "http://127.0.0.1:8000";
const OUT = path.join(root, ".smoke");

await build({
  entryPoints: [path.join(root, "src/main.jsx")],
  bundle: true,
  format: "iife",
  outfile: path.join(OUT, "app.js"),
  loader: { ".js": "jsx", ".css": "css" },
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  logLevel: "error",
});

const js = readFileSync(path.join(OUT, "app.js"), "utf8");
const css = readFileSync(path.join(OUT, "app.css"), "utf8");

const ROUTES = [
  ["/", ["Nebula Studio", "content analyzer", "Generate, analyse"]],
  ["/features", ["Feature tour", "Generation", "Refinement"]],
  ["/pricing", ["Credits for the model", "Most popular"]],
  ["/signin", ["demo@nebula.studio", "Continue with the demo workspace", "Sign in"]],
  ["/signup", ["Create your account", "Create workspace"]],
  ["/signin?demo=1", ["Nebula Studio", "Overview"]],
  ["/app", ["Usage", "Recent generations", "Brand voice"]],
  ["/app/create/blog", ["Format", "Generate", "Brief"]],
  ["/app/create/analyze", ["Analyze"]],
  ["/app/create/image", ["Art direction", "Aspect ratio"]],
  ["/app/documents", ["Generation library"]],
  ["/app/templates", ["Content templates"]],
  ["/app/prompts", ["Prompt library"]],
  ["/app/analytics", ["Usage analytics", "Per-feature breakdown"]],
  ["/app/billing", ["Current subscription", "Invoices"]],
  ["/app/settings", ["Workspace", "Brand voice"]],
];

let token = "";
{
  const res = await fetch(`${API}/api/auth/demo`, { method: "POST" });
  token = (await res.json()).token;
}

const failures = [];
for (const [route, expects] of ROUTES) {
  const vc = new VirtualConsole();
  const problems = [];
  vc.on("jsdomError", (e) => problems.push(`jsdomError: ${e.message}`));
  vc.on("error", (...a) => problems.push(`console.error: ${a.join(" ").slice(0, 300)}`));

  const dom = new JSDOM(`<!doctype html><html><head><style>${css}</style></head><body><div id="root"></div></body></html>`, {
    url: `http://preview.local${route}`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const { window } = dom;
  if (!["/signin", "/signup"].includes(route)) window.localStorage.setItem("nebula.token", token);
  window.fetch = (input, init) => {
    const url = typeof input === "string" && input.startsWith("/") ? API + input : input;
    return fetch(url, init);
  };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; }
    observe(t) { this.cb([{ isIntersecting: true, target: t }], this); }
    unobserve() {} disconnect() {}
  };
  window.scrollTo = () => {};
  window.onerror = (m) => problems.push(`window.onerror: ${m}`);
  window.addEventListener("unhandledrejection", (e) => problems.push(`unhandled: ${e.reason}`));

  try {
    window.eval(js);
    await new Promise((r) => setTimeout(r, route.startsWith("/app") ? 1400 : 900));
    const html = window.document.getElementById("root").innerHTML;
    const missing = expects.filter((needle) => !html.includes(needle));
    if (missing.length) problems.push(`missing text: ${missing.join(" | ")}`);
    if (/<svg[^>]*><\/svg>\s*$/.test(html) && html.length < 400) problems.push("root nearly empty");
  } catch (err) {
    problems.push(`throw: ${err.message}\n${(err.stack || "").split("\n").slice(1, 4).join("\n")}`);
  }

  const ok = !problems.length;
  console.log(`${ok ? "  ok  " : " FAIL "} ${route.padEnd(22)} ${ok ? "" : problems.join(" ;; ")}`);
  if (!ok) {
    failures.push(route);
    const html = window.document.getElementById("root")?.innerHTML || "";
    failures.push(`   html(${html.length}): ${html.replace(/\s+/g, " ").slice(0, 400)}`);
  }
  window.close();
}

console.log(failures.length ? `\n${failures.length} failing route checks` : `\nall ${ROUTES.length} routes rendered clean`);
process.exit(failures.length ? 1 : 0);
