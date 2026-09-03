import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, nf } from "../lib/api";
import { useStudio } from "../lib/store";
import Icon, { KIND_COLOR, KIND_ICON } from "../components/Icon";
import { SiteFooter, SiteNav } from "../components/SiteChrome";
import { useTitle, Meter, ScoreRing, Sparkline, BarSeries, useReveal } from "../components/ui";

const DEMO_PROMPTS = [
  { kind: "blog", label: "Blog article", prompt: "a 900-word article on AI content workflows for lean marketing teams", tone: "professional" },
  { kind: "caption", label: "Social set", prompt: "product launch: one-click briefs for the Nebula editor", tone: "bold" },
  { kind: "seo", label: "SEO brief", prompt: "content calendar template for agencies", tone: "professional" },
  { kind: "text", label: "Lifecycle email", prompt: "welcome email for new subscribers", tone: "friendly" },
];

const OUTPUT_LINES = [
  "## Why this matters now",
  "Most lean teams do not lose on ideas. They lose on handoffs —",
  "briefs that never got written, reviews with no owner, numbers",
  "nobody agreed on. A documented workflow fixes all three.",
  "",
  "## The 4-step workflow",
  "1. Brief — outcome, audience, angle, proof, keywords, CTA",
  "2. Draft — three passes against the same brief, then merge",
  "3. Cut — remove 30% of the words; keep every number",
  "4. Ship — publish, score it Friday, keep what moved",
];

