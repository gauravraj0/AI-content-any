import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, copyText, downloadText, fmtDate, nf } from "../../lib/api";
import { useStudio } from "../../lib/store";
import Icon, { KIND_COLOR, KIND_ICON } from "../../components/Icon";
import { useTitle, Empty, Meter, Modal, ScoreRing, Segmented, useToast } from "../../components/ui";
import Markdown from "../../components/Markdown";

export default function DocumentView() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { refresh } = useStudio();
  const [doc, setDoc] = useState(null);
  useTitle(doc?.title || "Document");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("draft");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("");
  const [regenBusy, setRegenBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.document(id).then((d) => {
      if (!alive) return;
      setDoc(d.document);
      setDraft(d.document?.content || "");
      setTitle(d.document?.title || "");
    }).catch(() => alive && setDoc(null)).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);

  const save = useCallback(async () => {
    try {
      const res = await api.patchDocument(id, { content: draft, title });
      setDoc(res.document);
      setEditing(false);
      toast("Document saved", "ok");
    } catch (e) { toast(e.message, "err"); }
  }, [draft, id, title, toast]);

  const regenerate = useCallback(async () => {
    setRegenBusy(true);
    try {
      const params = { ...(doc.params || {}), kind: doc.kind, salt: Math.random().toString(36).slice(2, 12) };
      const res = await api.generate(params);
      setDoc(res.document); setDraft(res.document.content); setTitle(res.document.title);
      refresh().catch(() => {});
      toast("New variation generated and saved", "ok");
    } catch (e) { toast(e.message, "err"); } finally { setRegenBusy(false); }
  }, [doc, refresh, toast]);

  const exportAs = async (format) => {
    if (format === "html") { window.open(api.exportUrl(id, "html"), "_blank"); return; }
    try {
      const body = await api.exportText(id, format);
      downloadText(`${(title || "document").replace(/[^\w-]+/g, "-").toLowerCase()}.${format === "markdown" ? "md" : format}`,
        body, format === "json" ? "application/json" : "text/plain");
      toast(`Downloaded as ${format.toUpperCase()}`, "ok");
    } catch (e) { toast(e.message, "err"); }
  };

  const meta = doc?.meta || {};
  const wordCount = useMemo(() => draft.split(/\s+/).filter(Boolean).length, [draft]);

  if (loading) return <div className="grid-2"><div className="skeleton" style={{ height: 420 }} /><div className="skeleton" style={{ height: 420 }} /></div>;
  if (!doc) return <Empty title="Document not found" hint="It may have been deleted." action={<Link className="btn btn-ghost btn-sm" to="/app/documents">Back to library</Link>} />;

  return (
    <>
      <div className="card" style={{ display: "grid", gap: 14 }}>
        <div className="row spread wrap-flex" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 11, alignItems: "flex-start" }}>
            <span className="kind-tag" style={{ background: `color-mix(in srgb, ${KIND_COLOR[doc.kind]} 22%, transparent)` }}>
              <Icon name={KIND_ICON[doc.kind]} size={16} style={{ stroke: KIND_COLOR[doc.kind] }} />
            </span>
            {editing ? (
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} style={{ fontWeight: 600, maxWidth: 520 }} />
            ) : (
              <div className="col" style={{ gap: 3 }}>
                <h2 style={{ fontSize: "clamp(19px,2.1vw,25px)" }}>{doc.title}</h2>
                <span className="tiny dim">{doc.kind} · created {fmtDate(doc.created_at)} · {doc.engine?.model} · {nf(doc.word_count || wordCount)} words</span>
              </div>
            )}
          </div>
          <div className="row wrap-flex" style={{ gap: 7 }}>
            <button className="btn btn-ghost btn-sm" onClick={async () => { const ok = await copyText(editing ? draft : doc.content); toast(ok ? "Copied" : "Copy blocked by the browser", ok ? "ok" : "err"); }}><Icon name="copy" size={14} />Copy</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing((v) => !v)}>
              <Icon name={editing ? "check" : "edit"} size={14} />{editing ? "Save" : "Edit"}
            </button>
            {editing ? <button className="btn btn-quiet btn-sm" onClick={() => { setEditing(false); setDraft(doc.content); setTitle(doc.title); }}>Cancel</button> : null}
            {editing ? <button className="btn btn-primary btn-sm" onClick={save}>Save changes</button> : null}
            {!editing && doc.kind !== "image" ? (
              <button className="btn btn-ghost btn-sm" onClick={regenerate} disabled={regenBusy}>
                <Icon name={regenBusy ? "refresh" : "bolt"} size={14} />{regenBusy ? "Working…" : "Regenerate"}
              </button>
            ) : null}
            {!editing ? (
              <div className="row" style={{ gap: 5 }}>
                {["md", "txt", "json"].map((f) => <button key={f} className="btn btn-quiet btn-sm mono" onClick={() => exportAs(f)}>{f.toUpperCase()}</button>)}
                <button className="btn btn-quiet btn-sm" onClick={() => exportAs("html")}><Icon name="eye" size={14} />HTML</button>
              </div>
            ) : null}
            <button className="btn btn-quiet btn-sm" onClick={() => setConfirmDelete(true)} aria-label="Delete"><Icon name="trash" size={14} /></button>
          </div>
        </div>

        {doc.image?.url ? <img src={doc.image.url} alt={doc.prompt} style={{ width: "100%", maxHeight: 420, objectFit: "cover", borderRadius: 14, border: "1px solid var(--line)" }} /> : null}

        <div className="row wrap-flex" style={{ gap: 6 }}>
          <span className="chip mono">{doc.engine?.credits || 0} credits</span>
          <span className="chip mono">{doc.engine?.latency_ms || 0}ms</span>
          <span className="chip">{doc.engine?.mode}</span>
          <span className={`chip ${doc.status === "ready" ? "chip-lime" : ""}`}>{doc.status}</span>
          {doc.pinned ? <span className="chip chip-amber"><Icon name="pin" size={11} />pinned</span> : null}
          {meta.meta_desc_len ? <span className="chip mono">meta {meta.meta_desc_len}/158</span> : null}
          {meta.readability != null && typeof meta.readability !== "object" ? <span className="chip mono">Flesch {meta.readability}</span> : null}
        </div>
      </div>

      <div className="split-rev">
        <section className="card" style={{ display: "grid", gap: 12, minHeight: 420 }}>
          <div className="tabs" style={{ marginBottom: 4 }}>
            {[["draft", doc.kind === "analyze" ? "Report" : "Draft"], ["diff", "Before / after"], ["params", "Parameters"]].map(([k, l]) => (
              <button key={k} aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          {tab === "draft" ? (editing ? (
            <textarea className="textarea mono" style={{ minHeight: 520, lineHeight: 1.7, fontSize: 13.5 }} value={draft} onChange={(e) => setDraft(e.target.value)} />
          ) : (
            <Markdown>{doc.content}</Markdown>
          )) : null}
          {tab === "diff" ? (
            <div className="grid-2" style={{ gap: 14 }}>
              <div className="card-flat col" style={{ gap: 8 }}>
                <span className="label">Input</span>
                <p className="small" style={{ whiteSpace: "pre-wrap", color: "var(--ink-2)", maxHeight: 380, overflow: "auto" }}>
                  {doc.params?.source || doc.prompt || "—"}
                </p>
              </div>
              <div className="card-flat col" style={{ gap: 8 }}>
                <span className="label">Output</span>
                <p className="small" style={{ whiteSpace: "pre-wrap", color: "var(--ink-2)", maxHeight: 380, overflow: "auto" }}>{doc.content}</p>
              </div>
              {meta.before && meta.after ? (
                <div className="card-flat col" style={{ gap: 10, gridColumn: "1 / -1" }}>
                  <span className="label">Measured</span>
                  <div className="grid-3" style={{ gap: 12 }}>
                    {[["words", meta.before.words, meta.after.words], ["readability", meta.before.flesch, meta.after.flesch], ["sentences", meta.before.sentences, meta.after.sentences]]
                      .map(([k, a, b]) => (
                        <div key={k} className="col" style={{ gap: 4 }}>
                          <span className="tiny dim">{k}</span>
                          <span className="mono" style={{ fontSize: 15 }}>{a} <span className="dim">→</span> <b>{b}</b></span>
                        </div>
                      ))}
                  </div>
                  {(meta.changes || []).length ? (
                    <div className="row wrap-flex" style={{ gap: 5 }}>
                      {meta.changes.map((c, i) => <span key={i} className="chip mono" style={{ fontSize: 11 }}>{c}</span>)}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {tab === "params" ? (
            <pre className="mono tiny" style={{ whiteSpace: "pre-wrap", background: "var(--bg-2)", padding: 14, borderRadius: 12, border: "1px solid var(--line)", margin: 0 }}>
              {JSON.stringify({ params: doc.params, engine: doc.engine, tags: doc.tags }, null, 2)}
            </pre>
          ) : null}
        </section>

        <div className="col sticky-col" style={{ gap: 16 }}>
          {doc.kind === "analyze" ? (
            <section className="card col" style={{ gap: 14, alignItems: "center" }}>
              <ScoreRing value={meta.content_score || 0} label="content" />
              <Meter value={meta.ai_probability || 0} label="AI-generated likelihood" right={`${meta.ai_probability}%`} tone={meta.ai_probability > 55 ? "warm" : "good"} />
              <div className="col" style={{ gap: 8, width: "100%" }}>
                {(meta.metrics || []).map((b) => <Meter key={b.label} value={b.value} label={b.label} right={`${b.value}`} />)}
              </div>
              <span className="chip">{meta.verdict}</span>
            </section>
          ) : null}

          {doc.kind === "seo" ? (
            <section className="card" style={{ display: "grid", gap: 10 }}>
              <h3 style={{ fontSize: 15 }}>Meta preview</h3>
              <div className="card-flat col" style={{ gap: 4 }}>
                <span className="tiny" style={{ color: "var(--green)" }}>nebula.studio › blog</span>
                <b style={{ color: "#8ab4ff", fontSize: 15, fontWeight: 500, fontFamily: "var(--f-body)" }}>{meta.meta_title}</b>
                <span className="tiny muted">{meta.meta_description}</span>
              </div>
              <span className="tiny dim">{meta.meta_title_len} char title · {meta.meta_desc_len} char description · target {nf(meta.word_target)} words</span>
              <Link className="btn btn-ghost btn-sm" to="/app/create/seo"><Icon name="search" size={14} />New brief</Link>
            </section>
          ) : null}

          {doc.kind === "caption" && meta.options ? (
            <section className="card" style={{ display: "grid", gap: 10 }}>
              <h3 style={{ fontSize: 15 }}>Platform fit</h3>
              {meta.options.map((o) => (
                <div key={o.platform} className="col" style={{ gap: 5 }}>
                  <div className="row spread tiny"><span style={{ textTransform: "capitalize" }}>{o.platform}</span>
                    <span className="mono dim">{o.chars}/{o.limit}</span></div>
                  <Meter value={o.chars} max={o.limit} tone={o.within_limit ? "good" : "warm"} />
                </div>
              ))}
            </section>
          ) : null}

          <section className="card" style={{ display: "grid", gap: 10 }}>
            <h3 style={{ fontSize: 15 }}>Prompt library</h3>
            <p className="tiny muted">Store this brief so the next writer starts from the same place.</p>
            <button className="btn btn-ghost btn-sm" onClick={async () => {
              try { await api.savePrompt(doc.id, { title: `Saved: ${doc.title}` }); toast("Prompt saved to the library", "ok"); }
              catch (e) { toast(e.message, "err"); }
            }}><Icon name="quote" size={14} />Save this prompt</button>
            <Link className="btn btn-quiet btn-sm" to="/app/prompts">Browse prompts</Link>
          </section>

          <section className="card" style={{ display: "grid", gap: 8 }}>
            <h3 style={{ fontSize: 15 }}>Status</h3>
            <Segmented value={doc.status} onChange={async (s) => {
              const res = await api.patchDocument(doc.id, { status: s });
              setDoc(res.document); toast(`Marked ${s}`, "ok");
            }} options={[{ id: "draft", label: "Draft" }, { id: "review", label: "In review" }, { id: "ready", label: "Ready" }, { id: "archived", label: "Archived" }]} />
            <span className="tiny dim">Status is stored with the document and shown in the library.</span>
          </section>
        </div>
      </div>

      {confirmDelete ? (
        <Modal title="Delete this document?" onClose={() => setConfirmDelete(false)}
          footer={<>
            <button className="btn btn-quiet" onClick={() => setConfirmDelete(false)}>Keep it</button>
            <button className="btn btn-danger" onClick={async () => { await api.deleteDocument(doc.id); toast("Deleted", "ok"); nav("/app/documents"); }}>Delete</button>
          </>}>
          <p className="small muted">“{doc.title}” and its generation history will be removed. This cannot be undone.</p>
        </Modal>
      ) : null}
    </>
  );
}
