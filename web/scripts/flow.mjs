/**
 * Interaction test: drives the composer and the marketing analyzer with real
 * clicks in jsdom, then asserts the output actually rendered.
 *   node scripts/flow.mjs
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

async function mount(route) {
  const problems = [];
  const vc = new VirtualConsole();
  vc.on("error", (...a) => problems.push(`console.error: ${a.join(" ").slice(0, 220)}`));
  vc.on("jsdomError", (e) => problems.push(`jsdomError: ${e.message.slice(0, 220)}`));
  const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
    url: `http://preview.local${route}`, runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc,
  });
  const { window } = dom;
  window.localStorage.setItem("nebula.token", token);
  window.fetch = (input, init) => fetch(typeof input === "string" && input.startsWith("/") ? API + input : input, init);
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe(t) { this.cb([{ isIntersecting: true, target: t }], this); } unobserve() {} disconnect() {} };
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.onerror = (m) => problems.push(`window.onerror: ${m}`);
  window.eval(js);
  await new Promise((r) => setTimeout(r, 900));
  return { window, dom, problems };
}

const click = (window, label) => {
  const els = [...window.document.querySelectorAll("button, a")];
  const el = els.find((e) => (e.textContent || "").trim().includes(label) && !e.disabled);
  if (!el) return false;
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  return true;
};
const typeInto = (window, el, value) => {
  Object.defineProperty(el, "value", { configurable: true, get: () => value, set: () => {} });
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
};

let failed = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${ok ? "" : ` — ${extra}`}`);
  if (!ok) failed += 1;
};

/* ------------------------------------------------- composer: every format */
for (const kind of ["blog", "text", "caption", "image", "rewrite", "summarize", "seo", "analyze"]) {
  const { window, problems } = await mount(`/app/create/${kind}`);
  const field = window.document.querySelector("textarea");
  if (field && !(field.value || "").trim()) {
    typeInto(window, field, kind === "image" ? "hero art for a content studio launch" : "AI content workflows for lean marketing teams");
  }
  await new Promise((r) => setTimeout(r, 350));
  const clicked = click(window, "Generate");
  await new Promise((r) => setTimeout(r, kind === "image" ? 2000 : 8000));
  const html = window.document.getElementById("root").innerHTML;
  const want = {
    blog: "words", text: "Structure", caption: "Variants", image: "SVG",
    rewrite: "Rewrite", summarize: "TL;DR", seo: "Keywords", analyze: "AI-generated likelihood",
  }[kind];
  const okGen = clicked && html.includes(want) && !problems.length;
  check(`generate ${kind}`, okGen, okGen ? "" : `clicked=${clicked} want="${want}" len=${html.length} problems=${problems.slice(0, 2).join(" / ") || "-"} snip=${html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 260)}`);
  window.close();
}

/* ----------------------------------------- marketing analyzer (public, no token) */
{
  const { window, problems } = await mount("/");
  window.localStorage.clear();
  const field = [...window.document.querySelectorAll("textarea")][0];
  check("analyzer textarea present", !!field);
  if (field) {
    typeInto(window, field, "We rebuilt the brief on Tuesday — not because the old one was wrong, but because nobody could say who signed off. Three fields fixed it: outcome, the number to move, and a deadline with a name. Output went from 4 posts a month to 11, and editors still push back, which is the point.");
    await new Promise((r) => setTimeout(r, 200));
    click(window, "Analyse this content");
    await new Promise((r) => setTimeout(r, 2200));
    const html = window.document.getElementById("root").innerHTML;
    check("analyzer returns a report", html.includes("AI-generated likelihood") && html.includes("Fix list"), problems.slice(0, 1).join(" / "));
  }
  window.close();
}

/* ------------------------------------------------------------- document CRUD */
{
  const { window, problems } = await mount("/app/documents");
  const before = window.document.querySelectorAll("article").length;
  check("library lists documents", before > 0, `${before} cards`);
  const box = [...window.document.querySelectorAll("input")].find((i) => i.placeholder?.includes("Search titles"));
  if (box) {
    typeInto(window, box, "workflow");
    await new Promise((r) => setTimeout(r, 900));
    const after = window.document.querySelectorAll("article").length;
    check("search filters the library", after > 0 && after <= before, `${before} -> ${after}`);
  }
  const card = window.document.querySelector("article");
  const open = card && [...card.querySelectorAll("button")].find((b) => (b.textContent || "").trim().length > 6);
  if (open) { open.dispatchEvent(new window.MouseEvent("click", { bubbles: true, view: window })); await new Promise((r) => setTimeout(r, 1200)); }
  const html = window.document.getElementById("root").innerHTML;
  check("document view opens", html.includes("Parameters") || html.includes("Draft"), problems.slice(0, 1).join(" / "));
  window.close();
}

