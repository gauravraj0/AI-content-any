import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, fmtDate, nf, timeAgo } from "../../lib/api";
import { useStudio } from "../../lib/store";
import Icon, { KIND_COLOR, KIND_ICON } from "../../components/Icon";
import { useTitle, BarSeries, Donut, Empty, Meter } from "../../components/ui";
import Markdown from "../../components/Markdown";

const QUICK = [
  { kind: "blog", label: "Blog article", hint: "outline + meta", color: "#7c5cff", icon: "doc" },
  { kind: "analyze", label: "Analyze draft", hint: "AI-tells & fixes", color: "#22d3ee", icon: "scan" },
  { kind: "caption", label: "Social captions", hint: "4 platforms", color: "#ff6bc4", icon: "hash" },
  { kind: "seo", label: "SEO keywords", hint: "volume + intent", color: "#c8ff5c", icon: "search" },
  { kind: "rewrite", label: "Rewrite", hint: "tone pass", color: "#5ce6a4", icon: "swap" },
  { kind: "image", label: "Image", hint: "6 styles", color: "#ff9b6b", icon: "image" },
];

function useWorkspaceDocs(workspaceId) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.documents({ workspace_id: workspaceId, limit: 40 })
      .then((d) => alive && setDocs(d.documents || []))
      .catch(() => alive && setDocs([]))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [workspaceId]);
  return { docs, loading, setDocs };
}

