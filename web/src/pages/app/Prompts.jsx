import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, copyText, nf } from "../../lib/api";
import { useStudio } from "../../lib/store";
import Icon from "../../components/Icon";
import { Empty, Modal, useTitle, useToast } from "../../components/ui";

export default function Prompts() {
  useTitle("Prompt library");
  const { workspaceId } = useStudio();
  const nav = useNavigate();
  const toast = useToast();
  const [data, setData] = useState({ prompts: [], categories: ["All"] });
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const [vars, setVars] = useState({});
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", category: "Custom" });
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.prompts({ category: cat === "All" ? "" : cat, q }).then(setData).catch(() => {
      // keep the previous list on a failed refresh rather than flashing empty
    }).finally(() => setLoading(false));
  };
  useEffect(load, [cat, q]);

  const list = data.prompts || [];
  const varsOf = (body) => [...new Set(String(body || "").match(/\{[a-z_]+\}/gi) || [])];

  async function run(p) {
    const slots = {};
    for (const token of varsOf(p.body)) slots[token.replace(/[{}]/g, "")] = (vars[token] || "").trim();
    try {
      const res = await api.runPrompt(p.id, slots);
      sessionStorage.setItem("nebula.prompt-run", JSON.stringify({ id: p.id, title: p.title, ...res }));
      toast(`Loaded “${p.title}” into the composer`, "ok");
      nav(`/app/create/${res.kind || "text"}`);
    } catch (e) { toast(e.message, "err"); }
  }

  async function save() {
    try {
      await api.createPrompt({ ...form, workspace_id: workspaceId });
      setCreating(false);
      setForm({ title: "", body: "", category: "Custom" });
      toast("Prompt saved to the library", "ok");
      load();
    } catch (e) { toast(e.message, "err"); }
  }

  return (
    <>
      <div className="card" style={{ display: "grid", gap: 13 }}>
        <div className="row spread wrap-flex" style={{ gap: 12 }}>
          <div className="col">
            <h2 style={{ fontSize: 19 }}>Prompt library</h2>
            <p className="small muted">
              Versioned instructions with <code>{"{variable}"}</code> slots. Run one straight into the composer with your topic filled in.
            </p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <div style={{ position: "relative" }}>
              <Icon name="search" size={14} style={{ position: "absolute", left: 11, top: 11, color: "var(--ink-3)" }} />
              <input className="input" style={{ paddingLeft: 33, width: 200 }} placeholder="Search prompts…" aria-label="Search prompts"
                value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Icon name="plus" size={14} />New prompt</button>
          </div>
        </div>
        <div className="row wrap-flex" style={{ gap: 6 }}>
          {(data.categories || ["All"]).map((c) => (
            <button key={c} className="pill-toggle" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
      </div>

      {loading ? <div className="grid-2">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 170 }} />)}</div> : null}

      {!loading && !list.length ? (
        <Empty
          icon="quote"
          title="No prompts yet"
          hint="Save a prompt from any generation, or write one here."
          action={<button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Icon name="plus" size={14} />New prompt</button>}
        />
      ) : null}

      {!loading && list.length ? (
        <div className="grid-2">
          {list.map((p) => (
            <article key={p.id} className="card card-hover" style={{ display: "grid", gap: 12 }}>
              <div className="row spread">
                <div className="row" style={{ gap: 9 }}>
                  <span className="kind-tag" style={{ background: "rgba(124,92,255,.18)" }}><Icon name="quote" size={14} style={{ stroke: "var(--violet)" }} /></span>
                  <div className="col" style={{ gap: 2 }}>
                    <b style={{ fontSize: 15 }}>{p.title}</b>
                    <span className="tiny dim">{p.category} · {p.model || "nebula-copy-2"} · by {p.author || "you"}</span>
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <span className="chip chip-amber"><Icon name="star" size={11} fill style={{ stroke: "none" }} />{p.rating || "—"}</span>
                  <span className="chip mono">{nf(p.uses || 0)} runs</span>
                </div>
              </div>

              <p className="small muted" style={{
                fontFamily: "var(--f-mono)", fontSize: 12.5, lineHeight: 1.6, maxHeight: 86, overflow: "hidden",
                maskImage: "linear-gradient(180deg,#000 60%,transparent)", WebkitMaskImage: "linear-gradient(180deg,#000 60%,transparent)",
              }}>{p.body}</p>

              {varsOf(p.body).length ? (
                <div className="row wrap-flex" style={{ gap: 5 }}>
                  {varsOf(p.body).map((v) => <span key={v} className="chip chip-cyan mono" style={{ fontSize: 11 }}>{v}</span>)}
                </div>
              ) : null}

              <div className="row spread">
                <button className="btn btn-quiet btn-xs" onClick={() => { setOpen(p); setVars({}); }}>Read</button>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-quiet btn-xs" onClick={async () => { const ok = await copyText(p.body); toast(ok ? "Prompt copied" : "Copy blocked by the browser", ok ? "ok" : "err"); }}
                    aria-label={`Copy ${p.title || "prompt"}`}><Icon name="copy" size={12} /></button>
                  <button className="btn btn-quiet btn-xs" onClick={async () => {
                    try { await api.deletePrompt(p.id); toast("Prompt deleted", "ok"); load(); } catch (e) { toast(e.message, "err"); }
                  }} aria-label={`Delete ${p.title || "prompt"}`}><Icon name="trash" size={12} /></button>
                  <button className="btn btn-ghost btn-sm" onClick={() => run(p)}><Icon name="play" size={13} />Run</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {open ? (
        <Modal title={open.title} onClose={() => setOpen(null)} wide footer={<>
          <button className="btn btn-quiet" onClick={async () => { const ok = await copyText(open.body); toast(ok ? "Copied" : "Copy blocked by the browser", ok ? "ok" : "err"); }}>Copy</button>
          <button className="btn btn-primary" onClick={() => { setOpen(null); run(open); }}><Icon name="play" size={14} />Run in composer</button>
        </>}>
          <div className="col" style={{ gap: 14 }}>
            <div className="row wrap-flex" style={{ gap: 6 }}>
              <span className="chip">{open.category}</span>
              <span className="chip mono">{open.model}</span>
              <span className="chip mono">{nf(open.uses)} uses</span>
            </div>

            <pre className="mono tiny" style={{ whiteSpace: "pre-wrap", background: "var(--bg-2)", padding: 16, borderRadius: 12, border: "1px solid var(--line)", margin: 0, lineHeight: 1.7 }}>{open.body}</pre>

            {varsOf(open.body).length ? (
              <div className="col" style={{ gap: 9 }}>
                <span className="label">Fill the slots</span>
                <div className="grid-2" style={{ gap: 10 }}>
                  {varsOf(open.body).map((token) => {
                    const key = token.replace(/[{}]/g, "");
                    return (
                      <label className="field" key={token}>
                        <span className="label mono">{key}</span>
                        <input className="input" value={vars[token] || ""} onChange={(e) => setVars({ ...vars, [token]: e.target.value })}
                          placeholder={`value for {${key}}`} />
                      </label>
                    );
                  })}
                </div>
                <span className="tiny dim">Leave a slot empty and the generator drops the sentence fragment with it.</span>
              </div>
            ) : null}

            {open.saved_from ? (
              <span className="tiny dim">Saved from document <Link style={{ color: "var(--cyan)" }} to={`/app/documents/${open.saved_from}`}>{open.saved_from}</Link></span>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {creating ? (
        <Modal title="New prompt" onClose={() => setCreating(false)} footer={<>
          <button className="btn btn-quiet" onClick={() => setCreating(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={!form.title.trim() || !form.body.trim()}>Save prompt</button>
        </>}>
          <div className="col" style={{ gap: 14 }}>
            <label className="field"><span className="label">Title</span>
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Brief-first article prompt" /></label>
            <label className="field"><span className="label">Category</span>
              <input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Blog" /></label>
            <label className="field"><span className="label">Body</span>
              <textarea className="textarea mono" style={{ minHeight: 180 }} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder={"Write a {length}-word article about {topic} for {audience}. Every section needs one number."} />
              <span className="tiny dim"><code>{"{topic}"}</code>, <code>{"{audience}"}</code> and <code>{"{length}"}</code> become fillable slots in the runner.</span>
            </label>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
