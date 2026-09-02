import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, nf } from "../../lib/api";
import { useStudio } from "../../lib/store";
import Icon, { KIND_COLOR, KIND_ICON } from "../../components/Icon";
import { useTitle, Empty, useToast } from "../../components/ui";

export default function Templates() {
  useTitle("Content templates");
  const [data, setData] = useState({ templates: [], categories: ["All"] });
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();
  const toast = useToast();
  const { workspaceId } = useStudio();

  useEffect(() => {
    setLoading(true);
    api.templates({ category: cat === "All" ? "" : cat, q }).then((d) => setData(d)).catch(() => {}).finally(() => setLoading(false));
  }, [cat, q]);

  const list = data.templates || [];

  const use = async (t) => {
    try {
      const res = await api.useTemplate(t.id, workspaceId);
      const p = res.params || {};
      const qs = new URLSearchParams({ kind: t.kind, ...Object.entries(p).filter(([, v]) => typeof v === "string").reduce((a, [k, v]) => ({ ...a, [k]: v }), {}) });
      toast(`Loaded “${t.name}” into the composer`, "ok");
      sessionStorage.setItem("nebula.template", JSON.stringify({ id: t.id, name: t.name, params: p, kind: t.kind, fields: t.fields || [] }));
      nav(`/app/create/${t.kind}?${qs}`);
    } catch (e) { toast(e.message, "err"); }
  };

  return (
    <>
      <div className="card" style={{ display: "grid", gap: 13 }}>
        <div className="row spread wrap-flex" style={{ gap: 12 }}>
          <div className="col">
            <h2 style={{ fontSize: 19 }}>Content templates</h2>
            <p className="small muted">Structured starting points — brief fields, tone, length and format pre-set. Open one and the composer arrives ready.</p>
          </div>
          <div className="row" style={{ gap: 9 }}>
            <div style={{ position: "relative" }}>
              <Icon name="search" size={14} style={{ position: "absolute", left: 11, top: 11, color: "var(--ink-3)" }} />
              <input className="input" style={{ paddingLeft: 33, width: 210 }} placeholder="Search templates…" aria-label="Search templates" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="row wrap-flex" style={{ gap: 6 }}>
          {(data.categories || ["All"]).map((c) => (
            <button key={c} className="pill-toggle" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
      </div>

      {loading ? <div className="grid-3">{[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="skeleton" style={{ height: 190 }} />)}</div> : null}

      {!loading && !list.length ? (
        <Empty icon="layers" title="No templates in that category" hint="Try another filter or clear the search." />
      ) : null}

      {!loading && list.length ? (
        <div className="grid-3">
          {list.map((t) => (
            <article key={t.id} className="card card-hover" style={{ display: "grid", gap: 12 }}>
              <div className="row spread">
                <span className="kind-tag" style={{ background: `color-mix(in srgb, ${KIND_COLOR[t.kind] || "#7c5cff"} 20%, transparent)` }}>
                  <Icon name={KIND_ICON[t.kind] || "layers"} size={15} style={{ stroke: KIND_COLOR[t.kind] || "#7c5cff" }} />
                </span>
                <span className="chip">{t.category}</span>
              </div>
              <div className="col" style={{ gap: 5 }}>
                <h3 style={{ fontSize: 16 }}>{t.name}</h3>
                <p className="small muted">{t.description}</p>
              </div>
              <div className="row wrap-flex" style={{ gap: 5 }}>
                {Object.entries(t.params || {}).map(([k, v]) => (
                  <span key={k} className="chip mono" style={{ fontSize: 11 }}>{k}: {Array.isArray(v) ? v.join(",") : String(v)}</span>
                ))}
              </div>
              <div className="row spread" style={{ marginTop: "auto" }}>
                <span className="tiny dim mono">{nf(t.uses)} uses · ~{t.time_saved_min} min saved</span>
                <button className="btn btn-ghost btn-sm" onClick={() => use(t)}>Use<Icon name="arrow" size={14} /></button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </>
  );
}
