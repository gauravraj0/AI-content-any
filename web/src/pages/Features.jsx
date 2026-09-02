import { Link } from "react-router-dom";
import Icon, { KIND_COLOR, KIND_ICON } from "../components/Icon";
import { SiteFooter, SiteNav } from "../components/SiteChrome";
import { useTitle, useReveal } from "../components/ui";

const GROUPS = [
  {
    id: "generate", title: "Generation", blurb: "Ten formats share one brief, one brand voice and one history.",
    items: [
      ["blog", "Blog & article generation", "Outline, H2/H3 spine, comparison table, FAQ block and meta description — exported as Markdown your CMS already speaks."],
      ["text", "AI text generation", "Lifecycle emails, paid social variants, product descriptions, 60-second scripts and launch notes, each with its own shape."],
      ["caption", "Social caption sets", "One prompt, several platforms. Character ceilings, hashtag counts and emoji budgets are enforced per network, not suggested."],
      ["image", "Image generation", "Six art directions × five ratios. Prompt-derived palette and headline, exported as SVG (or rasterised PNG in the browser)."],
    ],
  },
  {
    id: "refine", title: "Refinement & QA", blurb: "The half most tools skip: making the draft yours, then checking it.",
    items: [
      ["rewrite", "Content rewriting", "Tone shifts, plain-language passes and conciseness cuts — with a change log listing every swap so nothing silently alters meaning."],
      ["summarize", "Summarization", "Extractive scoring on term frequency, position and numbers, returning TL;DR, key points, action items and compression ratio."],
      ["analyze", "Content analyzer", "AI-tell likelihood, burstiness, lexical diversity, proof density, structure and a prioritised fix list."],
      ["seo", "SEO keyword suggestions", "Seeded expansion with volume, difficulty, CPC, intent and a priority score, plus meta title/description candidates and an H2 map."],
    ],
  },
  {
    id: "operate", title: "Operations", blurb: "Everything that makes it a product your team can run.",
    items: [
      ["grid", "Content templates", "14 built-in starting points; save any generation as a template so a good brief stops being a one-off."],
      ["quote", "Prompt library", "Searchable, versioned prompts with {variable} slots and usage counts. Run one straight into the composer."],
      ["folder", "Projects & workspaces", "Brand voice, banned phrases, channels and history per project. Owner-only delete, seat-aware lists."],
      ["clock", "Generation history", "Prompt, parameters, engine model, latency and credits for every run — reopen, tweak and regenerate."],
      ["download", "Export functionality", "Markdown, styled HTML, plain text, JSON and CSV; batch export merges a selection into one file."],
      ["shield", "Authentication & seats", "Email/password with PBKDF2 and signed bearer tokens now; Firebase Auth and SSO are documented drop-ins."],
      ["chart", "Usage analytics", "Daily series, per-feature breakdown, credits, hours saved and average latency, with CSV export for the finance review."],
      ["wallet", "Subscription architecture", "Four plans, server-side credit metering, entitlement limits on projects/seats/images and a mocked Stripe billing screen."],
    ],
  },
];

const STACK = [
  ["React 18 + Vite", "App shell, composer, analytics", "code"],
  ["FastAPI (Python 3.11)", "REST API, generation engine, exports", "bolt"],
  ["Deterministic engine", "Outlines, scoring, rewriting, analyzer", "gauge"],
  ["Procedural SVG renderer", "Image generation without a vendor bill", "image"],
  ["PostgreSQL-compatible store", "JSON file in dev, swap the repository layer", "layers"],
  ["Firebase Auth / Stripe ready", "Drop-in auth + billing providers", "shield"],
];

export default function Features() {
  useTitle("Features");
  const ref = useReveal([]);
  return (
    <div className="site" ref={ref}>
      <SiteNav />
      <section className="hero" style={{ paddingBlock: "clamp(46px,6vw,84px) 34px" }}>
        <div className="hero-mesh" aria-hidden="true"><i /><i /><i /></div>
        <div className="wrap" style={{ maxWidth: 900 }}>
          <span className="eyebrow">Feature tour</span>
          <h1 style={{ fontSize: "clamp(32px,4.4vw,54px)", margin: "14px 0 16px" }}>
            What is actually in the <span className="grad-text">studio</span>
          </h1>
          <p className="hero-sub">Every item below is implemented in this build — click through and it runs against the API.</p>
        </div>
      </section>

      {GROUPS.map((g, gi) => (
        <section className={`section ${gi % 2 ? "band" : ""}`} id={g.id} key={g.id} style={{ paddingTop: gi ? undefined : 26 }}>
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">0{gi + 1} · {g.title}</span>
              <h2 style={{ fontSize: "clamp(25px,3vw,38px)" }}>{g.title}</h2>
              <p>{g.blurb}</p>
            </div>
            <div className="grid-2">
              {g.items.map(([kind, title, body]) => (
                <article key={title} className="card card-hover reveal" style={{ display: "grid", gap: 12 }}>
                  <div className="row spread">
                    <span className="kind-tag" style={{ background: `color-mix(in srgb, ${KIND_COLOR[kind]} 20%, transparent)` }}>
                      <Icon name={KIND_ICON[kind]} size={15} style={{ stroke: KIND_COLOR[kind] }} />
                    </span>
                    <span className="chip mono" style={{ fontSize: 11 }}>{kind}</span>
                  </div>
                  <h3 style={{ fontSize: 18 }}>{title}</h3>
                  <p className="small muted">{body}</p>
                  <Link className="btn btn-quiet btn-sm" style={{ alignSelf: "start" }} to={`/signin?demo=1&next=/app/create/${kind}`}>
                    Try it <Icon name="arrow" size={14} />
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>
      ))}

      <section className="section band" id="export">
        <div className="wrap">
          <div className="split-rev reveal" style={{ alignItems: "center" }}>
            <div className="col stack-14">
              <span className="eyebrow">Architecture</span>
              <h2 style={{ fontSize: "clamp(24px,2.8vw,34px)" }}>Built the way the brief asked: React front end, FastAPI service, pluggable persistence.</h2>
              <p className="muted">The front end never talks to a model directly. It calls a REST API; the API decides
                whether the local engine, a template, or your configured provider answers. Persistence sits behind a
                repository surface so dev's JSON file and production's PostgreSQL share one query shape.</p>
              <div className="row wrap-flex">
                <Link to="/signin?demo=1" className="btn btn-primary btn-lg"><Icon name="bolt" size={16} />Open the studio</Link>
                <Link to="/pricing" className="btn btn-ghost btn-lg">Plans & credits</Link>
              </div>
            </div>
            <div className="card card-pad-lg col" style={{ gap: 10 }}>
              {STACK.map(([name, why, icon]) => (
                <div key={name} className="row" style={{ gap: 11, alignItems: "flex-start" }}>
                  <span className="kind-tag" style={{ background: "rgba(124,92,255,.16)" }}>
                    <Icon name={icon} size={14} style={{ stroke: "var(--cyan)" }} />
                  </span>
                  <div className="col" style={{ gap: 1 }}>
                    <b style={{ fontSize: 14 }}>{name}</b>
                    <span className="tiny muted">{why}</span>
                  </div>
                </div>
              ))}
              <hr />
              <div className="mono tiny dim">POST /api/generate · GET /api/analytics/usage · GET /api/export/{"{id}"}?format=csv</div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