export default function Dashboard() {
  useTitle("Studio overview");
  const { user, workspace, workspaceId, credits, kinds } = useStudio();
  const nav = useNavigate();
  const { docs, loading } = useWorkspaceDocs(workspaceId);
  const [usage, setUsage] = useState(null);
  const [openDoc, setOpenDoc] = useState(null);

  useEffect(() => { api.usage(21).then(setUsage).catch(() => {}); }, []);
  useEffect(() => {
    if (!openDoc && docs[0]) setOpenDoc(docs.find((d) => d.pinned) || docs[0]);
  }, [docs, openDoc]);

  const byKind = useMemo(() => {
    const counts = {};
    docs.forEach((d) => { counts[d.kind] = (counts[d.kind] || 0) + 1; });
    return Object.entries(counts).map(([k, v]) => ({ label: kinds.find((x) => x.id === k)?.label || k, value: v, color: KIND_COLOR[k] || "#7c5cff" }));
  }, [docs, kinds]);

  const totals = usage?.totals || {};
  const hour = new Date().getUTCHours();
  const greeting = hour < 5 ? "Still shipping" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Evening session";

  return (
    <>
      {/* hero row */}
      <div className="card card-pad-lg" style={{ display: "grid", gap: 18, background: "radial-gradient(120% 160% at 0% 0%, rgba(124,92,255,.2), transparent 55%), var(--surface)" }}>
        <div className="row spread wrap-flex">
          <div className="col" style={{ gap: 6 }}>
            <span className="eyebrow">{workspace?.name} · {user?.plan_name} plan</span>
            <h2 style={{ fontSize: "clamp(22px,2.6vw,31px)" }}>{greeting}, {user?.name?.split(" ")[0]}.</h2>
            <p className="muted small">{docs.length} documents in this workspace · {nf(totals.words || 0)} words generated in the last 21 days · {nf(credits.remaining)} credits left</p>
          </div>
          <div className="row wrap-flex" style={{ gap: 9 }}>
            <Link className="btn btn-primary" to="/app/create"><Icon name="spark" size={15} />Start a generation</Link>
            <button className="btn btn-ghost" onClick={() => nav("/app/create/analyze")}><Icon name="scan" size={15} />Analyze a draft</button>
          </div>
        </div>
        <div className="grid-4" style={{ gap: 12 }}>
          {QUICK.map((q) => (
            <button key={q.kind} className="card-flat card-hover" onClick={() => nav(`/app/create/${q.kind}`)}
              style={{ display: "grid", gap: 9, textAlign: "left", cursor: "pointer", padding: 14 }}>
              <span className="kind-tag" style={{ background: `color-mix(in srgb, ${q.color} 20%, transparent)` }}>
                <Icon name={q.icon} size={15} style={{ stroke: q.color }} />
              </span>
              <span className="col" style={{ gap: 2 }}>
                <b style={{ fontSize: 14 }}>{q.label}</b>
                <span className="tiny dim">{q.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid-4">
        {[
          ["Runs · 21d", nf(totals.runs || 0), "all formats", "bolt", "trend-up"],
          ["Words generated", nf(totals.words || 0), `${nf(Math.round((totals.words || 0) / 225))} min of reading`, "doc", "#7c5cff"],
          ["Hours saved", totals.hours_saved || 0, "vs. 200 wpm drafting", "clock", "#22d3ee"],
          ["Avg latency", `${nf(totals.avg_latency_ms || 0)}ms`, "server-side", "gauge", "#c8ff5c"],
        ].map(([label, value, hint, icon, tone]) => (
          <div key={label} className="card-flat" style={{ display: "grid", gap: 8 }}>
            <div className="row spread">
              <span className="label">{label}</span>
              <span className="kind-tag" style={{ width: 26, height: 26, borderRadius: 8, background: `color-mix(in srgb, ${tone} 16%, transparent)` }}>
                <Icon name={icon} size={14} style={{ stroke: typeof tone === "string" && tone.startsWith("#") ? tone : "var(--lime)" }} />
              </span>
            </div>
            <b style={{ font: "700 clamp(20px,2.1vw,26px)/1 var(--f-display)", letterSpacing: "-.03em" }}>{value}</b>
            <span className="tiny dim">{hint}</span>
          </div>
        ))}
      </div>

      <div className="split-rev">
        <div className="col" style={{ gap: 20 }}>
          {/* activity */}
          <section className="card" style={{ display: "grid", gap: 14 }}>
            <div className="row spread">
              <div className="col"><h3 style={{ fontSize: 16 }}>Usage</h3><span className="tiny dim">Daily runs across every format</span></div>
              <Link className="btn btn-quiet btn-sm" to="/app/analytics">Open analytics <Icon name="arrow" size={14} /></Link>
            </div>
            {usage?.series?.length ? <BarSeries data={usage.series} valueKey="runs" labelKey="date" tipKey="credits" height={150} />
              : <div className="skeleton" style={{ height: 150 }} />}
            <div className="row wrap-flex" style={{ gap: 18 }}>
              {(usage?.features || []).slice(0, 5).map((f) => (
                <div key={f.feature} className="row" style={{ gap: 7 }}>
                  <i style={{ width: 8, height: 8, borderRadius: 3, background: KIND_COLOR[f.feature] || "#7c5cff" }} />
                  <span className="tiny muted">{f.label}</span><b className="mono tiny">{f.runs}</b>
                </div>
              ))}
            </div>
          </section>

          {/* library */}
          <section className="card" style={{ display: "grid", gap: 12 }}>
            <div className="row spread">
              <div className="col"><h3 style={{ fontSize: 16 }}>Recent generations</h3><span className="tiny dim">Every run keeps its prompt and parameters</span></div>
              <Link className="btn btn-ghost btn-sm" to="/app/documents">Library <Icon name="arrow" size={14} /></Link>
            </div>
            {loading ? <div className="col" style={{ gap: 8 }}>{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 52 }} />)}</div> : null}
            {!loading && !docs.length ? (
              <Empty title="No documents yet" hint="Generate your first piece — it will appear here with its full history."
                action={<Link className="btn btn-primary btn-sm" to="/app/create"><Icon name="plus" size={14} />Create one</Link>} />
            ) : null}
            {!loading ? docs.slice(0, 7).map((d) => (
              <article key={d.id} className="list-row" onClick={() => nav(`/app/documents/${d.id}`)}>
                <span className="kind-tag" style={{ background: `color-mix(in srgb, ${KIND_COLOR[d.kind]} 22%, transparent)` }}>
                  <Icon name={KIND_ICON[d.kind]} size={15} style={{ stroke: KIND_COLOR[d.kind] }} />
                </span>
                <span className="grow col" style={{ gap: 3, alignItems: "flex-start" }}>
                  <b className="truncate" style={{ maxWidth: "100%", fontSize: 14 }}>{d.title}</b>
                  <span className="tiny dim truncate" style={{ maxWidth: "100%" }}>
                    {d.prompt || d.params?.source?.slice(0, 60) || d.kind}
                  </span>
                </span>
                <span className="row hide-sm" style={{ gap: 12 }}>
                  <span className="chip mono">{nf(d.word_count || 0)}w</span>
                  <span className={`chip ${d.status === "ready" ? "chip-lime" : ""}`}>{d.status}</span>
                  <span className="tiny dim nowrap">{timeAgo(d.created_at)}</span>
                </span>
                {d.pinned ? <Icon name="pin" size={14} style={{ color: "var(--amber)" }} /> : null}
              </article>
            )) : null}
          </section>
        </div>

        <div className="col sticky-col" style={{ gap: 20 }}>
          {openDoc ? (
            <section className="card" style={{ display: "grid", gap: 12, maxHeight: 460 }}>
              <div className="row spread">
                <span className="label">Preview</span>
                <button className="btn btn-quiet btn-xs" onClick={() => setOpenDoc(null)} aria-label="Dismiss"><Icon name="x" size={13} /></button>
              </div>
              <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                <span className="kind-tag" style={{ background: `color-mix(in srgb, ${KIND_COLOR[openDoc.kind]} 22%, transparent)` }}>
                  <Icon name={KIND_ICON[openDoc.kind]} size={15} style={{ stroke: KIND_COLOR[openDoc.kind] }} />
                </span>
                <div className="col grow" style={{ gap: 2 }}>
                  <b style={{ fontSize: 15, lineHeight: 1.25 }}>{openDoc.title}</b>
                  <span className="tiny dim">{fmtDate(openDoc.created_at)} · {openDoc.engine?.model}</span>
                </div>
              </div>
              <div style={{ maxHeight: 260, overflow: "auto", paddingRight: 4 }}>
                <Markdown>{(openDoc.content || "").slice(0, 1400)}</Markdown>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <Link className="btn btn-ghost btn-sm grow" to={`/app/documents/${openDoc.id}`}>Open</Link>
                <a className="btn btn-ghost btn-sm" href={api.exportUrl(openDoc.id, "md")} download>MD</a>
                <a className="btn btn-ghost btn-sm" href={api.exportUrl(openDoc.id, "html")} download>HTML</a>
              </div>
            </section>
          ) : null}

          <section className="card" style={{ display: "grid", gap: 12 }}>
            <h3 style={{ fontSize: 16 }}>Plan & credits</h3>
            <Meter value={credits.used} max={credits.quota} label={`${nf(credits.used)} used`} right={`${nf(credits.remaining)} left`}
              tone={credits.remaining <= 0 ? "warm" : credits.pct > 82 ? "warn" : "good"} />
            {credits.remaining <= 0 ? (
              <div className="card-flat" style={{ padding: 12, display: "grid", gap: 6, borderColor: "rgba(255,107,196,.4)" }}>
                <b style={{ fontSize: 13.5 }}>Credits exhausted for this cycle</b>
                <span className="tiny muted">Generation is paused until you top up. Nothing is lost — every draft is in the library.</span>
                <Link className="btn btn-primary btn-sm" style={{ justifySelf: "start" }} to="/app/billing"><Icon name="wallet" size={14} />Upgrade plan</Link>
              </div>
            ) : credits.pct > 82 ? (
              <div className="row spread tiny" style={{ padding: "8px 11px", borderRadius: 10, background: "rgba(247,185,85,.10)" }}>
                <span>Running low — {nf(credits.remaining)} credits left this cycle</span>
                <Link to="/app/billing" style={{ color: "var(--amber)" }}>Top up →</Link>
              </div>
            ) : null}
            <div className="row wrap-flex" style={{ gap: 7 }}>
              {(user?.features || []).slice(0, 5).map((f) => <span className="chip" key={f}>{f}</span>)}
            </div>
            <Link className="btn btn-ghost btn-sm" to="/app/billing"><Icon name="wallet" size={14} />Manage subscription</Link>
          </section>

          {byKind.length ? (
            <section className="card" style={{ display: "grid", gap: 12 }}>
              <h3 style={{ fontSize: 16 }}>Workspace mix</h3>
              <Donut slices={byKind} size={124} thickness={13} centerValue={docs.length} centerLabel="docs" />
            </section>
          ) : null}

          <section className="card" style={{ display: "grid", gap: 10 }}>
            <div className="row spread"><h3 style={{ fontSize: 16 }}>Brand voice</h3>
              <Link className="btn btn-quiet btn-xs" to="/app/settings">Edit</Link></div>
            <div className="row wrap-flex" style={{ gap: 6 }}>
              <span className="chip chip-accent">tone · {workspace?.brand_voice?.tone}</span>
              <span className="chip">reading level {workspace?.brand_voice?.reading_level || 60}</span>
            </div>
            <p className="tiny muted">{workspace?.brand_voice?.voice_notes || "No voice notes yet."}</p>
            {(workspace?.brand_voice?.avoid || []).length ? (
              <div className="col" style={{ gap: 6 }}>
                <span className="label">Banned words</span>
                <div className="row wrap-flex" style={{ gap: 5 }}>
                  {workspace.brand_voice.avoid.map((w) => <span className="chip chip-danger mono" key={w}>{w}</span>)}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </>
  );
}
