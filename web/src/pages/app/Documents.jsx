import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, downloadText, fmtDate, nf, timeAgo } from "../../lib/api";
import { useStudio } from "../../lib/store";
import Icon, { KIND_COLOR, KIND_ICON } from "../../components/Icon";
import { useTitle, Empty, Modal, Segmented, useToast } from "../../components/ui";

const KINDS = ["all", "blog", "text", "caption", "image", "rewrite", "summarize", "seo", "analyze"];

export default function Documents() {
  useTitle("Document library");
  const { workspaceId, kinds } = useStudio();
  const nav = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState("recent");
  const [selected, setSelected] = useState([]);
  const [batch, setBatch] = useState(null);

  const load = useMemo(() => () => {
    setLoading(true);
    api.documents({ workspace_id: workspaceId, kind: kind === "all" ? "" : kind, q, limit: 100 })
      .then((d) => setRows(d.documents || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [workspaceId, kind, q]);

  useEffect(load, [load]);

  // a selection that survives a filter change would export rows the user cannot see
  useEffect(() => { setSelected([]); }, [workspaceId, kind, q]);

  const sorted = useMemo(() => {
    const out = [...rows];
    if (sort === "recent") out.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    if (sort === "words") out.sort((a, b) => (b.word_count || 0) - (a.word_count || 0));
    if (sort === "title") out.sort((a, b) => String(a.title).localeCompare(String(b.title)));
    if (sort === "pinned") out.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.created_at || 0) - (a.created_at || 0));
    return out;
  }, [rows, sort]);

  const toggle = (id) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const runBatch = async (format) => {
    try {
      const res = await api.exportBatch(selected, format);
      if (format === "json") downloadText(res.filename, JSON.stringify({ exported: res.count, parts: res.body }, null, 2), "application/json");
      else downloadText(res.filename, res.body, format === "html" ? "text/html" : "text/plain");
      toast(`Exported ${res.count} documents as ${format.toUpperCase()}`, "ok");
      setBatch(null);
    } catch (e) { toast(e.message, "err"); }
  };

  const remove = async (doc) => {
    try {
      await api.deleteDocument(doc.id);
      setRows((cur) => cur.filter((r) => r.id !== doc.id));
      toast("Deleted", "ok");
    } catch (e) { toast(e.message, "err"); }
  };

  const totalWords = rows.reduce((a, r) => a + (r.word_count || 0), 0);

  return (
    <>
      <div className="card" style={{ display: "grid", gap: 14 }}>
        <div className="row spread wrap-flex" style={{ gap: 12 }}>
          <div className="col">
            <h2 style={{ fontSize: 19 }}>Generation library</h2>
            <span className="tiny dim">{rows.length} documents · {nf(totalWords)} words · history kept with prompt + parameters</span>
          </div>
          <div className="row wrap-flex" style={{ gap: 9 }}>
            <Link className="btn btn-ghost btn-sm" to="/app/analytics"><Icon name="chart" size={14} />Usage</Link>
            <Link className="btn btn-primary btn-sm" to="/app/create"><Icon name="plus" size={14} />New generation</Link>
          </div>
        </div>

        <div className="row wrap-flex" style={{ gap: 10 }}>
          <label className="field grow" style={{ minWidth: 220 }}>
            <div style={{ position: "relative" }}>
              <Icon name="search" size={15} style={{ position: "absolute", left: 11, top: 11, color: "var(--ink-3)" }} />
              <input className="input" style={{ paddingLeft: 34 }} placeholder="Search titles and drafts…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </label>
          <Segmented ariaLabel="Sort library" value={sort} onChange={setSort} options={[{ id: "recent", label: "Recent" }, { id: "pinned", label: "Pinned" }, { id: "words", label: "Longest" }, { id: "title", label: "A–Z" }]} />
        </div>

        <div className="row wrap-flex" style={{ gap: 6 }}>
          {KINDS.map((k) => (
            <button key={k} className="pill-toggle" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {k === "all" ? `All (${rows.length})` : `${(kinds.find((x) => x.id === k)?.label || k)}`}
            </button>
          ))}
        </div>

        {selected.length ? (
          <div className="row spread card-flat" style={{ borderColor: "rgba(124,92,255,.4)" }}>
            <span className="small">{selected.length} selected</span>
            <div className="row" style={{ gap: 7 }}>
              <button className="btn btn-ghost btn-xs" onClick={() => setBatch({ format: "md" })}>Batch export</button>
              <button className="btn btn-quiet btn-xs" onClick={() => setSelected([])}>Clear</button>
            </div>
          </div>
        ) : null}
      </div>

      {loading ? <div className="grid-2">{[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="skeleton" style={{ height: 128 }} />)}</div> : null}

      {!loading && !sorted.length ? (
        <Empty title="Nothing here yet" hint={q || kind !== "all" ? "No documents match those filters." : "Generate something and it will show up in this library."}
          action={<Link className="btn btn-primary btn-sm" to="/app/create"><Icon name="plus" size={14} />Create</Link>} />
      ) : null}

      {!loading && sorted.length ? (
        <div className="grid-2">
          {sorted.map((d) => (
            <article key={d.id} className="card card-hover" style={{ display: "grid", gap: 12, padding: 18 }}>
              <div className="row spread">
                <div className="row" style={{ gap: 10 }}>
                  <input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggle(d.id)} aria-label={`Select ${d.title}`}
                    style={{ accentColor: "#7c5cff", width: 15, height: 15 }} />
                  <span className="kind-tag" style={{ background: `color-mix(in srgb, ${KIND_COLOR[d.kind]} 22%, transparent)` }}>
                    <Icon name={KIND_ICON[d.kind]} size={15} style={{ stroke: KIND_COLOR[d.kind] }} />
                  </span>
                  <div className="col" style={{ gap: 2 }}>
                    <button onClick={() => nav(`/app/documents/${d.id}`)} style={{ background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer", font: "600 15px/1.3 var(--f-display)" }}>
                      {d.title}
                    </button>
                    <span className="tiny dim">{d.kind} · {fmtDate(d.created_at)} · {timeAgo(d.updated_at || d.created_at)}</span>
                  </div>
                </div>
                <span className={`chip ${d.status === "ready" ? "chip-lime" : d.status === "archived" ? "chip-danger" : ""}`}>{d.status}</span>
              </div>

              {d.image?.url ? (
                <img src={d.image.url} alt="" style={{ width: "100%", height: 122, objectFit: "cover", borderRadius: 12, border: "1px solid var(--line)" }} />
              ) : (
                <p className="small muted" style={{ lineHeight: 1.5, maxHeight: 74, overflow: "hidden",
                  maskImage: "linear-gradient(180deg,#000 55%,transparent)", WebkitMaskImage: "linear-gradient(180deg,#000 55%,transparent)" }}>
                  {String(d.content || "").replace(/[#>*_|-]/g, "").slice(0, 300)}
                </p>
              )}

              <div className="row spread wrap-flex">
                <div className="row wrap-flex" style={{ gap: 6 }}>
                  <span className="chip mono">{nf(d.word_count || 0)}w</span>
                  {d.engine?.credits ? <span className="chip mono">{d.engine.credits} cr</span> : null}
                  {d.meta?.content_score != null ? <span className="chip chip-cyan mono">score {d.meta.content_score}</span> : null}
                  {d.meta?.ai_probability != null ? <span className="chip mono">AI {d.meta.ai_probability}%</span> : null}
                  {d.pinned ? <span className="chip chip-amber"><Icon name="pin" size={11} />pinned</span> : null}
                </div>
                <div className="row" style={{ gap: 5 }}>
                  <button className="btn btn-quiet btn-xs tooltip" data-tip="Pin" aria-label={d.pinned ? "Unpin document" : "Pin document"} onClick={async () => {
                    const res = await api.patchDocument(d.id, { pinned: !d.pinned });
                    setRows((cur) => cur.map((r) => (r.id === d.id ? { ...r, pinned: res.document.pinned } : r)));
                  }}><Icon name="pin" size={13} /></button>
                  <button className="btn btn-quiet btn-xs" onClick={() => nav(`/app/create/${d.kind === "manual" ? "text" : d.kind}`)} aria-label="Regenerate"><Icon name="refresh" size={13} /></button>
                  <button className="btn btn-quiet btn-xs" onClick={async () => { await remove(d); }} aria-label="Delete"><Icon name="trash" size={13} /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {batch ? (
        <Modal title={`Batch export ${selected.length} documents`} onClose={() => setBatch(null)}
          footer={<>
            <button className="btn btn-quiet" onClick={() => setBatch(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => runBatch(batch.format)}>Export</button>
          </>}>
          <div className="col" style={{ gap: 14 }}>
            <Segmented value={batch.format} onChange={(f) => setBatch({ format: f })}
              options={[{ id: "md", label: "Markdown" }, { id: "html", label: "HTML" }, { id: "txt", label: "Plain text" }, { id: "json", label: "JSON" }]} />
            <p className="small muted">Merged into one file with a separator between documents. Handy for handing a
              whole project to a CMS import or a reviewer.</p>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
