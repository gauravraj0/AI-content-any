import { useEffect, useState } from "react";
import { api, downloadFile, nf } from "../../lib/api";
import Icon from "../../components/Icon";
import { useTitle, BarSeries, Donut, Meter, Segmented, Sparkline } from "../../components/ui";
import { KIND_COLOR } from "../../components/Icon";

export default function Analytics() {
  useTitle("Usage analytics");
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState("runs");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.usage(days).then(setData).catch((e) => setError(e.message));
  }, [days]);

  if (error) return <div className="card"><span className="chip chip-danger">{error}</span></div>;
  if (!data) return <div className="grid-2">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 220 }} />)}</div>;

  const t = data.totals;
  const series = data.series || [];
  const features = data.features || [];
  const peak = Math.max(...series.map((s) => s[metric] || 0), 1);
  const prev = series.slice(0, Math.floor(series.length / 2)).reduce((a, s) => a + s.runs, 0) || 1;
  const curr = series.slice(Math.floor(series.length / 2)).reduce((a, s) => a + s.runs, 0);
  const delta = Math.round(((curr - prev) / prev) * 100);

  return (
    <>
      <div className="card" style={{ display: "grid", gap: 14 }}>
        <div className="row spread wrap-flex" style={{ gap: 12 }}>
          <div className="col">
            <h2 style={{ fontSize: 19 }}>Usage analytics</h2>
            <p className="small muted">Everything measured server-side from the event log: runs, credits, output, latency and time saved.</p>
          </div>
          <div className="row wrap-flex" style={{ gap: 9 }}>
            <Segmented ariaLabel="Date range" value={String(days)} onChange={(v) => setDays(Number(v))}
              options={[{ id: "7", label: "7d" }, { id: "30", label: "30d" }, { id: "90", label: "90d" }]} />
            <Segmented ariaLabel="Metric" value={metric} onChange={setMetric}
              options={[{ id: "runs", label: "Runs" }, { id: "credits", label: "Credits" }, { id: "words", label: "Words" }, { id: "latency", label: "Latency" }]} />
            <button className="btn btn-ghost btn-sm" onClick={() => downloadFile("/api/analytics/export", "nebula-usage.csv")}><Icon name="download" size={14} />CSV</button>
          </div>
        </div>

        <div className="grid-4" style={{ gap: 12 }}>
          {[
            ["Runs", nf(t.runs), `avg ${t.avg_latency_ms}ms`, "bolt", delta],
            ["Credits used", nf(t.credits), `${Math.round((data.credits.pct || 0))}% of plan`, "wallet", null],
            ["Words generated", nf(t.words), `${Math.round(t.words / 225)} min read`, "doc", null],
            ["Hours saved", t.hours_saved, "at 200 words/min", "clock", null],
          ].map(([label, value, hint, icon, d]) => (
            <div key={label} className="card-flat" style={{ display: "grid", gap: 8 }}>
              <div className="row spread"><span className="label">{label}</span>
                <Icon name={icon} size={15} style={{ stroke: "var(--cyan)" }} /></div>
              <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
                <b style={{ font: "700 clamp(20px,2vw,26px)/1 var(--f-display)" }}>{value}</b>
                {d != null ? <span className={`delta ${d < 0 ? "down" : ""}`}>{d > 0 ? "+" : ""}{d}%</span> : null}
              </div>
              <span className="tiny dim">{hint}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="split-rev">
        <section className="card" style={{ display: "grid", gap: 14 }}>
          <div className="row spread">
            <h3 style={{ fontSize: 16 }}>{metric} · last {days} days</h3>
            <span className="chip mono">peak {nf(peak)}</span>
          </div>
          <BarSeries data={series} valueKey={metric} labelKey="date" tipKey={metric} height={210} />
          <hr />
          <div className="grid-2" style={{ gap: 16 }}>
            <div className="col" style={{ gap: 8 }}>
              <span className="label">Output volume</span>
              <Sparkline data={series.map((s) => s.words)} height={56} stroke="var(--violet)" id="words" />
              <span className="tiny dim">words generated per day</span>
            </div>
            <div className="col" style={{ gap: 8 }}>
              <span className="label">Image assets</span>
              <Sparkline data={series.map((s) => s.images)} height={56} stroke="var(--pink)" id="imgs" />
              <span className="tiny dim">{nf(t.images)} visuals rendered</span>
            </div>
          </div>
        </section>

        <section className="card" style={{ display: "grid", gap: 12 }}>
          <h3 style={{ fontSize: 16 }}>Mix by format</h3>
          <Donut slices={features.map((f) => ({ label: f.label, value: f.runs, color: KIND_COLOR[f.feature] || "#7c5cff" }))}
            size={128} thickness={14} centerValue={nf(t.runs)} centerLabel="runs" />
        </section>
      </div>

      <div className="grid-2">
        <section className="card" style={{ display: "grid", gap: 10 }}>
          <h3 style={{ fontSize: 16 }}>Per-feature breakdown</h3>
          <table className="table">
            <thead><tr><th>Format</th><th className="num">Runs</th><th className="num">Credits</th><th className="num">Words</th><th className="num">Avg ms</th><th className="num">Hours saved</th></tr></thead>
            <tbody>
              {features.map((f) => (
                <tr key={f.feature}>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <i style={{ width: 8, height: 8, borderRadius: 3, background: KIND_COLOR[f.feature] || "#7c5cff" }} />
                      <b style={{ color: "var(--ink)" }}>{f.label}</b>
                    </div>
                  </td>
                  <td className="num">{f.runs}</td>
                  <td className="num">{nf(f.credits)}</td>
                  <td className="num">{nf(f.words)}</td>
                  <td className="num">{nf(f.avg_latency_ms)}</td>
                  <td className="num">{f.hours_saved}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <span className="tiny dim">“Hours saved” uses the 200 words/minute drafting benchmark against generated words.</span>
        </section>

        <div className="col" style={{ gap: 16 }}>
          <section className="card" style={{ display: "grid", gap: 12 }}>
            <h3 style={{ fontSize: 16 }}>Credits & plan limits</h3>
            <Meter value={data.credits.used} max={data.credits.quota} label="used this cycle" right={`${nf(data.credits.remaining)} left`}
              tone={data.credits.pct > 80 ? "warm" : "good"} />
            <div className="row wrap-flex" style={{ gap: 6 }}>
              {Object.entries(data.actions || {}).map(([a, n]) => <span key={a} className="chip mono">{a} · {n}</span>)}
            </div>
          </section>

          <section className="card" style={{ display: "grid", gap: 10 }}>
            <h3 style={{ fontSize: 16 }}>Latest activity</h3>
            <div className="col" style={{ gap: 7, maxHeight: 300, overflow: "auto" }}>
              {(data.recent || []).map((e, i) => (
                <div key={i} className="row spread" style={{ padding: "8px 10px", background: "rgba(255,255,255,.02)", borderRadius: 10 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <i style={{ width: 7, height: 7, borderRadius: 2, background: KIND_COLOR[e.feature] || "#7c5cff" }} />
                    <span className="small">{e.feature} · <span className="dim">{e.action}</span></span>
                  </div>
                  <span className="tiny dim mono">{e.credits ? `${e.credits} cr` : ""} {e.words ? `· ${nf(e.words)}w` : ""}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