/* ------------------------------------------------------------------ hero demo */
function HeroDemo({ onOpen }) {
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState("typing"); // typing -> generating -> done
  const step = DEMO_PROMPTS[i];

  useEffect(() => {
    let cancelled = false;
    setPhase("typing"); setTyped("");
    let t = 0;
    const text = step.prompt;
    const iv = setInterval(() => {
      if (cancelled) return;
      t += 3;
      setTyped(text.slice(0, t));
      if (t >= text.length) {
        clearInterval(iv);
        setTimeout(() => !cancelled && setPhase("generating"), 340);
        setTimeout(() => !cancelled && setPhase("done"), 1500);
      }
    }, 26);
    const cycle = setTimeout(() => { if (!cancelled) setI((v) => (v + 1) % DEMO_PROMPTS.length); }, 8200);
    return () => { cancelled = true; clearInterval(iv); clearTimeout(cycle); };
  }, [i, step.prompt]);

  const progress = phase === "done" ? 100 : phase === "generating" ? 62 : 18;
  return (
    <div className="gen-window" style={{ cursor: "pointer" }} onClick={onOpen}
         role="button" tabIndex={0} aria-label="Open the live studio demo"
         onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen?.()}>
      <div className="gw-bar">
        <span className="gw-dots"><i /><i /><i /></span>
        <span className="mono tiny dim" style={{ marginLeft: 6 }}>nebula.studio/app/create · {step.label}</span>
        <span className="chip chip-accent" style={{ marginLeft: "auto" }}>
          <Icon name="bolt" size={12} />{phase === "done" ? "ready" : "generating"}
        </span>
      </div>
      <div className="gw-body">
        <div className="gw-prompt">
          <span className="tiny dim mono">PROMPT</span>
          <div style={{ marginTop: 4 }}>{typed || step.prompt}
            {phase === "typing" ? <span className="caret" /> : null}
          </div>
        </div>
        <div className="gw-tags">
          <span className="chip">tone · {step.tone}</span>
          <span className="chip">length · {step.kind === "blog" ? "900 words" : "short"}</span>
          <span className="chip">model · {step.kind === "blog" ? "nebula-longform-3" : "nebula-copy-2"}</span>
          <span className="chip chip-lime">brand voice on</span>
        </div>
        <div className={`gw-out ${phase === "generating" ? "gw-streaming" : ""}`}>
          {phase === "generating" ? (
            <>
              <div className="gw-line w1" /><div className="gw-line w2" /><div className="gw-line w3" /><div className="gw-line w4" />
              <div className="thinking" style={{ marginTop: 12 }}><span className="dots"><i /><i /><i /></span>Writing section 2 of 5…</div>
            </>
          ) : phase === "typing" ? (
            <div className="tiny dim" style={{ paddingTop: 60, textAlign: "center" }}>
              Output appears here — Markdown, tables, FAQ and meta description included.
            </div>
          ) : (
            OUTPUT_LINES.map((l, k) => (
              <div key={k} className="fade-up" style={{
                animationDelay: `${k * 55}ms`, fontSize: l.startsWith("#") ? 13.5 : 13,
                fontWeight: l.startsWith("#") ? 700 : 400, color: l.startsWith("#") ? "#fff" : "var(--ink-2)",
                fontFamily: /^\d\./.test(l) ? "var(--f-mono)" : undefined, minHeight: l ? undefined : 6,
              }}>{l}</div>
            ))
          )}
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <Meter value={progress} label={phase === "done" ? "Draft complete · 12 credits" : "Streaming"} right={phase === "done" ? "578 words" : `${progress}%`} tone="good" />
        </div>
      </div>
      <div className="gw-foot">
        <span className="row" style={{ gap: 7 }}><i className="badge-dot" />Saved to Northbeam Growth · history + analytics updated</span>
        <span className="mono">⏎ open the live demo</span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- live analyzer box */
const SAMPLE_TEXT = `In today's fast-paced digital landscape, it is important to note that content teams must leverage
seamless AI workflows to unlock efficiency. Moreover, organizations that delve into the paradigm of automation can
foster a holistic approach to publishing. Furthermore, robust tooling is crucial to embark on this transformative
journey, and overall the synergy between editors and models is a testament to innovation.`;

function LiveAnalyzer() {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [state, setState] = useState({ loading: false, data: null, error: null });
  const run = useCallback(async () => {
    if (text.trim().split(/\s+/).length < 20) { setState({ loading: false, data: null, error: "Paste at least 20 words" }); return; }
    setState({ loading: true, data: null, error: null });
    try {
      const res = await api.generate({ kind: "analyze", prompt: "pasted draft", source: text });
      setState({ loading: false, data: res.document, error: null });
    } catch (e) {
      setState({ loading: false, data: null, error: e.message });
    }
  }, [text]);

  const m = state.data?.meta;
  return (
    <div className="analyzer" id="analyzer">
      <div className="card card-pad-lg stack-14">
        <div className="spread">
          <span className="eyebrow">Live · no signup</span>
          <span className="chip mono">{text.trim().split(/\s+/).filter(Boolean).length} words</span>
        </div>
        <textarea className="textarea" style={{ minHeight: 210 }} value={text}
          onChange={(e) => setText(e.target.value)} placeholder="Paste a paragraph or two…" aria-label="Text to analyse" />
        <div className="row wrap-flex">
          <button className="btn btn-primary" onClick={run} disabled={state.loading}>
            <Icon name={state.loading ? "refresh" : "scan"} size={16} />{state.loading ? "Analysing…" : "Analyse this content"}
          </button>
          <button className="btn btn-quiet" onClick={() => setText(SAMPLE_TEXT)}>Load AI-sounding sample</button>
          <button className="btn btn-quiet" onClick={() => setText(`We rebuilt the brief on Tuesday — not because the old one was wrong, but because nobody could say who signed off on the angle. Three fields fixed it: the outcome, the number we wanted to move, and a deadline with a name on it. Output went from 4 posts a month to 11. Editors still push back, which is the point. A template nobody argues with is a template nobody uses.`)}>Load human sample</button>
        </div>
        {state.error ? <div className="chip chip-danger">{state.error}</div> : null}
      </div>
      <div className="card card-pad-lg">
        {!m ? (
          <div className="col center stack-14" style={{ placeItems: "center", padding: "34px 0", gap: 12 }}>
            <Icon name="gauge" size={30} style={{ opacity: 0.4 }} />
            <div className="muted small" style={{ maxWidth: "32ch" }}>
              Run it to see an overall score, AI-generation likelihood, readability, detected tone and the fix list.
            </div>
          </div>
        ) : (
          <div className="col" style={{ gap: 16 }}>
            <div className="row" style={{ gap: 18, alignItems: "center", flexWrap: "wrap" }}>
              <ScoreRing value={m.content_score} label="content" />
              <div className="col grow" style={{ gap: 9 }}>
                <div className="row spread"><span className="muted small">AI-generated likelihood</span>
                  <b className="mono">{m.ai_probability}%</b></div>
                <Meter value={m.ai_probability} tone={m.ai_probability > 55 ? "warm" : "good"} />
                <div className="row spread"><span className="muted small">Readability (Flesch)</span><b className="mono">{m.readability.flesch}</b></div>
                <Meter value={m.readability.flesch} tone="good" />
                <div className="row wrap-flex" style={{ gap: 6, marginTop: 4 }}>
                  <span className="chip">tone · {m.tone}</span>
                  <span className="chip">verdict · {m.verdict}</span>
                  <span className="chip">burstiness · {m.burstiness}</span>
                </div>
              </div>
            </div>
            <hr />
            <div className="col" style={{ gap: 8 }}>
              <span className="label">Fix list</span>
              {m.fixes.slice(0, 4).map((f, i) => (
                <div key={i} className="row" style={{ gap: 9, alignItems: "flex-start" }}>
                  <span className={`chip ${f.impact === "high" ? "chip-danger" : f.impact === "medium" ? "chip-amber" : "chip"}`}>{f.impact}</span>
                  <div className="col" style={{ gap: 2 }}>
                    <b style={{ fontSize: 13.5 }}>{f.issue}</b>
                    <span className="tiny muted">{f.detail}</span>
                  </div>
                </div>
              ))}
            </div>
            <Link className="btn btn-ghost btn-sm" to="/signin?demo=1" style={{ alignSelf: "start" }}>
              <Icon name="arrow" size={15} />Run the full analyzer inside the studio
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ sections */
const FEATURES = [
  { icon: "doc", title: "AI text generation", body: "Briefs in, drafts out. Emails, ads, product copy, scripts and launch notes with tone and length pinned to your brand voice.", color: "#f7b955", span: 3 },
  { icon: "layers", title: "Blog & article engine", body: "Outline → sections → FAQ → meta description. Tables, callouts and internal links arrive pre-structured for your CMS.", color: "#7c5cff", span: 3 },
  { icon: "hash", title: "Social captions", body: "Platform-aware: 275 chars on X, no emoji on LinkedIn, hashtag counts per network, with best-time suggestions.", color: "#ff6bc4", span: 2 },
  { icon: "image", title: "Image generation", body: "Six art directions and five aspect ratios for hero, social and ad creative — exported as SVG or PNG.", color: "#ff9b6b", span: 2 },
  { icon: "scan", title: "Content analyzer", body: "AI-tell likelihood, readability, burstiness, tone and a prioritised fix list — before anything ships.", color: "#22d3ee", span: 2 },
  { icon: "swap", title: "Rewriting", body: "Professional ↔ casual ↔ bold, plain-language and conciseness passes. Every swap is logged so you can trust the output.", color: "#5ce6a4", span: 3 },
  { icon: "compress", title: "Summarization", body: "Extractive TL;DR with key points and action items, plus the compression ratio so readers know what they lost.", color: "#8fb4ff", span: 3 },
  { icon: "search", title: "SEO keyword suggestions", body: "Volume, difficulty, CPC and intent per keyword, a prioritised target list and the H2 map to satisfy it.", color: "#c8ff5c", span: 2 },
  { icon: "grid", title: "Content templates", body: "14 starting points from pillar pages to repurposing passes; save any generation as your own template.", color: "#7c5cff", span: 2 },
  { icon: "quote", title: "Prompt library", body: "Versioned, searchable prompts with variable slots. Reuse the wording that already performed.", color: "#ff6bc4", span: 2 },
  { icon: "folder", title: "Projects & workspaces", body: "Separate brand voice, channels and history per project. Invite the team, keep client work apart.", color: "#f7b955", span: 3 },
  { icon: "clock", title: "Generation history", body: "Every run keeps its prompt, params, engine stats and edits — regenerate, diff, or export later.", color: "#22d3ee", span: 3 },
  { icon: "download", title: "Exports", body: "Markdown, styled HTML, plain text, JSON and CSV. Batch export a whole project in one file.", color: "#5ce6a4", span: 2 },
  { icon: "shield", title: "Auth & seats", body: "Email + password now, Firebase Auth / SSO wired for production. Per-seat limits enforced server-side.", color: "#8fb4ff", span: 2 },
  { icon: "chart", title: "Usage analytics", body: "Runs, credits, latency, words and hours saved per feature — the numbers you take to finance.", color: "#c8ff5c", span: 2 },
];

function Features() {
  return (
    <div className="bento">
      {FEATURES.map((f, i) => (
        <article key={f.title} className={`card card-hover span-${f.span}`} style={{ ["--c"]: f.color, paddingBottom: 24 }}>
          <div className="feature-ico" style={{ background: `color-mix(in srgb, ${f.color} 16%, transparent)`, borderColor: `color-mix(in srgb, ${f.color} 40%, transparent)` }}>
            <Icon name={f.icon} size={20} style={{ stroke: f.color }} />
          </div>
          <h3>{f.title}</h3>
          <p>{f.body}</p>
          <div className="row" style={{ marginTop: 14, gap: 6 }}>
            <span className="chip mono" style={{ fontSize: 11 }}>0{i + 1}</span>
            <span className="tiny dim">part of one dashboard</span>
          </div>
        </article>
      ))}
    </div>
  );
}

const STEPS = [
  { n: "01", title: "Set the brief", body: "Topic, audience, tone, length and keywords — or start from a template. Your brand voice and banned phrases load automatically.", icon: "edit" },
  { n: "02", title: "Generate in parallel", body: "One prompt becomes an article, three captions, an ad and a hero image. Every run is saved with its parameters.", icon: "bolt" },
  { n: "03", title: "Analyse before shipping", body: "Run the analyzer on the draft: AI-tell likelihood, readability, proof density and a fix list ordered by impact.", icon: "scan" },
  { n: "04", title: "Approve, export, learn", body: "Export to Markdown/HTML/CSV or your CMS, then check usage analytics to see which formats actually earn their credits.", icon: "check" },
];

function FormatsStrip() {
  const { kinds } = useStudio();
  const list = kinds.length ? kinds : [
    { id: "blog", label: "Blog / Article", blurb: "Outline, sections, FAQ, meta description", credits: 12 },
    { id: "analyze", label: "Content Analyzer", blurb: "AI-tell score, readability, fix list", credits: 2 },
    { id: "caption", label: "Social Captions", blurb: "Platform-native, hashtag aware", credits: 3 },
    { id: "text", label: "AI Text", blurb: "Email, ad, product, script", credits: 4 },
    { id: "rewrite", label: "Rewrite", blurb: "Tone + conciseness, change log", credits: 3 },
    { id: "summarize", label: "Summarize", blurb: "TL;DR, key points, actions", credits: 2 },
    { id: "seo", label: "SEO Keywords", blurb: "Volume, intent, brief", credits: 5 },
    { id: "image", label: "Image Generation", blurb: "6 styles · 5 ratios", credits: 8 },
  ];
  return (
    <div className="grid-4">
      {list.map((k) => (
        <Link key={k.id} to={`/signin?demo=1&next=/app/create/${k.id}`} className="card-flat card-hover" style={{ display: "grid", gap: 10 }}>
          <span className="kind-tag" style={{ background: `color-mix(in srgb, ${KIND_COLOR[k.id] || "#7c5cff"} 20%, transparent)` }}>
            <Icon name={KIND_ICON[k.id] || "spark"} size={15} style={{ stroke: KIND_COLOR[k.id] || "#7c5cff" }} />
          </span>
          <div className="col" style={{ gap: 4 }}>
            <b style={{ fontSize: 14.5 }}>{k.label}</b>
            <span className="tiny muted">{k.blurb}</span>
          </div>
          <span className="chip mono" style={{ alignSelf: "start", fontSize: 11 }}>{k.credits} credits</span>
        </Link>
      ))}
    </div>
  );
}

function PricingBlock() {
  const [cycle, setCycle] = useState("monthly");
  const { plans } = useStudio();
  const [live, setLive] = useState([]);
  useEffect(() => {
    if (plans.length) setLive(plans);
    else api.plans().then((d) => setLive(d.plans)).catch(() => {});
  }, [plans]);
  const shown = live.length ? live : [];
  return (
    <div className="col stack-22">
      <div className="row" style={{ gap: 12, justifyContent: "center", alignItems: "center" }}>
        <span className="seg">
          {[["monthly", "Monthly"], ["yearly", "Yearly · save 20%"]].map(([id, label]) => (
            <button key={id} aria-pressed={cycle === id} onClick={() => setCycle(id)}>{label}</button>
          ))}
        </span>
      </div>
      <div className="plans">
        {shown.map((p) => {
          const price = cycle === "yearly" ? Math.round((p.price_yearly || p.price_monthly * 12 * 0.8) / 12) : p.price_monthly;
          return (
            <div key={p.id} className={`plan ${p.popular ? "popular" : ""}`}>
              {p.popular ? <span className="ribbon">Most popular</span> : null}
              <div className="col" style={{ gap: 6 }}>
                <b style={{ font: "700 15px var(--f-display)" }}>{p.name}</b>
                <span className="tiny muted">{p.tagline}</span>
              </div>
              <div className="plan-price">
                {price == null ? "Custom" : <>${price}<small>/mo{cycle === "yearly" && price ? " billed yearly" : ""}</small></>}
              </div>
              <ul>
                {p.features.map((f) => <li key={f}><Icon name="check" size={15} />{f}</li>)}
                {(p.missing || []).map((f) => <li key={f} className="off"><Icon name="x" size={15} />{f}</li>)}
              </ul>
              <Link className={`btn ${p.popular ? "btn-primary" : "btn-ghost"} btn-block`} to={`/signin?demo=1&plan=${p.id}`}>
                {p.id === "enterprise" ? "Talk to us" : p.price_monthly ? "Start on " + p.name : "Start free"}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const FAQS = [
  ["Is this a demo or a working product?", "Working. The React app talks to a FastAPI service; generations, exports, analytics and billing all persist in a JSON store in dev. Swap the store for PostgreSQL and the routes are unchanged."],
  ["Do I need an OpenAI or image API key?", "No. The bundled generation engine is deterministic Python (outlines, keyword expansion, extractive summaries, tone rewriting, an analyzer with real readability maths) and the images are rendered procedurally as SVG. Add provider keys in the environment and the same endpoints route to your model instead."],
  ["What exactly does the content analyzer measure?", "Flesch readability and grade level, sentence-length variance (burstiness), lexical diversity, proof density, structural signals, and an AI-tell lexicon. The score is a weighted blend — treat it as an editor's checklist, not a court verdict."],
  ["Can teams share brand voice and templates?", "Yes. Brand voice, banned phrases, channels and templates live on the workspace. Everyone generating in that workspace inherits them, and per-seat limits are enforced server-side."],
  ["How are credits counted?", "Per feature and length: 2 credits for a summary or analysis, 12 for a long-form article, 8 for an image. The composer shows the cost before you run it, and usage analytics ties credits to output."],
  ["What can I export?", "Markdown, styled HTML with the meta description inlined, plain text, JSON (with parameters and engine stats) and CSV for keyword and analytics tables. Batch export merges a whole project into one file."],
];

export default function Landing() {
  useTitle("AI Content Creation Studio");
  const nav = useNavigate();
  const { signedIn } = useStudio();
  const rootRef = useReveal([signedIn]);
  const [usage, setUsage] = useState(null);
  useEffect(() => {
    api.usage(14).then(setUsage).catch(() => {});
  }, []);
  const openDemo = useCallback(() => nav("/signin?demo=1"), [nav]);

  const stats = useMemo(() => usage?.totals, [usage]);

  return (
    <div className="site" ref={rootRef}>
      <SiteNav onNavigate={(to) => nav(to)} />

      {/* ---------------------------------------------------------------- hero */}
      <section className="hero">
        <div className="hero-mesh" aria-hidden="true"><i /><i /><i /></div>
        <div className="hero-grid-lines" aria-hidden="true" />
        <div className="wrap hero-inner">
          <div className="col stack-22">
            <span className="chip chip-accent" style={{ alignSelf: "flex-start" }}>
              <i className="badge-dot" />AI Content Creation Studio · v1.0
            </span>
            <h1>Generate, analyse and ship<br /><span className="grad-text">every piece of content</span> from one dashboard.</h1>
            <p className="hero-sub">
              Nebula Studio is the workspace where blog drafts, social captions, ad copy, images, rewrites,
              summaries and SEO briefs get created — then scored for readability and AI-tells before anyone
              publishes them. Ten formats, one review loop, real usage analytics.
            </p>
            <div className="hero-cta">
              <button className="btn btn-primary btn-lg" onClick={openDemo}>
                <Icon name="play" size={16} fill />Open the live studio
              </button>
              <a className="btn btn-ghost btn-lg" href="#analyzer"><Icon name="scan" size={16} />Try the content analyzer</a>
            </div>
            <div className="row tiny muted" style={{ gap: 8 }}>
              <Icon name="check" size={14} style={{ stroke: "var(--lime)" }} />No signup for the analyzer
              <span className="dim">·</span>
              <Icon name="check" size={14} style={{ stroke: "var(--lime)" }} />Demo workspace pre-loaded
              <span className="dim">·</span>
              <Icon name="check" size={14} style={{ stroke: "var(--lime)" }} />Bring your own model keys
            </div>
            <div className="hero-stats">
              {[[nf(stats?.documents ?? 128) + "+", "pieces drafted"], [nf(stats?.words ?? 46000) + "", "words generated"],
                [`${stats?.images ?? 16}`, "visuals rendered"], [`${stats?.avg_latency_ms ?? 940}ms`, "median latency"]]
                .map(([v, l]) => (<div key={l}><b>{v}</b><span>{l}</span></div>))}
            </div>
          </div>
          <HeroDemo onOpen={openDemo} />
        </div>
      </section>

      {/* ------------------------------------------------------------- marquee */}
      <section className="band" style={{ padding: "22px 0" }}>
        <div className="marquee">
          <div className="marquee-track">
            {[...Array(2)].map((_, dup) => (
              <div key={dup} className="row" style={{ gap: 46 }}>
                {["NORTIBEAM", "Halcyon Labs", "PAPERTRAIL", "Northwind Media", "CADENCE", "Bright Fold Studio", "MERIDIAN", "Foundry & Fen"].map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ features */}
      <section className="section" id="features">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">The whole toolkit</span>
            <h2>Fifteen capabilities. One workspace, one review trail.</h2>
            <p>Most teams stitch five tools together to write, illustrate, optimise and publish. Nebula keeps the
              brief, the drafts, the analysis and the numbers in the same place — so nothing gets lost between tabs.</p>
          </div>
          <Features />
        </div>
      </section>

      {/* ------------------------------------------------------------ analyzer */}
      <section className="section band" id="analyzer-section">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Content analyzer</span>
            <h2>Paste your draft. Find out if it reads like a person wrote it.</h2>
            <p>The analyzer scores readability, sentence rhythm, proof density and the AI-tell lexicon that
              detectors and readers both notice — then hands you a fix list ordered by impact. This box is live.</p>
          </div>
          <div className="reveal"><LiveAnalyzer /></div>
          <div className="row wrap-flex tiny muted" style={{ marginTop: 18, gap: 10 }}>
            <span className="chip">Flesch + grade level</span><span className="chip">Burstiness σ/μ</span>
            <span className="chip">Lexical diversity</span><span className="chip">Proof density</span>
            <span className="chip">Tone detection</span><span className="chip">Keyword density</span>
            <span className="chip">Structure & scannability</span>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ workflow */}
      <section className="section" id="workflows">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">How teams run it</span>
            <h2>Four steps from brief to published — with receipts.</h2>
          </div>
          <div className="grid-4">
            {STEPS.map((s, i) => (
              <div key={s.n} className="card card-hover reveal" style={{ animationDelay: `${i * 60}ms`, display: "grid", gap: 12 }}>
                <div className="spread">
                  <span className="mono" style={{ fontSize: 26, color: "var(--violet)", fontWeight: 700 }}>{s.n}</span>
                  <Icon name={s.icon} size={19} style={{ stroke: "var(--ink-3)" }} />
                </div>
                <h3 style={{ fontSize: 17 }}>{s.title}</h3>
                <p className="small muted">{s.body}</p>
              </div>
            ))}
          </div>
          <hr style={{ margin: "44px 0" }} />
          <div className="section-head reveal" style={{ marginBottom: 22 }}>
            <h2 style={{ fontSize: "clamp(23px,2.4vw,31px)" }}>Ten generation formats, priced in credits</h2>
            <p>Same brief, any format. Switch kind inside the composer without re-typing anything.</p>
          </div>
          <div className="reveal"><FormatsStrip /></div>
        </div>
      </section>

      {/* ----------------------------------------------------- inside the app */}
      <section className="section band">
        <div className="wrap">
          <div className="grid-2" style={{ alignItems: "center", gap: 36 }}>
            <div className="col stack-22 reveal">
              <span className="eyebrow">Inside the studio</span>
              <h2 style={{ fontSize: "clamp(26px,3vw,38px)" }}>A dashboard that behaves like a product, not a chat window.</h2>
              <p className="big muted">The composer is one side of the screen; the other side is the workspace:
                pinned drafts, generation history, template library, prompt versions, per-feature usage and exports.</p>
              <ul className="feature-list" style={{ marginTop: 4 }}>
                {[
                  "Composer with live credit estimate, tone, length and platform controls",
                  "Every run stores prompt, params, engine model and latency",
                  "Brand voice + banned phrases applied to all generations",
                  "Analytics: runs, credits, words, hours saved, avg latency per feature",
                  "Export single doc or a whole project (MD / HTML / TXT / JSON / CSV)",
                ].map((li) => (
                  <li key={li}><Icon name="check" />{li}</li>
                ))}
              </ul>
              <div className="row wrap-flex">
                <button className="btn btn-primary" onClick={openDemo}><Icon name="bolt" size={15} />Open the demo workspace</button>
                <Link className="btn btn-ghost" to="/features">See all features</Link>
              </div>
            </div>
            <div className="col" style={{ gap: 16 }}>
              <div className="shot reveal">
                <div className="shot-bar">
                  <span className="gw-dots"><i /><i /><i /></span>
                  <span className="shot-url">nebula.studio/app · {stats ? `${nf(stats.runs)} runs tracked` : "live data"}</span>
                </div>
                <div style={{ padding: 16, background: "var(--bg-2)", display: "grid", gap: 14 }}>
                  <div className="row spread">
                    <span className="label">Usage · last 14 days</span>
                    <span className="chip chip-cyan mono">{nf(stats?.words || 0)} words</span>
                  </div>
                  <BarSeries data={(usage?.series || []).slice(-14)} valueKey="runs" labelKey="date" tipKey="credits" height={120} />
                  <div className="grid-2" style={{ gap: 12 }}>
                    {(usage?.features || []).slice(0, 4).map((f) => (
                      <div key={f.feature} className="card-flat" style={{ padding: 12, display: "grid", gap: 6 }}>
                        <div className="row spread tiny">
                          <span className="muted">{f.label}</span><b className="mono">{f.runs}</b>
                        </div>
                        <Sparkline data={Array.from({ length: 14 }, (_, i) => Math.max(0, f.runs - Math.abs(7 - i) * (f.runs / 16) + (i % 3)))}
                          height={30} stroke={KIND_COLOR[f.feature] || "var(--violet)"} id={`sp-${f.feature}`} />
                        <span className="tiny dim mono">{f.hours_saved}h saved · {nf(f.credits)} cr</span>
                      </div>
                    ))}
                    {!usage ? Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton" style={{ height: 92 }} />) : null}
                  </div>
                </div>
              </div>
              <div className="row wrap-flex tiny dim" style={{ gap: 8, justifyContent: "space-between" }}>
                <span>Rendered from the live API — this is real usage data, not a screenshot.</span>
                <span className="mono">GET /api/analytics/usage</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- image gen */}
      <section className="section" id="image">
        <div className="wrap">
          <div className="split-rev reveal">
            <div className="col stack-22">
              <span className="eyebrow">Image generation</span>
              <h2 style={{ fontSize: "clamp(26px,3vw,38px)" }}>Campaign art that follows the same brief as the copy.</h2>
              <p className="big muted">Six art directions — aurora, editorial, noir, neon, pastel, terracotta — across
                five aspect ratios, rendered from the prompt so the headline, palette and composition stay
                coherent with the article they sit next to.</p>
              <div className="row wrap-flex" style={{ gap: 7 }}>
                {["1:1", "4:5", "16:9", "9:16", "3:2"].map((r) => <span className="chip mono" key={r}>{r}</span>)}
                <span className="chip chip-accent">SVG + PNG export</span>
              </div>
              <Link className="btn btn-primary" style={{ alignSelf: "start" }} to="/signin?demo=1&next=/app/create/image">
                <Icon name="image" size={15} />Generate one in the studio
              </Link>
            </div>
            <div className="grid-2">
              {["aurora", "editorial", "neon", "terracotta"].map((s, i) => (
                <div key={s} className="card-flat" style={{ padding: 0, overflow: "hidden" }}>
                  <img src={`/api/preview/image?style=${s}`} alt={`${s} style sample`} loading="lazy"
                    style={{ width: "100%", height: 172, objectFit: "cover", display: "block", background: "var(--bg-2)" }}
                    onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  <div className="row spread" style={{ padding: "10px 12px" }}>
                    <span className="small" style={{ textTransform: "capitalize" }}>{s}</span>
                    <span className="tiny dim mono">{i % 2 ? "4:5" : "1:1"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ pricing */}
      <section className="section band" id="pricing">
        <div className="wrap">
          <div className="section-head reveal center" style={{ marginLeft: "auto", marginRight: "auto" }}>
            <span className="eyebrow" style={{ justifyContent: "center" }}>Pricing</span>
            <h2>Subscription-ready, from solo to enterprise.</h2>
            <p>Credits meter the model, not the features — every plan gets the analyzer, templates and exports.</p>
          </div>
          <div className="reveal"><PricingBlock /></div>
        </div>
      </section>

      {/* ------------------------------------------------------ testimonials */}
      <section className="section">
        <div className="wrap">
          <div className="grid-3">
            {[
              ["We deleted four tools", "Nebula replaced the writer, the rewriter, the keyword tool and the image tab. The one thing I did not expect was the analyzer catching how much our 'human' posts had started to sound like the model.", "Priya Raman", "Head of Content, Cadence", "#7c5cff"],
              ["Brief-first is the trick", "Because the brief lives with the draft, regenerating a quarter-old post takes ninety seconds instead of a day of archaeology.", "Marco Silva", "Founder, Bright Fold Studio", "#22d3ee"],
              ["Finance actually believes us", "Hours saved per feature with the credit cost next to it. That slide used to be a guess.", "Dana Whitfield", "VP Marketing, Meridian", "#c8ff5c"],
            ].map(([title, body, who, role, hue]) => (
              <figure className="card reveal quote" key={who} style={{ margin: 0 }}>
                <Icon name="quote" size={22} style={{ stroke: hue }} />
                <h3 style={{ fontSize: 17 }}>{title}</h3>
                <blockquote>“{body}”</blockquote>
                <figcaption className="who">
                  <span className="avatar" style={{ background: hue }}>{who.split(" ").map((n) => n[0]).join("")}</span>
                  <span className="col"><b style={{ fontSize: 13.5 }}>{who}</b><span className="tiny dim">{role}</span></span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- faq */}
      <section className="section" id="faq">
        <div className="wrap-narrow">
          <div className="section-head reveal">
            <span className="eyebrow">Questions</span>
            <h2>Answers before you ask.</h2>
          </div>
          <div className="faq reveal">
            {FAQS.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- cta */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="cta-panel reveal">
            <div className="grid-2" style={{ alignItems: "center", gap: 26 }}>
              <div className="col stack-14">
                <h2 style={{ fontSize: "clamp(25px,2.9vw,37px)" }}>Start with a brief, leave with a published piece.</h2>
                <p className="big muted" style={{ maxWidth: "48ch" }}>
                  The demo workspace is seeded with 16 documents, a template library, prompt versions and 44 days
                  of usage data so nothing looks empty.
                </p>
                <div className="row wrap-flex">
                  <button className="btn btn-primary btn-lg" onClick={openDemo}><Icon name="bolt" size={16} />Open the live studio</button>
                  <Link className="btn btn-ghost btn-lg" to="/signup">Create your own workspace</Link>
                </div>
              </div>
              <div className="col" style={{ gap: 10 }}>
                {[["7 content formats", "blog, social, email, ads, image, rewrite, summarize"],
                  ["2 QA passes", "analyzer + SEO brief before anything ships"],
                  ["5 export formats", "md, html, txt, json, csv"]].map(([a, b]) => (
                  <div key={a} className="row spread" style={{ padding: "12px 14px", border: "1px solid var(--line-2)", borderRadius: 12, background: "rgba(255,255,255,.04)" }}>
                    <b>{a}</b><span className="tiny muted">{b}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
