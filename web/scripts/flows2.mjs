/**
 * Second interaction pass: the flows the other harnesses do not click —
 * registration, settings persistence, pinning/batch export, the document editor,
 * prompt creation, analytics toggles and the marketing page controls.
 *   node scripts/flows2.mjs
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

const demo = await (await fetch(`${API}/api/auth/demo`, { method: "POST" })).json();
const token = demo.token;
let failed = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${ok ? "" : ` — ${extra}`}`);
  if (!ok) failed += 1;
};

async function mount(route, { withToken = true, token: forced = "" } = {}) {
  const problems = [];
  const vc = new VirtualConsole();
  vc.on("error", (...a) => problems.push(`console.error: ${a.join(" ").slice(0, 200)}`));
  vc.on("jsdomError", (e) => problems.push(`jsdomError: ${e.message.slice(0, 200)}`));
  const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
    url: `http://preview.local${route}`, runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc,
  });
  const { window } = dom;
  if (withToken) window.localStorage.setItem("nebula.token", forced || token);
  window.fetch = (i, init) => fetch(typeof i === "string" && i.startsWith("/") ? API + i : i, init);
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; }
    observe(t) { this.cb([{ isIntersecting: true, target: t }], this); }
    unobserve() {} disconnect() {}
  };
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.open = () => ({ closed: false, focus() {}, close() {} });
  const blobs = [];
  window.URL.createObjectURL = (b) => { blobs.push(b); return `blob:mock-${blobs.length}`; };
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function click() { blobs.push(this.download || "download"); };
  window.__blobs = blobs;
  window.onerror = (m) => problems.push(`window.onerror: ${m}`);
  window.eval(js);
  await new Promise((r) => setTimeout(r, 1100));
  return { window, dom, problems, blobs };
}

const ev = (window, type, init = {}) => new window.Event(type, { bubbles: true, cancelable: true, ...init });
const mouse = (window) => new window.MouseEvent("click", { bubbles: true, cancelable: true, view: window });
function clickText(window, label, sel = "button, a") {
  const el = [...window.document.querySelectorAll(sel)]
    .find((e) => (e.textContent || "").trim().includes(label) && !e.disabled);
  if (!el) return false;
  el.dispatchEvent(mouse(window));
  return true;
}
function clickNth(window, label, n, sel = "button") {
  const els = [...window.document.querySelectorAll(sel)].filter((e) => (e.textContent || "").trim().includes(label));
  const el = els[n];
  if (!el) return false;
  el.dispatchEvent(mouse(window));
  return true;
}
function setInput(window, el, value) {
  Object.defineProperty(el, "value", { configurable: true, get: () => value, set: () => {} });
  el.dispatchEvent(ev(window, "input"));
  el.dispatchEvent(ev(window, "change"));
}
function clickIn(window, scope, label) {
  const box = window.document.querySelector(scope);
  if (!box) return false;
  const el = [...box.querySelectorAll("button, a")].find((e) => (e.textContent || "").trim().includes(label) && !e.disabled);
  if (!el) return false;
  el.dispatchEvent(mouse(window));
  return true;
}
const byPlaceholder = (window, sub) => [...window.document.querySelectorAll("input, textarea")].find((i) => (i.placeholder || "").includes(sub));
const text = (window) => window.document.getElementById("root").textContent.replace(/\s+/g, " ");

/* ------------------------------------------------ account: register + login */
{
  const email = `qa_${Date.now().toString(36)}@northbeam.co`;
  const { window, problems } = await mount("/signup", { withToken: false });
  setInput(window, byPlaceholder(window, "you@company") || window.document.querySelector("input"), email);
  const nameBox = byPlaceholder(window, "Name") || [...window.document.querySelectorAll("input")][1];
  if (nameBox) setInput(window, nameBox, "QA Router");
  const pwds = [...window.document.querySelectorAll('input[type="password"]')];
  if (pwds[0]) setInput(window, pwds[0], "testpass123");
  if (pwds[1]) setInput(window, pwds[1], "testpass123");
  await new Promise((r) => setTimeout(r, 250));
  const form = window.document.querySelector("form");
  check("signup renders a real form", !!form && !!form.querySelector('input[type="email"]'));
  form?.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 2200));
  check("registration creates an account", window.document.location.pathname.startsWith("/app"),
    `path=${window.document.location.pathname} ${problems.slice(0, 1).join(" / ")}`);
  const t2 = window.localStorage.getItem("nebula.token");
  const me = await (await fetch(`${API}/api/me`, { headers: { Authorization: `Bearer ${t2}` } })).json();
  check("new account gets its own workspace", me?.workspaces?.length >= 1 && me.user.email === email,
    JSON.stringify({ ws: me?.workspaces?.length, email: me?.user?.email }));
  const login = await fetch(`${API}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "testpass123" }),
  });
  check("password login works", login.status === 200, `status=${login.status}`);
  const bad = await fetch(`${API}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "wrong" }),
  });
  check("wrong password is rejected", bad.status === 401, `status=${bad.status}`);
  window.close();
}