/* ------------------------------------------------ templates -> composer jump */
{
  const { window } = await mount("/app/templates");
  const used = click(window, "Use");
  await new Promise((r) => setTimeout(r, 1200));
  const html = window.document.getElementById("root").innerHTML;
  check("template loads the composer", used && html.includes("Generate"), `clicked=${used}`);
  window.close();
}

/* ------------------------------------------------------ prompt -> composer */
{
  const { window } = await mount("/app/prompts");
  const ran = click(window, "Run");
  await new Promise((r) => setTimeout(r, 1400));
  check("prompt runs into composer", ran && window.document.location.pathname.startsWith("/app/create"), `path=${window.document.location.pathname}`);
  window.close();
}

/* ------------------------------------------------------------ billing flow */
{
  const { window, problems } = await mount("/app/billing");
  const clicked = click(window, "Switch to ") || click(window, "Request access");
  await new Promise((r) => setTimeout(r, 1800));
  const html = window.document.getElementById("root").innerHTML;
  const switched = html.includes("Current subscription") && /Active plan/.test(html);
  check("plan switch applies", clicked && switched && !problems.length,
    `clicked=${clicked} ${problems.join(" / ").slice(0, 160)}`);
  check("invoices + usage meter render", html.includes("Invoices") && html.includes("credits used"), "");
  window.close();
}


/* --------------------------------------------------- remaining app screens */
for (const [route, needles] of [
  ["/app/create/caption", ["Platforms", "Generate"]],
  ["/app/create/seo", ["Keywords (optional)", "Generate"]],
]) {
  const { window, problems } = await mount(route);
  const html = window.document.getElementById("root").innerHTML;
  check(`render ${route}`, needles.every((n) => html.includes(n)) && !problems.length, problems.slice(0, 1).join(" / "));
  window.close();
}

/* ----------------------------------------------------- export + copy paths */
{
  const { window, problems } = await mount("/app/documents");
  const card = window.document.querySelector("article");
  const open = card && [...card.querySelectorAll("button")].find((b) => (b.textContent || "").trim().length > 6);
  open?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, view: window }));
  await new Promise((r) => setTimeout(r, 1400));
  const got = click(window, "MD");
  await new Promise((r) => setTimeout(r, 1200));
  const html = window.document.getElementById("root").innerHTML;
  check("export markdown from doc view", got && html.includes("Draft"), problems.slice(0, 1).join(" / "));
  window.close();
}

/* ------------------------------------------------------------- global search */
{
  const { window } = await mount("/app");
  window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  const box = window.document.querySelector(".scrim input");
  check("command palette opens", !!box);
  if (box) {
    typeInto(window, box, "launch");
    await new Promise((r) => setTimeout(r, 1200));
    const rows = window.document.querySelectorAll(".scrim .list-row, .scrim button").length;
    check("command palette searches", rows > 0, `${rows} results`);
  }
  window.close();
}

/* ---------------------------------------------------------- workspace switch */
{
  const { window, problems } = await mount("/app/settings");
  const clicked = click(window, "Switch");
  await new Promise((r) => setTimeout(r, 1400));
  const html = window.document.getElementById("root").innerHTML;
  check("workspace switcher works", clicked && html.includes("Personal brand"), `clicked=${clicked} ${problems.slice(0, 1).join(" / ")}`);
  window.close();
}

/* ------------------------------------------------------- sandbox reset */
{
  const { window, problems } = await mount("/app/settings");
  const clicked = click(window, "Reset demo data");
  await new Promise((r) => setTimeout(r, 400));
  const confirmed = click(window, "Wipe and reseed");
  await new Promise((r) => setTimeout(r, 2600));
  const docs = await (await fetch(`${API}/api/documents?limit=100`, { headers: { Authorization: `Bearer ${token}` } })).json();
  check("sandbox reset restores seed data", clicked && confirmed && docs.total === 14, `total=${docs.total} ${problems.slice(0, 1).join(" / ")}`);
  window.close();
}

console.log(failed ? `\n${failed} interaction checks failed` : "\nall interaction flows passed");
process.exit(failed ? 1 : 0);
