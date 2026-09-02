import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useStudio } from "../lib/store";
import Icon from "../components/Icon";
import { SiteFooter, SiteNav } from "../components/SiteChrome";
import { useTitle, Meter, useReveal } from "../components/ui";

const CREDIT_ROWS = [
  ["Blog / article", 12, "long-form with outline, table, FAQ, meta"],
  ["Image generation", 8, "per asset, any style or ratio"],
  ["SEO keyword brief", 5, "24 expanded keywords + optimisation map"],
  ["Short-form AI text", 4, "email, ad, product, script, launch note"],
  ["Content rewrite", 3, "tone, concise, simplify or expand"],
  ["Social caption set", 3, "up to four platforms per run"],
  ["Summarization", 2, "TL;DR, key points, action items"],
  ["Content analyzer", 2, "readability, AI-tell, fix list"],
];

export default function Pricing() {
  useTitle("Pricing");
  const { plans } = useStudio();
  const [live, setLive] = useState(plans);
  const [cycle, setCycle] = useState("monthly");
  const [sub, setSub] = useState(null);
  const nav = useNavigate();
  const ref = useReveal([live, cycle]);
  useEffect(() => {
    if (!live.length) api.plans().then((d) => setLive(d.plans)).catch(() => {});
    api.subscription().then((d) => setSub(d)).catch(() => {});
  }, [live.length]);
  const list = live.length ? live : [];

  return (
    <div className="site" ref={ref}>
      <SiteNav />
      <section className="hero" style={{ paddingBlock: "clamp(46px,6vw,80px) 26px" }}>
        <div className="hero-mesh" aria-hidden="true"><i /><i /><i /></div>
        <div className="wrap col stack-22" style={{ textAlign: "center", alignItems: "center" }}>
          <span className="eyebrow" style={{ justifyContent: "center" }}>Pricing</span>
          <h1 style={{ fontSize: "clamp(32px,4.6vw,56px)" }}>Credits for the model.<br />Everything else included.</h1>
          <p className="hero-sub center">Templates, the analyzer, exports, projects, history and analytics are on
            every plan — credits only meter generation, so a quiet week costs nothing.</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <span className="seg">
              {[["monthly", "Monthly"], ["yearly", "Yearly −20%"]].map(([id, label]) => (
                <button key={id} aria-pressed={cycle === id} onClick={() => setCycle(id)}>{label}</button>
              ))}
            </span>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 18 }}>
        <div className="wrap">
          <div className="plans">
            {list.map((p) => {
              const price = cycle === "yearly" ? Math.round((p.price_yearly ?? p.price_monthly * 12 * 0.8) / 12) : p.price_monthly;
              const current = sub?.plan?.id === p.id;
              return (
                <div key={p.id} className={`plan ${p.popular ? "popular" : ""}`}>
                  {p.popular ? <span className="ribbon">Most popular</span> : null}
                  <div className="col" style={{ gap: 6 }}>
                    <div className="row spread"><b style={{ font: "700 15.5px var(--f-display)" }}>{p.name}</b>
                      {current ? <span className="chip chip-lime">current plan</span> : null}</div>
                    <span className="tiny muted">{p.tagline}</span>
                  </div>
                  <div className="plan-price">
                    {price == null ? "Custom" : <>${price}<small>/mo{cycle === "yearly" ? ", billed yearly" : ""}</small></>}
                  </div>
                  <div className="col" style={{ gap: 8 }}>
                    <Meter value={p.credits_monthly} max={30000} label={`${p.credits_monthly.toLocaleString()} credits / mo`}
                      right={p.projects ? `${p.projects} projects` : "unlimited"} />
                    <div className="row wrap-flex tiny dim" style={{ gap: 6 }}>
                      <span className="chip">{p.seats} seats</span>
                      <span className="chip">{p.images_monthly.toLocaleString()} images</span>
                      <span className="chip">{p.retention_days ? `${Math.round(p.retention_days / 30)} mo history` : "unlimited history"}</span>
                    </div>
                  </div>
                  <ul>
                    {p.features.map((f) => <li key={f}><Icon name="check" size={15} />{f}</li>)}
                    {(p.missing || []).map((f) => <li key={f} className="off"><Icon name="x" size={15} />{f}</li>)}
                  </ul>
                  <button className={`btn ${p.popular ? "btn-primary" : "btn-ghost"} btn-block`}
                    onClick={() => nav(`/signin?demo=1&plan=${p.id}`)}>
                    {p.id === "enterprise" ? "Talk to sales" : current ? "Manage subscription" : `Choose ${p.name}`}
                  </button>
                </div>
              );
            })}
          </div>
          {!list.length ? <div className="grid-4">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 380 }} />)}</div> : null}
        </div>
      </section>

      <section className="section band">
        <div className="wrap">
          <div className="split-rev reveal">
            <div className="col stack-14">
              <span className="eyebrow">Credit table</span>
              <h2 style={{ fontSize: "clamp(24px,2.8vw,34px)" }}>What one run costs.</h2>
              <p className="muted">The composer shows this before you press generate, so nobody burns a month of
                credits by accident. Failed runs are not charged.</p>
              <Link to="/signin?demo=1&next=/app/billing" className="btn btn-primary" style={{ alignSelf: "start" }}>
                <Icon name="wallet" size={15} />See billing in the app
              </Link>
            </div>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table className="table">
                <thead><tr><th>Format</th><th>Credits</th><th>Note</th></tr></thead>
                <tbody>
                  {CREDIT_ROWS.map(([label, cr, note]) => (
                    <tr key={label}>
                      <td style={{ color: "var(--ink)" }}><b>{label}</b></td>
                      <td className="num">{cr}</td>
                      <td className="tiny dim">{note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="row spread tiny dim" style={{ padding: "12px 14px", borderTop: "1px solid var(--line)" }}>
                <span>Starter 600 credits ≈ 50 articles</span><span className="mono">1 credit = 0.05¢ at Team scale</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap-narrow reveal">
          <div className="section-head"><span className="eyebrow">Fine print</span><h2>How billing behaves</h2></div>
          <div className="faq">
            {[
              ["Do unused credits roll over?", "On Pro and Team, up to one month's quota. Starter resets at zero."],
              ["What happens when I hit the limit?", "The API returns 402 with your usage. Existing documents stay editable and exportable — nothing is locked."],
              ["Can I change plans mid-cycle?", "Yes; the mock billing screen prorates the plan and re-reads entitlements on the next request."],
              ["Is this real Stripe?", "No — the subscription object is mocked with the same shape Stripe returns (plan, cycle, status, renews_at, invoices), so the swap is a client call."],
            ].map(([q, a]) => (
              <details key={q}><summary>{q}</summary><p>{a}</p></details>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