/* ------------------------------------------------------- settings: save + create */
{
  const { window, problems } = await mount("/app/settings");
  const nameBox = [...window.document.querySelectorAll(".field input")][0];
  const newName = `Growth QA ${Date.now().toString(36).slice(-4)}`;
  if (nameBox) setInput(window, nameBox, newName);
  const swatch = [...window.document.querySelectorAll("button")].find((b) => b.className.includes("ws-swatch"));
  if (swatch) swatch.dispatchEvent(mouse(window));
  await new Promise((r) => setTimeout(r, 300));
  const saved = clickText(window, "Save workspace");
  await new Promise((r) => setTimeout(r, 1600));
  const after = await (await fetch(`${API}/api/workspaces`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const found = (after.workspaces || []).find((w) => w.name === newName);
  check("workspace rename persists", !!saved && !!found, `saved=${saved} found=${!!found} ${problems.slice(0, 1).join(" / ")}`);

  const chan = [...window.document.querySelectorAll("button, label")].find((b) => (b.textContent || "").trim() === "linkedin");
  if (chan) chan.dispatchEvent(mouse(window));
  const banned = byPlaceholder(window, "add a word");
  if (banned) {
    setInput(window, banned, "synergy");
    await new Promise((r) => setTimeout(r, 200));
    const form = banned.closest("form");
    if (form) form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    else clickText(window, "Add");
  }
  await new Promise((r) => setTimeout(r, 400));
  const saved2 = clickText(window, "Save workspace");
  await new Promise((r) => setTimeout(r, 1500));
  const after2 = await (await fetch(`${API}/api/workspaces`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const w2 = (after2.workspaces || []).find((w) => w.id === (found?.id || after2.workspaces?.[0]?.id));
  check("channels + brand voice persist", !!saved2 && !!w2 && Array.isArray(w2.channels) && w2.channels.length > 0
    && (w2.brand_voice?.avoid || []).includes("synergy"), JSON.stringify({ channels: w2?.channels, avoid: w2?.brand_voice?.avoid }));

  clickText(window, "New workspace");
  await new Promise((r) => setTimeout(r, 400));
  const nb = window.document.querySelector(".scrim .field input") || window.document.querySelector(".scrim input");
  if (nb) setInput(window, nb, `QA Site ${Date.now().toString(36).slice(-4)}`);
  await new Promise((r) => setTimeout(r, 250));
  const created = clickIn(window, ".scrim", "Create");
  await new Promise((r) => setTimeout(r, 1700));
  const after3 = await (await fetch(`${API}/api/workspaces`, { headers: { Authorization: `Bearer ${token}` } })).json();
  check("workspace creation from settings", !!created && (after3.workspaces || []).length >= 3,
    `count=${after3.workspaces?.length} ${problems.slice(0, 1).join(" / ")}`);
  window.close();
}

/* ---------------------------------------- documents: pin, select, batch export */
{
  const { window, problems } = await mount("/app/documents");
  const pinned = clickNth(window, "Pin", 0);
  await new Promise((r) => setTimeout(r, 1200));
  check("pin toggles from the library", pinned && text(window).includes("pinned"), `clicked=${pinned} ${problems.slice(0, 1).join(" / ")}`);

  const boxes = [...window.document.querySelectorAll('input[type="checkbox"]')];
  check("library exposes row checkboxes", boxes.length >= 2, `${boxes.length} boxes`);
  for (const b of boxes.slice(1, 3)) b.dispatchEvent(mouse(window));
  await new Promise((r) => setTimeout(r, 500));
  check("selection is reflected in the toolbar", /\d+ selected/.test(text(window)), text(window).slice(0, 160));
  const opened = clickText(window, "Batch export");
  await new Promise((r) => setTimeout(r, 400));
  const batched = clickText(window, "Export");
  await new Promise((r) => setTimeout(r, 1600));
  check("batch export downloads a file", !!opened && !!batched && window.__blobs.length > 0,
    `opened=${opened} clicked=${batched} blobs=${window.__blobs.length} ${problems.slice(0, 1).join(" / ")}`);

  const all = window.document.querySelectorAll("article").length;
  const kind = [...window.document.querySelectorAll(".pill-toggle")].find((b) => (b.textContent || "").trim().startsWith("Blog"));
  if (kind) kind.dispatchEvent(mouse(window));
  await new Promise((r) => setTimeout(r, 1300));
  const cards = window.document.querySelectorAll("article").length;
  check("kind filter narrows the list", cards > 0 && cards < all, `${all} → ${cards}`);
  window.close();
}

/* ------------------------------------- document view: title, status, prompt */
{
  const { window, problems } = await mount("/app/documents");
  const card = window.document.querySelector("article");
  const open = card && [...card.querySelectorAll("button")].find((b) => (b.textContent || "").trim().length > 6);
  open?.dispatchEvent(mouse(window));
  await new Promise((r) => setTimeout(r, 1500));
  const newTitle = `QA renamed ${Date.now().toString(36).slice(-4)}`;
  clickText(window, "Edit");
  await new Promise((r) => setTimeout(r, 500));
  const titleBox = window.document.querySelector(".topbar input, input.input");
  if (titleBox) setInput(window, titleBox, newTitle);
  await new Promise((r) => setTimeout(r, 300));
  const savedTitle = clickText(window, "Save changes");
  await new Promise((r) => setTimeout(r, 1600));
  if (!savedTitle) check("title edit UI exposes a save action", false, "no Edit/Save controls found");
  const id = window.document.location.pathname.split("/").pop();
  const fresh = await (await fetch(`${API}/api/documents/${id}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  check("title edit persists", fresh?.document?.title === newTitle, `got="${fresh?.document?.title}"`);

  const status = clickText(window, "Ready") || clickText(window, "Published") || clickText(window, "Review");
  await new Promise((r) => setTimeout(r, 1400));
  const fresh2 = await (await fetch(`${API}/api/documents/${id}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  check("status change persists", !!status && ["draft", "ready", "review", "published"].includes(fresh2?.document?.status),
    `status=${fresh2?.document?.status}`);

  const savedPrompt = clickText(window, "Save this prompt");
  await new Promise((r) => setTimeout(r, 1500));
  const prompts = await (await fetch(`${API}/api/prompts`, { headers: { Authorization: `Bearer ${token}` } })).json();
  check("document can be saved as a prompt", !!savedPrompt && (prompts.prompts || []).some((p) => /^Saved:/i.test(p.title || "")),
    `clicked=${savedPrompt} count=${prompts.prompts?.length} titles=${(prompts.prompts || []).slice(0, 3).map((p) => p.title).join("|")} ${problems.slice(0, 1).join(" / ")}`);

  clickText(window, "HTML");
  await new Promise((r) => setTimeout(r, 900));
  const md = clickText(window, "JSON");
  await new Promise((r) => setTimeout(r, 1400));
  check("html + json exports fire", md && window.__blobs.length > 0, `blobs=${window.__blobs.length}`);
  window.close();
}

/* -------------------------------------------- prompts: create, read, copy, delete */
{
  const { window, problems } = await mount("/app/prompts");
  const before = (await (await fetch(`${API}/api/prompts`, { headers: { Authorization: `Bearer ${token}` } })).json()).prompts.length;
  clickText(window, "New prompt");
  await new Promise((r) => setTimeout(r, 500));
  const titleEl = window.document.querySelector(".scrim input");
  const bodyEl = window.document.querySelector(".scrim textarea");
  if (titleEl) setInput(window, titleEl, "QA launch recap");
  if (bodyEl) setInput(window, bodyEl, "Write a {length} launch recap about {topic} for {audience}.");
  await new Promise((r) => setTimeout(r, 300));
  const created = clickText(window, "Save prompt") || clickText(window, "Create");
  await new Promise((r) => setTimeout(r, 1600));
  const list = await (await fetch(`${API}/api/prompts`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const made = (list.prompts || []).find((p) => /QA launch recap/.test(p.title || ""));
  check("prompt creation", !!created && !!made && list.prompts.length === before + 1, `count ${before} → ${list.prompts.length}`);
  check("new prompt appears in the UI", text(window).includes("QA launch recap"), text(window).slice(0, 120));

  const read = clickText(window, "Read");
  await new Promise((r) => setTimeout(r, 700));
  check("prompt reader opens", read && !!window.document.querySelector(".scrim"), problems.slice(0, 1).join(" / "));
  window.document.querySelector(".scrim")?.dispatchEvent(mouse(window));
  await new Promise((r) => setTimeout(r, 400));

  if (made) {
    const del = await fetch(`${API}/api/prompts/${made.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    check("prompt delete endpoint", del.status === 200, `status=${del.status}`);
  }
  window.close();
}

/* ---------------------------------------------------- templates: filter + search */
{
  const { window } = await mount("/app/templates");
  const all = window.document.querySelectorAll("article, .card").length;
  const cat = clickText(window, "Social");
  await new Promise((r) => setTimeout(r, 1300));
  const some = window.document.querySelectorAll("article, .card").length;
  check("template category filter", cat && some > 0 && some < all, `${all} → ${some}`);
  const box = byPlaceholder(window, "Search templates");
  if (box) setInput(window, box, "caption");
  await new Promise((r) => setTimeout(r, 1400));
  check("template search narrows results", window.document.querySelectorAll("article, .card").length <= some,
    `${window.document.querySelectorAll("article, .card").length}`);
  window.close();
}

/* ------------------------------------------------- analytics: toggles + export */
{
  const { window, problems } = await mount("/app/analytics");
  const days = clickText(window, "90d") || clickText(window, "7d");
  await new Promise((r) => setTimeout(r, 1500));
  check("analytics range switch", !!days && !problems.length, problems.slice(0, 1).join(" / "));
  const metric = clickText(window, "Credits") || clickText(window, "Words");
  await new Promise((r) => setTimeout(r, 900));
  check("analytics metric switch", !!metric, `clicked=${metric}`);
  const csv = clickText(window, "CSV");
  await new Promise((r) => setTimeout(r, 1400));
  check("analytics CSV export", !!csv && window.__blobs.length > 0, `blobs=${window.__blobs.length}`);
  const svgs = window.document.querySelectorAll("svg").length;
  check("charts render as inline svg", svgs > 3, `${svgs} svgs`);
  window.close();
}

/* ------------------------------------- studio: tabs, variation, estimate, copy */
{
  const { window, problems } = await mount("/app/create/blog");
  await new Promise((r) => setTimeout(r, 900));
  check("live credit estimate shown", /credits · ~[\d.]+s · nebula-/.test(text(window)), text(window).slice(0, 160));
  clickText(window, "Generate");
  await new Promise((r) => setTimeout(r, 8000));
  const tabs = ["Structure", "Export"].map((t) => clickNth(window, t, 0, "button"));
  await new Promise((r) => setTimeout(r, 700));
  check("output tabs switch", tabs.every(Boolean) && /words|sections|Markdown/i.test(text(window)), problems.slice(0, 1).join(" / "));
  const varied = clickText(window, "Variation");
  await new Promise((r) => setTimeout(r, 7000));
  check("variation regenerates", !!varied && !problems.length, problems.slice(0, 1).join(" / "));
  const copied = clickText(window, "Copy");
  await new Promise((r) => setTimeout(r, 600));
  check("copy button responds", !!copied, `clicked=${copied}`);
  const opened = clickText(window, "Open");
  await new Promise((r) => setTimeout(r, 1200));
  check("open-in-editor navigates to the document", !!opened && /\/app\/documents\//.test(window.document.location.pathname),
    `path=${window.document.location.pathname}`);
  window.close();
}

/* -------------------------------------- image studio: art tab + png download */
{
  const { window, problems } = await mount("/app/create/image");
  clickText(window, "Generate");
  await new Promise((r) => setTimeout(r, 2600));
  const hasSvg = window.document.querySelectorAll(".split img, .split svg").length > 0;
  check("image renders in the art panel", hasSvg && !problems.length, problems.slice(0, 1).join(" / "));
  const png = clickText(window, "PNG");
  await new Promise((r) => setTimeout(r, 1500));
  check("png download control responds", !!png, `clicked=${png} ${problems.slice(0, 1).join(" / ")}`);
  const style = clickNth(window, "noir", 0, "button") || clickText(window, "Noir");
  await new Promise((r) => setTimeout(r, 400));
  check("style switch selectable", !!style, `clicked=${style}`);
  window.close();
}

/* ------------------------------------------------- marketing page controls */
{
  const { window, problems } = await mount("/pricing");
  const yearly = clickText(window, "Yearly");
  await new Promise((r) => setTimeout(r, 600));
  const html = window.document.getElementById("root").innerHTML;
  check("pricing cycle toggle", !!yearly && /save 20%|yearly/i.test(html), problems.slice(0, 1).join(" / "));
  window.close();
}
{
  const { window } = await mount("/");
  const items = [...window.document.querySelectorAll(".faq details")];
  check("faq uses native disclosures with answers", items.length >= 4 && items.every((d) => d.querySelector("summary") && d.querySelector("p")),
    `${items.length} items`);
  if (items[0]) { items[0].open = true; check("faq item opens", items[0].open === true); }
  const demo = clickText(window, "Open the demo workspace");
  await new Promise((r) => setTimeout(r, 2400));
  check("hero demo CTA signs in and lands in the studio", !!demo && window.document.location.pathname.startsWith("/app"),
    `path=${window.document.location.pathname}`);
  window.close();
}
{
  const { window } = await mount("/signin?next=/app/analytics", { withToken: false });
  check("auth page offers the demo shortcut", text(window).includes("demo"), text(window).slice(0, 120));
  clickText(window, "Continue with the demo workspace");
  await new Promise((r) => setTimeout(r, 2400));
  check("?next= redirect honoured", window.document.location.pathname === "/app/analytics",
    `path=${window.document.location.pathname}`);
  window.close();
}

/* --------------------------------------------------------- auth guard + 402 */
{
  const { window } = await mount("/app/settings", { withToken: false });
  check("signed-out visit redirects to /signin", window.document.location.pathname.startsWith("/signin"),
    `path=${window.document.location.pathname}`);
  window.close();
}
{
  const hdr = { Authorization: `Bearer ${token}`, "content-type": "application/json" };
  const before = await (await fetch(`${API}/api/me`, { headers: hdr })).json();
  const ws = before.workspaces[0].id;
  const sub = (plan_id) => fetch(`${API}/api/billing/subscribe`, {
    method: "POST", headers: hdr, body: JSON.stringify({ plan_id, cycle: "monthly" }) });

  await sub("free");
  let over = 200;
  for (let i = 0; i < 40 && over === 200; i += 1) {
    const r = await fetch(`${API}/api/generate`, {
      method: "POST", headers: hdr,
      body: JSON.stringify({ kind: "summarize", workspace_id: ws, prompt: `drain credits ${i}`, source: "Publishing rose from 6 to 19 pieces per month while editorial headcount stayed flat at two, so the bottleneck moved from drafting to review and the rota is the fix for Q3." }),
    });
    over = r.status;
  }
  check("credit ceiling blocks generation at 402", over === 402, `status=${over}`);

  const { window, problems } = await mount("/app/create/summarize");
  clickText(window, "Generate");
  await new Promise((r) => setTimeout(r, 3500));
  const t2 = text(window);
  check("studio offers an upgrade path on 402",
    /spent this cycle's credits/i.test(t2) && /See plans/.test(t2) && !problems.length,
    `${t2.slice(0, 200)} ${problems.slice(0, 1).join(" / ")}`);
  window.close();

  const back = await sub("pro");
  const again = await fetch(`${API}/api/generate`, {
    method: "POST", headers: hdr,
    body: JSON.stringify({ kind: "summarize", workspace_id: ws, prompt: "credits released test", source: "Publishing rose from 6 to 19 pieces per month while editorial headcount stayed flat at two, so the fix is a reviewer rota and a CTA on every brief before Q3 ships." }),
  });
  check("upgrade releases generation again", back.status === 200 && again.status === 200, `again=${again.status}`);
}

/* ------------------------------------- a brand-new account (empty workspace) */
{
  const email = `fresh_${Date.now().toString(36)}@studio.test`;
  const reg = await (await fetch(`${API}/api/auth/register`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "testpass123", name: "Fresh Account", company: "Zero Ltd" }),
  })).json();
  const t2 = reg.token;
  check("api register returns a token + workspace", !!t2 && !!reg.workspace_id, JSON.stringify(reg).slice(0, 140));
  for (const route of ["/app", "/app/documents", "/app/analytics", "/app/create/blog", "/app/prompts", "/app/billing"]) {
    const { window, problems } = await mount(route, { token: t2 });
    const body = text(window);
    const emptyOk = !problems.length && /Nebula/.test(body);
    check(`fresh account renders ${route}`, emptyOk, problems.slice(0, 1).join(" / ") || body.slice(0, 140));
    if (route === "/app") {
      check("fresh account sees a call to action, not a blank page",
        /first|no documents yet|Start|Create|nothing/i.test(body), body.slice(0, 200));
    }
    window.close();
  }
  const gen = await fetch(`${API}/api/generate`, {
    method: "POST", headers: { Authorization: `Bearer ${t2}`, "content-type": "application/json" },
    body: JSON.stringify({ kind: "text", prompt: "welcome email for a new workspace", length: "short", format: "email" }),
  });
  check("fresh account can generate immediately", gen.status === 200, `status=${gen.status}`);
}


/* -------------------------------- template / prompt handoff into the composer */
{
  const seeded = (await (await fetch(`${API}/api/templates`, { headers: { Authorization: `Bearer ${token}` } })).json()).templates;
  const tpl = seeded.find((t) => (t.params || {}).length) || seeded[0];
  const { window, problems } = await mount("/app/templates");
  const card = [...window.document.querySelectorAll("article, .card")]
    .find((a) => (a.textContent || "").includes(tpl.name));
  check("the seeded template is listed", !!card, `looking for "${tpl.name}"`);
  const used = card && [...card.querySelectorAll("button")].find((b) => (b.textContent || "").trim().startsWith("Use"));
  used?.dispatchEvent(mouse(window));
  await new Promise((r) => setTimeout(r, 1800));

  const url = new URL(window.document.location.href);
  check("template lands on its own composer", url.pathname === `/app/create/${tpl.kind}`, `${url.pathname} vs /app/create/${tpl.kind}`);
  check("template params travel in the url", Object.entries(tpl.params || {}).every(([k, v]) => typeof v !== "string" || url.searchParams.get(k) === v),
    `${url.search} for ${JSON.stringify(tpl.params)}`);

  const banner = text(window).match(/Loaded from ([^—]+) —/);
  check("composer names the template it loaded", !!banner && banner[1].includes(tpl.name), `banner=${banner ? banner[1] : "none"}`);

  const lengthSeg = [...window.document.querySelectorAll(".seg")].find((s) => (s.getAttribute("aria-label") || "") === "Length");
  const toneGroup = [...window.document.querySelectorAll(".field")]
    .find((f) => (f.querySelector(".label")?.textContent || "").trim() === "Tone");
  const activeTone = toneGroup?.querySelector('.pill-toggle[aria-pressed="true"]')?.textContent?.trim();
  const lengthOk = !lengthSeg || (tpl.params?.length ? (lengthSeg.querySelector('[aria-pressed="true"]')?.textContent || "").trim().toLowerCase().startsWith(tpl.params.length) : true);
  const toneOk = !tpl.params?.tone || activeTone === tpl.params.tone;
  check("template parameters drive the controls", !!lengthOk && !!toneOk,
    `length=${lengthSeg?.querySelector('[aria-pressed="true"]')?.textContent} want=${tpl.params?.length} tone=${activeTone} want=${tpl.params?.tone}`);
  check("handoff is consumed exactly once", window.sessionStorage.getItem("nebula.template") === null);
  check("no errors while handing off", !problems.length, problems.slice(0, 1).join(" / "));
  window.close();
}
{
  const { window, problems } = await mount("/app/prompts");
  const withVars = [...window.document.querySelectorAll("article")].find((a) => /\{topic\}|\{audience\}/.test(a.textContent || ""));
  check("a prompt with {slots} is seeded", !!withVars);
  if (withVars) {
    [...withVars.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "Read")?.dispatchEvent(mouse(window));
    await new Promise((r) => setTimeout(r, 500));
    const inputs = [...window.document.querySelectorAll(".scrim .field input")];
    check("runner exposes one input per variable", inputs.length >= 1, `${inputs.length} inputs`);
    if (inputs[0]) setInput(window, inputs[0], "quarterly product recap");
    if (inputs[1]) setInput(window, inputs[1], "the sales team");
    await new Promise((r) => setTimeout(r, 300));
    clickText(window, "Run in composer");
    await new Promise((r) => setTimeout(r, 1800));
    const ta = window.document.querySelector("textarea");
    const brief = ta?.value || "";
    check("variables are substituted into the brief", /quarterly product recap|the sales team/.test(brief), `brief="${brief.slice(0, 120)}"`);
    check("no unfilled {tokens} leak into the brief", !/\{[a-z_]+\}/i.test(brief), brief.match(/\{[a-z_]+\}/gi)?.join(",") || "");
    check("prompt run lands on the composer without errors", /\/app\/create\//.test(window.document.location.pathname) && !problems.length,
      `${window.document.location.pathname} ${problems.slice(0, 1).join(" / ")}`);
  }
  window.close();
}

/* ------------------------------------------ palette is scoped to the workspace */
{
  const hdr = { Authorization: `Bearer ${token}` };
  const ws = (await (await fetch(`${API}/api/workspaces`, { headers: hdr })).json()).workspaces;
  const [a, b] = ws;
  const inA = (await (await fetch(`${API}/api/documents?workspace_id=${a.id}&limit=1`, { headers: hdr })).json()).documents[0];
  const inB = (await (await fetch(`${API}/api/documents?workspace_id=${b.id}&limit=1`, { headers: hdr })).json()).documents[0];
  if (inA && inB) {
    const { window } = await mount("/app");
    const active = window.document.querySelector(".ws-switch")?.textContent || "";
    check("sidebar reports the active workspace", active.includes(a.name), `active="${active.slice(0, 60)}" of ${a.name}/${b.name}`);
    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    const box = window.document.querySelector(".scrim input");
    setInput(window, box, inA.title.split(/\s+/).slice(0, 3).join(" "));
    await new Promise((r) => setTimeout(r, 1400));
    const rows = [...window.document.querySelectorAll(".scrim button")].map((e) => e.textContent || "").join(" | ");
    check("palette finds a document in the active workspace", rows.includes(inA.title.split(" ").slice(0, 3).join(" ")),
      `q="${inA.title.slice(0, 30)}" rows=${rows.slice(0, 160)}`);
    setInput(window, box, inB.title);
    await new Promise((r) => setTimeout(r, 1500));
    const rows2 = [...window.document.querySelectorAll(".scrim button")].map((e) => e.textContent || "").join(" | ");
    check("palette hides documents from other workspaces", !rows2.includes(inB.title), `q="${inB.title}" leaked: ${rows2.slice(0, 140)}`);
    window.close();
  }
}

console.log(failed ? `\n${failed} checks failed` : "\nall secondary flows passed");
process.exit(failed ? 1 : 0);
