/**
 * Development-build checks. Two things only the dev bundle can show:
 *   1. React's own warnings (duplicate keys, invalid DOM nesting, controlled/uncontrolled
 *      inputs) — they are stripped from production builds.
 *   2. StrictMode hazards: dev double-invokes renders and remounts effects, so any
 *      side effect hidden in a render (like consuming a sessionStorage handoff) breaks.
 *   node scripts/dev.mjs
 */
import { JSDOM, VirtualConsole } from "jsdom";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
const root = "/home/user/AI-content-any/web";
const API = "http://127.0.0.1:8000";
await build({
  entryPoints: [`${root}/src/main.jsx`], bundle: true, format: "iife",
  outfile: `${root}/.smoke/app.dev.js`, loader: { ".js": "jsx", ".css": "css" },
  jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' }, logLevel: "error",
});
const js = readFileSync(`${root}/.smoke/app.dev.js`, "utf8");
const { token } = await (await fetch(`${API}/api/auth/demo`, { method: "POST" })).json();
const ROUTES = ["/", "/features", "/pricing", "/signin", "/signup", "/app", "/app/create/blog",
  "/app/create/text", "/app/create/caption", "/app/create/image", "/app/create/rewrite",
  "/app/create/summarize", "/app/create/seo", "/app/create/analyze", "/app/documents",
  "/app/templates", "/app/prompts", "/app/analytics", "/app/billing", "/app/settings"];
let bad = 0;
for (const route of ROUTES) {
  const msgs = [];
  const vc = new VirtualConsole();
  for (const lvl of ["error", "warn"]) vc.on(lvl, (...a) => {
    const s = a.map((x) => (x && x.stack ? String(x.stack).split("\n")[0] : String(x))).join(" ").slice(0, 240);
    if (!/Download the React DevTools|React Router Future Flag/i.test(s)) msgs.push(`${lvl}: ${s}`);
  });
  vc.on("jsdomError", (e) => msgs.push("jsdomError: " + e.message.slice(0, 200)));
  const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`,
    { url: `http://preview.local${route}`, runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
  const { window } = dom;
  if (!route.startsWith("/sign")) window.localStorage.setItem("nebula.token", token);
  window.fetch = (i, init) => fetch(typeof i === "string" && i.startsWith("/") ? API + i : i, init);
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe(t) { this.cb([{ isIntersecting: true, target: t }], this); } unobserve() {} disconnect() {} };
  window.scrollTo = () => {}; window.onerror = (m) => msgs.push("onerror: " + m);
  window.eval(js);
  await new Promise((r) => setTimeout(r, 1600));
  const uniq = [...new Set(msgs)];
  if (uniq.length) { bad += uniq.length; console.log(` FAIL ${route}`); uniq.slice(0, 6).forEach((m) => console.log(`        ${m}`)); }
  else console.log(`  ok   ${route}`);
  window.close();
}
/* ---- 2. StrictMode probe: the one-shot handoffs must survive double rendering ---- */
{
  const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`,
    { url: "http://preview.local/app/templates", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  window.localStorage.setItem("nebula.token", token);
  window.fetch = (i, init) => fetch(typeof i === "string" && i.startsWith("/") ? API + i : i, init);
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe(t) { this.cb([{ isIntersecting: true, target: t }], this); } unobserve() {} disconnect() {} };
  window.scrollTo = () => {};
  window.eval(js);
  await new Promise((r) => setTimeout(r, 1800));
  const useBtn = [...window.document.querySelectorAll("button")]
    .find((b) => (b.textContent || "").trim().startsWith("Use"));
  if (!useBtn) { console.log(" FAIL template card not found in dev build"); bad += 1; }
  useBtn?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, view: window }));
  await new Promise((r) => setTimeout(r, 1800));
  const body = window.document.getElementById("root").textContent.replace(/\s+/g, " ");
  const routed = window.document.location.pathname.startsWith("/app/create/");
  const bannerOk = /Loaded from /.test(body);
  const cleared = window.sessionStorage.getItem("nebula.template") === null;
  console.log(`${routed && bannerOk && cleared ? "  ok  " : " FAIL "} StrictMode-safe handoff (routed=${routed} banner=${bannerOk} cleared=${cleared})`);
  if (!(routed && bannerOk && cleared)) bad += 1;
  window.close();
}

console.log(bad ? `\n${bad} dev-mode problems` : "\nno dev-mode warnings and no StrictMode hazards");
process.exit(bad ? 1 : 0);
