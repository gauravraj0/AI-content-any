import { useEffect, useState } from "react";
import { api, fmtDate, nf } from "../../lib/api";
import { useStudio } from "../../lib/store";
import Icon from "../../components/Icon";
import { useTitle, Meter, Modal, Segmented, useToast } from "../../components/ui";

export default function Billing() {
  useTitle("Plan & billing");
  const { plans, refresh, user, credits } = useStudio();
  const toast = useToast();
  const [sub, setSub] = useState(null);
  const [cycle, setCycle] = useState("monthly");
  const [busy, setBusy] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [list, setList] = useState(plans);

  useEffect(() => { if (plans.length) setList(plans); }, [plans]);
  useEffect(() => {
    api.plans().then((d) => setList((cur) => (cur.length ? cur : d.plans))).catch(() => {});
    load();
  }, []);

  const load = () => api.subscription().then(setSub).catch(() => {});

  const choose = async (planId) => {
    setBusy(planId);
    try {
      await api.subscribe(planId, cycle);
      await refresh();
      await load();
      toast(`Switched to the ${planId === "enterprise" ? "Enterprise (contact sales)" : planId + ""} plan`, "ok");
    } catch (e) { toast(e.message, "err"); } finally { setBusy(null); }
  };

  const current = sub?.plan?.id || user?.plan || "free";
  const plan = list.find((p) => p.id === current) || list[0];

  return (
    <>
      <div className="grid-2" style={{ gap: 18 }}>
        <section className="card" style={{ display: "grid", gap: 14 }}>
          <div className="row spread">
            <div className="col"><h2 style={{ fontSize: 19 }}>Current subscription</h2>
              <span className="tiny dim">Mocked Stripe object — same shape, real enforcement server-side.</span></div>
            <span className="chip chip-lime">{sub?.subscription?.status || "active"}</span>
          </div>
          <div className="row wrap-flex" style={{ gap: 14, alignItems: "flex-end" }}>
            <div className="col" style={{ gap: 2 }}>
              <span className="label">Plan</span>
              <b style={{ font: "700 25px/1.1 var(--f-display)" }}>{plan?.name || "Starter"}</b>
            </div>
            <div className="col" style={{ gap: 2 }}>
              <span className="label">Price</span>
              <b className="mono" style={{ fontSize: 19 }}>{plan?.price_monthly ? `$${cycle === "yearly" ? Math.round(plan.price_yearly / 12) : plan.price_monthly}/mo` : "Custom"}</b>
            </div>
            <div className="col" style={{ gap: 2 }}>
              <span className="label">Renews</span>
              <b className="mono" style={{ fontSize: 19 }}>{sub?.subscription?.renews_at ? fmtDate(sub.subscription.renews_at) : "—"}</b>
            </div>
            <div className="col" style={{ gap: 2 }}>
              <span className="label">Card</span>
              <b className="mono" style={{ fontSize: 19 }}>{sub?.subscription?.card_last4 ? `•••• ${sub.subscription.card_last4}` : "—"}</b>
            </div>
          </div>
          <Meter value={credits.used} max={credits.quota} label={`${nf(credits.used)} credits used`} right={`${nf(credits.remaining)} remaining`} tone={credits.pct > 80 ? "warm" : "good"} />
          <div className="row wrap-flex" style={{ gap: 8 }}>
            <span className="chip">{plan?.seats} seats</span>
            <span className="chip">{plan?.projects ? `${plan.projects} projects` : "unlimited projects"}</span>
            <span className="chip">{nf(plan?.images_monthly || 0)} images / mo</span>
            <span className="chip">{plan?.retention_days ? `${Math.round(plan.retention_days / 30)} month history` : "unlimited history"}</span>
          </div>
          <hr />
          <div className="row wrap-flex" style={{ gap: 8 }}>
            <Segmented ariaLabel="Billing cycle" value={cycle} onChange={setCycle} options={[{ id: "monthly", label: "Monthly billing" }, { id: "yearly", label: "Yearly (−20%)" }]} />
            <span className="grow" />
            {current !== "free" ? <button className="btn btn-quiet btn-sm" onClick={() => setConfirmCancel(true)}>Cancel at period end</button> : null}
          </div>
        </section>

        <section className="card" style={{ display: "grid", gap: 12 }}>
          <h2 style={{ fontSize: 19 }}>Invoices</h2>
          <table className="table">
            <thead><tr><th>Invoice</th><th>Plan</th><th className="num">Amount</th><th>Date</th><th>Status</th></tr></thead>
            <tbody>
              {(sub?.invoices || []).map((inv) => (
                <tr key={inv.id}>
                  <td className="mono" style={{ color: "var(--ink)" }}>{inv.id}</td>
                  <td>{inv.plan}</td>
                  <td className="num">${inv.amount}</td>
                  <td>{inv.date}</td>
                  <td><span className="chip chip-lime">{inv.status}</span></td>
                </tr>
              ))}
              {!sub?.invoices?.length ? <tr><td colSpan={5} className="dim">No invoices on the free plan.</td></tr> : null}
            </tbody>
          </table>
          <span className="tiny dim">Payment provider: <span className="mono">{sub?.subscription?.provider || "none"}</span> · webhooks and proration are stubbed behind the same interface.</span>
        </section>
      </div>

      <section className="card" style={{ display: "grid", gap: 14 }}>
        <div className="row spread">
          <div className="col"><h2 style={{ fontSize: 19 }}>Change plan</h2>
            <span className="tiny dim">Switching re-reads entitlements immediately: project limits, seats, image quota and credit metering.</span></div>
          <button className="btn btn-ghost btn-sm" onClick={load}><Icon name="refresh" size={14} />Reload</button>
        </div>
        <div className="plans">
          {list.map((p) => {
            const price = cycle === "yearly" ? Math.round((p.price_yearly ?? p.price_monthly * 12 * 0.8) / 12) : p.price_monthly;
            const isCurrent = p.id === current;
            return (
              <div key={p.id} className={`plan ${isCurrent ? "popular" : ""}`}>
                {isCurrent ? <span className="ribbon">Current</span> : null}
                <div className="col" style={{ gap: 4 }}>
                  <b style={{ fontSize: 15 }}>{p.name}</b>
                  <span className="tiny muted">{p.tagline}</span>
                </div>
                <div className="plan-price">{price == null ? "Custom" : <>${price}<small>/mo</small></>}</div>
                <ul>{p.features.slice(0, 5).map((f) => <li key={f}><Icon name="check" size={15} />{f}</li>)}</ul>
                <button className={`btn ${isCurrent ? "btn-ghost" : p.popular ? "btn-primary" : "btn-ghost"} btn-block`}
                  disabled={isCurrent || busy === p.id} onClick={() => choose(p.id)}>
                  {busy === p.id ? "Applying…" : isCurrent ? "Active plan" : p.id === "enterprise" ? "Request access" : `Switch to ${p.name}`}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {confirmCancel ? (
        <Modal title="Cancel subscription?" onClose={() => setConfirmCancel(false)} footer={<>
          <button className="btn btn-quiet" onClick={() => setConfirmCancel(false)}>Keep plan</button>
          <button className="btn btn-danger" onClick={async () => {
            await api.cancel(); setConfirmCancel(false); await load(); await refresh();
            toast("Subscription will cancel at period end", "ok");
          }}>Confirm</button>
        </>}>
          <p className="small muted">Your workspace stays on {plan?.name} until {sub?.subscription?.renews_at ? fmtDate(sub.subscription.renews_at) : "the period ends"}, then drops to Starter. Documents, exports and history are never deleted.</p>
        </Modal>
      ) : null}
    </>
  );
}
