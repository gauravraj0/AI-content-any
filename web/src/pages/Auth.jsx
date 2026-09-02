import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useStudio } from "../lib/store";
import Icon from "../components/Icon";
import { Logo } from "../components/SiteChrome";
import { useTitle } from "../components/ui";

const BENEFITS = [
  ["14 documents, 45 days of usage data and a prompt library already in the workspace", "bolt"],
  ["Every generation format unlocked: blog, social, email, image, rewrite, summarize, SEO, analyzer", "layers"],
  ["Exports, analytics, templates and billing all wired to the same API you would ship", "download"],
];

export default function Auth({ mode = "signin" }) {
  const { signIn, signedIn } = useStudio();
  useTitle(mode === "signup" ? "Create your account" : "Sign in");
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/app";
  const [form, setForm] = useState({ email: "", password: "", name: "", company: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);

  useEffect(() => { if (signedIn) nav(next, { replace: true }); }, [signedIn, nav, next]);

  const submit = async (e) => {
    e?.preventDefault();
    setError(""); setBusy(true);
    try {
      await signIn(mode === "signup" ? form : { email: form.email, password: form.password }, mode);
      nav(next, { replace: true });
    } catch (err) {
      setError(err.message || "Could not sign you in");
    } finally { setBusy(false); }
  };

  const enterDemo = async () => {
    setError(""); setBusy(true); setDemo(true);
    try {
      await signIn({ demo: true });
      if (params.get("plan")) {
        try { await api.subscribe(params.get("plan")); } catch { /* soft failure keeps you on the demo plan */ }
      }
      nav(next, { replace: true });
    } catch (err) {
      setError(err.message || "The demo workspace is unavailable right now");
    } finally { setBusy(false); setDemo(false); }
  };

  useEffect(() => {
    if (params.get("demo") === "1" && !signedIn) enterDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot auto sign-in on mount
  }, []);

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <Logo />
        <div className="col stack-22" style={{ maxWidth: 460 }}>
          <div>
            <span className="eyebrow">{mode === "signup" ? "Create your workspace" : "Live demo workspace"}</span>
            <h1 style={{ fontSize: "clamp(28px,3.3vw,42px)", margin: "12px 0 12px" }}>
              Content that gets written, checked and shipped in one place.
            </h1>
            <p className="muted">Sign in with the seeded account to explore a studio that already has history,
              templates, prompts, analytics and a subscription attached.</p>
          </div>
          <ul className="feature-list" style={{ gap: 12 }}>
            {BENEFITS.map(([text, icon]) => (
              <li key={text}><Icon name={icon} />{text}</li>
            ))}
          </ul>
          <div className="card-flat small muted" style={{ display: "grid", gap: 6 }}>
            <div className="row spread"><span className="mono">demo@nebula.studio</span><span className="chip mono">password · demo1234</span></div>
            <span className="tiny dim">Soft auth: closing the tab keeps the demo session; your own account uses a signed bearer token.</span>
          </div>
        </div>
        <span className="tiny dim">© {new Date().getFullYear()} Nebula Studio</span>
      </aside>

      <main className="auth-form">
        <form className="auth-card card card-pad-lg" onSubmit={submit}>
          <div className="col stack-8">
            <h2 style={{ fontSize: 24 }}>{mode === "signup" ? "Create your account" : "Sign in"}</h2>
            <p className="small muted">
              {mode === "signup" ? "A fresh workspace with the Starter plan (600 credits/month)." : "Use the demo account or your own credentials."}
            </p>
          </div>

          {mode === "signup" ? (
            <div className="grid-2" style={{ gap: 12 }}>
              <label className="field"><span className="label">Your name</span>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Alex Rivera" autoComplete="name" />
              </label>
              <label className="field"><span className="label">Company</span>
                <input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Northbeam" autoComplete="organization" />
              </label>
            </div>
          ) : null}

          <label className="field"><span className="label">Email</span>
            <input className="input" type="email" required value={form.email} placeholder="you@company.com"
              onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
          </label>
          <label className="field"><span className="label">Password</span>
            <input className="input" type="password" required minLength={8} value={form.password} placeholder="••••••••"
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete={mode === "signup" ? "new-password" : "current-password"} />
          </label>

          {error ? <div className="chip chip-danger" style={{ padding: "9px 12px" }}><Icon name="x" size={14} />{error}</div> : null}

          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
            <Icon name="arrow" size={16} />{busy ? "Working…" : mode === "signup" ? "Create workspace" : "Sign in"}
          </button>

          <div className="row" style={{ gap: 10 }}>
            <span className="grow" style={{ height: 1, background: "var(--line)" }} />
            <span className="tiny dim">or</span>
            <span className="grow" style={{ height: 1, background: "var(--line)" }} />
          </div>

          <button type="button" className="btn btn-ghost btn-lg btn-block" onClick={enterDemo} disabled={busy}>
            <Icon name={demo ? "refresh" : "spark"} size={16} />{demo ? "Loading demo…" : "Continue with the demo workspace"}
          </button>

          <p className="tiny dim center">
            {mode === "signup"
              ? <>Already have an account? <Link to="/signin" style={{ color: "var(--cyan)" }}>Sign in</Link></>
              : <>Need your own workspace? <Link to="/signup" style={{ color: "var(--cyan)" }}>Create an account</Link></>}
            {" · "}
            <Link to="/" style={{ color: "var(--ink-3)" }}>Back to the site</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
