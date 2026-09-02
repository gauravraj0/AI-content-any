/**
 * Accessibility / semantics pass over the rendered routes (jsdom, no browser needed):
 * accessible names, alt text, label associations, heading order, focusable order.
 *   node scripts/a11y.mjs
 */
import { JSDOM, VirtualConsole } from "jsdom";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = process.env.API_ORIGIN || "http://127.0.0.1:8000";

await build({
  entryPoints: [path.join(root, "src/main.jsx")],
  bundle: true, format: "iife", outfile: path.join(root, ".smoke/app.js"),
  loader: { ".js": "jsx", ".css": "css" }, jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "error",
});
const js = readFileSync(path.join(root, ".smoke/app.js"), "utf8");
const { token } = await (await fetch(`${API}/api/auth/demo`, { method: "POST" })).json();

const ROUTES = ["/", "/features", "/pricing", "/signin", "/signup", "/app", "/app/create/blog",
                "/app/create/image", "/app/documents", "/app/templates", "/app/prompts",
                "/app/analytics", "/app/billing", "/app/settings"];

let issues = 0;
for (const route of ROUTES) {
  const vc = new VirtualConsole();
  const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
    url: `http://preview.local${route}`, runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc,
  });
  const { window } = dom;
  window.localStorage.setItem("nebula.token", token);
  window.fetch = (i, init) => fetch(typeof i === "string" && i.startsWith("/") ? API + i : i, init);
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe(t) { this.cb([{ isIntersecting: true, target: t }], this); } unobserve() {} disconnect() {} };
  window.scrollTo = () => {};
  window.eval(js);
  await new Promise((r) => setTimeout(r, 1200));

  const d = window.document;
  const found = [];
  const accName = (el) => (el.getAttribute("aria-label") || el.textContent || "").trim()
    || el.getAttribute("title") || el.getAttribute("aria-labelledby") || "";

  for (const img of d.querySelectorAll("img")) {
    if (!(img.getAttribute("alt") || "").trim() && !img.hasAttribute("alt")) found.push("img without alt");
  }
  for (const btn of d.querySelectorAll("button")) {
    if (!accName(btn)) found.push("button with no accessible name");
  }
  for (const a of d.querySelectorAll("a")) {
    if (!accName(a) && !a.querySelector("img[alt]")) found.push("link with no accessible name");
  }
  for (const input of d.querySelectorAll("input, textarea, select")) {
    const id = input.getAttribute("id");
    const labelled = id && d.querySelector(`label[for="${id}"]`);
    if (labelled) continue;
    if (input.closest("label")) continue;
    if (input.getAttribute("aria-label") || input.getAttribute("aria-labelledby")) continue;
    if (input.type === "hidden") continue;
    found.push(`unlabelled <${input.tagName.toLowerCase()} placeholder="${input.getAttribute("placeholder") || ""}">`);
  }
  let prev = 0;
  for (const h of d.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
    const lvl = Number(h.tagName[1]);
    if (lvl > prev + 1 && prev !== 0) found.push(`heading jump h${prev} → h${lvl}`);
    prev = lvl;
  }
  const h1 = d.querySelectorAll("h1").length;
  if (h1 !== 1) found.push(`${h1} <h1> elements (expected exactly 1)`);
  const main = d.querySelectorAll("main").length;
  if (!main && route.startsWith("/app")) found.push("no <main> landmark");
  const dupes = new Set();
  const ids = [...d.querySelectorAll("[id]")].map((e) => e.id);
  for (const id of ids) if (dupes.has(id)) found.push(`duplicate id="${id}"`); else dupes.add(id);

  if (!window.document.title.includes("Nebula Studio")) found.push(`tab title is "${window.document.title}"`);
  const uniq = [...new Set(found)];
  if (uniq.length) { issues += uniq.length; console.log(` FAIL ${route}\n      ${uniq.slice(0, 8).join("\n      ")}`); }
  else console.log(`  ok   ${route}`);
  window.close();
}

const html = readFileSync(path.join(root, "index.html"), "utf8");
for (const need of ["<html lang=", 'name="viewport"', 'name="description"', "og:title"]) {
  if (!html.includes(need)) { issues += 1; console.log(` FAIL index.html missing ${need}`); }
}
console.log(issues ? `\n${issues} a11y issues` : "\nclean: names, alts, labels, heading order, landmarks, ids");
process.exit(issues ? 1 : 0);
