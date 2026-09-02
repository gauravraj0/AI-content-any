import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, copyText, nf, svgToPng } from "../../lib/api";
import { useStudio } from "../../lib/store";
import Icon, { KIND_COLOR } from "../../components/Icon";
import { useTitle, Empty, Meter, ScoreRing, Segmented, useToast } from "../../components/ui";
import Markdown from "../../components/Markdown";

const KIND_ORDER = ["blog", "text", "caption", "image", "rewrite", "summarize", "seo", "analyze"];

const KIND_HELP = {
  blog: "Long-form: outline, sections, table, FAQ, meta description.",
  text: "Short-form copy: email, ad, product description, script, launch note.",
  caption: "Platform-native posts with hashtag, emoji and character rules.",
  image: "Procedural art direction rendered to SVG, downloadable as PNG.",
  rewrite: "Tone, conciseness, plain-language or expansion — with a change log.",
  summarize: "Extractive TL;DR, key points and action items.",
  seo: "Keyword expansion with volume, difficulty, intent and a content map.",
  analyze: "Readability, AI-tell likelihood, structure and the fix list.",
};

const SAMPLES = {
  blog: "blog post about AI content workflows for lean marketing teams",
  text: "welcome email for new Nebula Studio subscribers",
  caption: "product launch: one-click briefs in the editor",
  image: "hero art for an AI content studio launch, aurora palette",
  rewrite: "Most organisations utilise a variety of content channels to leverage their brand pillars. It is important to note that in order to facilitate consistent publishing, teams must prioritize a streamlined methodology. Due to the fact that resources are limited, it is crucial to delve into the landscape of automation to unlock efficiency.",
  summarize: "The Q2 review covered output, quality and pipeline. Publishing rose from 6 to 19 pieces per month while editorial headcount stayed flat at two. The AI draft pass cut time-to-first-draft from 5.5 hours to 48 minutes. Two problems remain: review is a single-threaded queue owned by one editor, and 40 percent of published pieces have no conversion path. Legal blocked the pricing page rewrite twice because the source of truth for numbers was unclear. Recommendation for Q3: add a reviewer rota, require a CTA on every brief, and instrument assisted revenue. The team should ship the rota by 15 July and re-measure on 30 September. Budget stays flat; tooling spend increases by $400 per month for credits.",
  seo: "content calendar template for agencies",
  analyze: "In today's fast-paced digital landscape, it is important to note that content teams must leverage seamless AI workflows to unlock efficiency. Moreover, organizations that delve into the paradigm of automation can foster a holistic approach to publishing. Furthermore, robust tooling is crucial to embark on this transformative journey, and overall the synergy between editors and models is a testament to innovation.",
};

const SOURCE_KINDS = ["rewrite", "summarize", "analyze"];

/**
 * One-shot handoff from the other screens:
 *   · Templates “Use”  → sessionStorage nebula.template  (params incl. arrays) + query string
 *   · Prompts “Run”    → sessionStorage nebula.prompt-run (filled body)  + target kind
 * Read once on mount and cleared, so a refresh never re-applies a stale brief.
 */
function readHandoff(query) {
  const take = (key) => {
    try {
      const raw = window.sessionStorage.getItem(key);
      if (!raw) return null;
      window.sessionStorage.removeItem(key);
      return JSON.parse(raw);
    } catch { return null; }
  };
  const tpl = take("nebula.template");
  const run = take("nebula.prompt-run");
  const fromQuery = Object.fromEntries(query.entries());
  delete fromQuery.kind;
  const merged = { ...(tpl?.params || {}), ...fromQuery };
  if (run?.prompt) merged.prompt = run.prompt;
  if (run?.kind && !merged.kind) merged.kind = run.kind;
  merged.__from = tpl?.name || (run?.title ? `Prompt · ${run.title}` : "");
  merged.__fields = tpl?.fields || [];
  return merged;
}

export default function Studio() {
  const { kind: routeKind } = useParams();
  const kind = KIND_ORDER.includes(routeKind) ? routeKind : "blog";
  const nav = useNavigate();
  useTitle(`Create · ${kind}`);
  const toast = useToast();
  const { user, workspace, workspaceId, tones, lengths, formats, platforms, imageStyles, imageRatios, credits, kinds, refresh } = useStudio();

  const [query] = useSearchParams();
  const [handoff] = useState(() => readHandoff(query));
  const asList = (v) => (Array.isArray(v) ? v : typeof v === "string" && v ? v.split(",").map((s) => s.trim()).filter(Boolean) : null);
  const [prompt, setPrompt] = useState(String(handoff.prompt || ""));
  const [source, setSource] = useState(String(handoff.source || ""));
  const [tone, setTone] = useState(handoff.tone || workspace?.brand_voice?.tone || "professional");
  const [length, setLength] = useState(handoff.length || "medium");
  const [audience, setAudience] = useState(handoff.audience || workspace?.brand_voice?.audience || "");
  const [keywords, setKeywords] = useState((asList(handoff.keywords) || []).join(", ") || String(handoff.keywords || ""));
  const [format, setFormat] = useState(handoff.format || "email");
  const [platformsOn, setPlatformsOn] = useState(asList(handoff.platforms) || ["linkedin", "x", "instagram"]);
  const [style, setStyle] = useState(handoff.style || "aurora");
  const [ratio, setRatio] = useState(handoff.ratio || "1:1");
  const [mode, setMode] = useState(handoff.mode || "tone");
  const [fromLabel, setFromLabel] = useState(handoff.__from || "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [typed, setTyped] = useState(0);
  const [tab, setTab] = useState("output");
  const [estimate, setEstimate] = useState(null);
  const [error, setError] = useState(null);
  const [noCredits, setNoCredits] = useState(false);
  const typerRef = useRef(null);

  const needsSource = SOURCE_KINDS.includes(kind);

  // switch kind -> seed a sample so the panel is never empty
  useEffect(() => {
    if (!prompt && !source && !handoff.__from) {
      const s = SAMPLES[kind];
      if (needsSource) setSource(s); else setPrompt(s);
    }
    setResult(null); setTyped(0); setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      api.estimate({ kind, length, prompt, source })
        .then((e) => alive && setEstimate(e))
        .catch(() => alive && setEstimate(null));
    }, 220);
    return () => { alive = false; clearTimeout(t); };
  }, [kind, length, prompt, source]);

  const runTyper = useCallback((text) => {
    cancelAnimationFrame(typerRef.current);
    const start = performance.now();
    const total = Math.max(700, Math.min(2600, text.length * 6));
    const tick = (now) => {
      const p = Math.min(1, (now - start) / total);
      setTyped(Math.floor(text.length * (1 - Math.pow(1 - p, 2))));
      if (p < 1) typerRef.current = requestAnimationFrame(tick);
    };
    typerRef.current = requestAnimationFrame(tick);
  }, []);
  useEffect(() => () => cancelAnimationFrame(typerRef.current), []);

  const payload = useMemo(() => ({
    workspace_id: workspaceId, kind,
    prompt: prompt.trim(), source: source.trim(), tone, length, audience: audience.trim() || undefined,
    keywords: keywords.split(",").map((s) => s.trim()).filter(Boolean),
    format, platforms: platformsOn, style, ratio, mode,
  }), [workspaceId, kind, prompt, source, tone, length, audience, keywords, format, platformsOn, style, ratio, mode]);

  const generate = useCallback(async () => {
    if (busy) return;
    setBusy(true); setError(null); setNoCredits(false); setTab("output");
    try {
      const out = kind === "image"
        ? await api.generateImage({ workspace_id: workspaceId, prompt: prompt.trim(), style, ratio })
        : await api.generate(payload);
      setResult(kind === "image" ? { ...out.document, isImage: true } : out.document);
      if (kind !== "image") runTyper(out.document.content || "");
      refresh().catch(() => {});
      toast("Saved to the library · credits applied", "ok");
    } catch (e) {
      const msg = e.message || "Generation failed";
      if (e.status === 402) setNoCredits(true);
      setError(msg);
      toast(msg, "err");
    } finally { setBusy(false); }
  }, [busy, kind, workspaceId, prompt, style, ratio, payload, runTyper, toast, refresh]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); generate(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [generate]);

  const meta = result?.meta || {};
  const shown = result?.isImage ? "" : (result?.content || "").slice(0, typed);
  const cost = (kinds.find((k) => k.id === kind)?.credits) ?? 3;
  const canRun = needsSource ? source.trim().split(/\s+/).length >= 6 : prompt.trim().length >= 8;

  return (
    <div className="split">
      {/* ------------------------------------------------------------ composer */}
      <div className="col sticky-col" style={{ gap: 16 }}>
        <div className="card" style={{ display: "grid", gap: 12, padding: 14 }}>
          <span className="label">Format</span>
          <div className="grid-2" style={{ gap: 7 }}>
            {KIND_ORDER.map((k) => (
              <button key={k} onClick={() => nav(`/app/create/${k}`)}
                className="list-row" aria-current={k === kind}
                style={{ padding: "9px 10px", borderRadius: 11, gap: 9,
                  background: k === kind ? `color-mix(in srgb, ${KIND_COLOR[k]} 16%, transparent)` : "transparent",
                  borderColor: k === kind ? `color-mix(in srgb, ${KIND_COLOR[k]} 45%, transparent)` : "transparent" }}>
                <Icon name={k === "blog" ? "doc" : k === "text" ? "pen" : k === "caption" ? "hash" : k === "image" ? "image" : k === "rewrite" ? "swap" : k === "summarize" ? "compress" : k === "seo" ? "search" : "scan"} size={15} style={{ stroke: KIND_COLOR[k] }} />
                <b style={{ fontSize: 13, color: k === kind ? "#fff" : "var(--ink-2)" }}>
                  {k === "blog" ? "Blog / article" : k === "text" ? "AI text" : k === "caption" ? "Social" : k === "image" ? "Image" : k === "rewrite" ? "Rewrite" : k === "summarize" ? "Summarize" : k === "seo" ? "SEO" : "Analyze"}
                </b>
              </button>
            ))}
          </div>
          <p className="tiny dim">{KIND_HELP[kind]}</p>
        </div>

        <div className="card" style={{ display: "grid", gap: 15 }}>
          <div className="row spread">
            <span className="label">Brief</span>
            <button className="btn btn-quiet btn-xs" onClick={() => { needsSource ? setSource(SAMPLES[kind]) : setPrompt(SAMPLES[kind]); }}>
              <Icon name="wand" size={12} />Load sample
            </button>
          </div>

          {fromLabel ? (
            <div className="row spread" style={{ gap: 10, padding: "9px 12px", borderRadius: 11,
              background: "rgba(34,211,238,.08)", border: "1px solid rgba(34,211,238,.26)" }}>
              <span className="row tiny" style={{ gap: 8 }}>
                <Icon name="layers" size={14} style={{ color: "var(--cyan)", flex: "none" }} />
                <span className="muted">Loaded from <b style={{ color: "var(--ink)" }}>{fromLabel}</b>
                  {handoff.__fields?.length ? ` — fills ${handoff.__fields.join(", ")}` : " — variables filled in"}
                </span>
              </span>
              <button className="btn btn-quiet btn-xs" onClick={() => setFromLabel("")} aria-label="Dismiss the loaded-template banner">
                <Icon name="x" size={12} />Dismiss
              </button>
            </div>
          ) : null}

          {needsSource ? (
            <label className="field">
              <span className="label">Source text</span>
              <textarea className="textarea" style={{ minHeight: 190 }} value={source} onChange={(e) => setSource(e.target.value)}
                placeholder="Paste the text you want rewritten, summarised or analysed…" aria-label="Source text" />
              <span className="tiny dim">{nf(source.trim().split(/\s+/).filter(Boolean).length)} words · {nf(source.length)} characters</span>
            </label>
          ) : (
            <label className="field">
              <span className="label">{kind === "image" ? "Image description" : "What should we write?"}</span>
              <textarea className="textarea" style={{ minHeight: 118 }} value={prompt} onChange={(e) => setPrompt(e.target.value)}
                placeholder={kind === "image" ? "hero art for a product launch, aurora palette, editorial type" : "a 900-word article on AI content workflows for lean marketing teams"} aria-label="Prompt" />
            </label>
          )}

          {kind === "text" ? (
            <label className="field"><span className="label">Copy type</span>
              <select className="select" value={format} onChange={(e) => setFormat(e.target.value)}>
                {(formats.length ? formats : [{ id: "email", label: "Email" }]).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </label>
          ) : null}

          {kind === "rewrite" ? (
            <label className="field"><span className="label">Rewrite mode</span>
              <Segmented ariaLabel="Rewrite mode" value={mode} onChange={setMode}
                options={[{ id: "tone", label: "Tone" }, { id: "concise", label: "Concise" }, { id: "simplify", label: "Plain language" }, { id: "expand", label: "Expand" }]} />
            </label>
          ) : null}

          {kind === "caption" ? (
            <label className="field"><span className="label">Platforms</span>
              <div className="checks">
                {(platforms.length ? platforms : ["linkedin", "x", "instagram", "tiktok", "facebook", "threads", "youtube"]).map((p) => (
                  <button key={p} type="button" className="pill-toggle" aria-pressed={platformsOn.includes(p)}
                    onClick={() => setPlatformsOn((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))}>{p}</button>
                ))}
              </div>
            </label>
          ) : null}

          {kind === "image" ? (
            <>
              <label className="field"><span className="label">Art direction</span>
                <div className="checks">
                  {(imageStyles.length ? imageStyles : ["aurora"]).map((s) => (
                    <button key={s} type="button" className="pill-toggle" aria-pressed={style === s} onClick={() => setStyle(s)}>{s}</button>
                  ))}
                </div>
              </label>
              <label className="field"><span className="label">Aspect ratio</span>
                <div className="checks">
                  {(imageRatios.length ? imageRatios : ["1:1"]).map((r) => (
                    <button key={r} type="button" className="pill-toggle mono" aria-pressed={ratio === r} onClick={() => setRatio(r)}>{r}</button>
                  ))}
                </div>
              </label>
            </>
          ) : null}

          {!["seo", "image"].includes(kind) ? (
            <label className="field"><span className="label">Tone</span>
              <div className="checks">
                {(tones.length ? tones : ["professional", "casual", "bold"]).map((t) => (
                  <button key={t} type="button" className="pill-toggle" aria-pressed={tone === t} onClick={() => setTone(t)}>{t}</button>
                ))}
              </div>
            </label>
          ) : null}

          {["blog", "text", "summarize", "analyze"].includes(kind) ? (
            <label className="field"><span className="label">Length</span>
              <Segmented ariaLabel="Length" value={length} onChange={setLength}
                options={lengths.length ? lengths.map((l) => ({ id: l.id, label: l.label })) : [{ id: "short", label: "Short" }, { id: "medium", label: "Medium" }, { id: "long", label: "Long" }]} />
            </label>
          ) : null}

          {!SOURCE_KINDS.includes(kind) ? (
            <div className="grid-2" style={{ gap: 12 }}>
              <label className="field"><span className="label">Audience</span>
                <input className="input" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="lean marketing teams" />
              </label>
              <label className="field"><span className="label">Keywords (optional)</span>
                <input className="input" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="content ops, briefs" />
              </label>
            </div>
          ) : null}

          <hr />
          <div className="row spread">
            <div className="col" style={{ gap: 3 }}>
              <span className="tiny dim mono">
                {estimate ? `${estimate.credits} credits · ~${estimate.seconds}s · ${estimate.model}` : "estimating…"}
              </span>
              <span className="tiny dim">{nf(credits.remaining)} credits left on {user?.plan_name}</span>
            </div>
            <button className="btn btn-primary" onClick={generate} disabled={busy || !canRun}>
              <Icon name={busy ? "refresh" : "bolt"} size={15} />{busy ? "Generating…" : "Generate"}
            </button>
          </div>
          {!canRun ? <span className="tiny dim">{needsSource ? "Paste at least a sentence of source text." : "Describe the topic in a few more words."}</span> : null}
          {error ? <div className="chip chip-danger" style={{ padding: "9px 12px" }}><Icon name="x" size={14} />{error}</div> : null}
          {noCredits ? (
            <div className="card" style={{ padding: 14, display: "grid", gap: 8, borderColor: "rgba(255,107,196,.4)" }}>
              <b style={{ fontSize: 14 }}>You have spent this cycle's credits</b>
              <span className="tiny muted">Every format costs credits ({cost} for this one). Upgrade to keep generating, or wait for the monthly reset.</span>
              <div className="row" style={{ gap: 8 }}>
                <Link className="btn btn-primary btn-sm" to="/app/billing"><Icon name="wallet" size={14} />See plans</Link>
                <button className="btn btn-quiet btn-sm" onClick={() => { setNoCredits(false); nav("/app/analytics"); }}>Review usage</button>
              </div>
            </div>
          ) : null}
          <div className="row tiny dim" style={{ gap: 8 }}>
            <span className="kbd">⌘</span><span className="kbd">↵</span><span>to generate · a new variation each run</span>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------- output */}
      <div className="card" style={{ display: "grid", gap: 14, minHeight: 560 }}>
        <div className="row spread wrap-flex">
          <div className="row" style={{ gap: 10 }}>
            <span className="kind-tag" style={{ background: `color-mix(in srgb, ${KIND_COLOR[kind]} 22%, transparent)` }}>
              <Icon name={busy ? "refresh" : "spark"} size={15} style={{ stroke: KIND_COLOR[kind] }} />
            </span>
            <div className="col" style={{ gap: 2 }}>
              <b style={{ fontSize: 15 }}>{result ? result.title : kind === "image" ? "Generated visual" : "Output"}</b>
              <span className="tiny dim">{result ? `${result.engine?.model} · ${nf(result.engine?.words_out || 0)} words · ${result.engine?.live_ms || result.engine?.latency_ms}ms` : "Nothing generated yet in this session"}</span>
            </div>
          </div>
          {result ? (
            <div className="row" style={{ gap: 7 }}>
              <button className="btn btn-ghost btn-sm" onClick={generate}><Icon name="refresh" size={14} />Variation</button>
              {!result.isImage ? (
                <button className="btn btn-ghost btn-sm" onClick={async () => {
                  const ok = await copyText(result.content); toast(ok ? "Copied to clipboard" : "Copy blocked by the browser", ok ? "ok" : "err");
                }}><Icon name="copy" size={14} />Copy</button>
              ) : null}
              <Link className="btn btn-quiet btn-sm" to={`/app/documents/${result.id}`}>Open<Icon name="arrow" size={14} /></Link>
            </div>
          ) : null}
        </div>

        {result ? (
          <>
            <div className="tabs">
              {[["output", kind === "image" ? "Art" : kind === "analyze" ? "Report" : "Draft"],
                ...(kind === "analyze" ? [["score", "Scores"]] : []),
                ...(kind === "caption" && meta.options ? [["variants", "Variants"]] : []),
                ...(kind === "seo" && meta.keywords?.length ? [["keywords", "Keywords"]] : []),
                ["structure", "Structure"], ["export", "Export"]].filter(([id], i, arr) => arr.findIndex(([x]) => x === id) === i)
                .map(([id, label]) => (
                  <button key={id} aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
                ))}
            </div>

            {tab === "output" ? (
              <div style={{ minHeight: 300 }}>
                {result.isImage ? (
                  <div className="col" style={{ gap: 14 }}>
                    <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid var(--line-2)", background: "var(--bg-2)" }}>
                      <img src={result.image?.url} alt={result.prompt} style={{ width: "100%", display: "block" }} />
                    </div>
                    <div className="row wrap-flex" style={{ gap: 8 }}>
                      <span className="chip mono">{result.image?.width}×{result.image?.height}</span>
                      <span className="chip">{result.image?.style}</span>
                      <span className="chip mono">{nf(Math.round((result.image?.bytes || 0) / 1024))} KB SVG</span>
                      <span className="grow" />
                      <a className="btn btn-ghost btn-sm" href={result.image?.url} download={`nebula-${result.image?.id}.svg`}><Icon name="download" size={14} />SVG</a>
                      <button className="btn btn-ghost btn-sm" onClick={async () => {
                        try {
                          const blob = await svgToPng(result.image.url, 1600);
                          const a = document.createElement("a");
                          a.href = URL.createObjectURL(blob);
                          a.download = `nebula-${result.image.id}.png`;
                          a.click();
                          toast("PNG rendered from the SVG", "ok");
                        } catch { toast("Could not rasterise this asset", "err"); }
                      }}><Icon name="image" size={14} />PNG</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <Markdown>{shown}</Markdown>
                    {typed < (result.content || "").length ? (
                      <span className="row tiny dim" style={{ gap: 8 }}><span className="dots"><i /><i /><i /></span>writing… {Math.round((typed / (result.content || " ").length) * 100)}%</span>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {tab === "score" && kind === "analyze" ? (
              <div className="col" style={{ gap: 18 }}>
                <div className="row wrap-flex" style={{ gap: 22, alignItems: "center" }}>
                  <ScoreRing value={meta.content_score} label="overall" />
                  <div className="col grow" style={{ gap: 12, minWidth: 240 }}>
                    <div className="col" style={{ gap: 5 }}>
                      <div className="row spread small"><span className="muted">AI-generated likelihood</span><b className="mono">{meta.ai_probability}%</b></div>
                      <Meter value={meta.ai_probability} tone={meta.ai_probability > 55 ? "warm" : "good"} />
                    </div>
                    <div className="row wrap-flex" style={{ gap: 6 }}>
                      <span className="chip">verdict · {meta.verdict}</span>
                      <span className="chip">tone · {meta.tone}</span>
                      <span className="chip">sentiment · {meta.sentiment}</span>
                      <span className="chip mono">burstiness σ/μ · {meta.burstiness}</span>
                      <span className="chip mono">diversity · {meta.lexical_diversity}</span>
                    </div>
                  </div>
                </div>
                <div className="grid-2" style={{ gap: 12 }}>
                  {(meta.metrics || []).map((b) => <Meter key={b.label} value={b.value} label={b.label} right={`${b.value}`} />)}
                </div>
                {meta.projected ? (
                  <div className="card-flat row wrap-flex" style={{ gap: 16 }}>
                    <span className="chip chip-lime">projected after fixes</span>
                    <span className="small muted">readability {meta.readability.flesch} → <b className="mono" style={{ color: "var(--ink)" }}>{meta.projected.readability}</b></span>
                    <span className="small muted">human fingerprint {meta.human_score}% → <b className="mono" style={{ color: "var(--ink)" }}>{meta.projected.human_score}%</b></span>
                  </div>
                ) : null}
                <div className="col" style={{ gap: 8 }}>
                  <span className="label">Fix list</span>
                  {meta.fixes?.map((f, i) => (
                    <div key={i} className="row" style={{ gap: 9, alignItems: "flex-start" }}>
                      <span className={`chip ${f.impact === "high" ? "chip-danger" : f.impact === "medium" ? "chip-amber" : ""}`}>{f.impact}</span>
                      <div className="col"><b style={{ fontSize: 13.5 }}>{f.issue}</b><span className="tiny muted">{f.detail}</span></div>
                    </div>
                  ))}
                </div>
                {meta.flags && Object.keys(meta.flags).length ? (
                  <div className="col" style={{ gap: 6 }}>
                    <span className="label">Flagged vocabulary</span>
                    <div className="row wrap-flex" style={{ gap: 5 }}>
                      {Object.entries(meta.flags).flatMap(([k, arr]) => arr.map((w) => <span key={k + w} className="chip mono" style={{ color: "#ffc7c7", borderColor: "rgba(255,107,107,.3)" }}>{w}</span>))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {tab === "variants" ? (
              <div className="col" style={{ gap: 12 }}>
                {(meta.options || []).map((o) => (
                  <div key={o.platform} className="card-flat" style={{ display: "grid", gap: 10 }}>
                    <div className="row spread">
                      <b style={{ fontSize: 14, textTransform: "capitalize" }}>{o.platform}</b>
                      <span className="row" style={{ gap: 7 }}>
                        <span className={`chip mono ${o.within_limit ? "" : "chip-danger"}`}>{o.chars}/{o.limit}</span>
                        <span className="chip mono">fit {o.score}</span>
                        <span className="chip">best {o.best_time}</span>
                        <button className="btn btn-quiet btn-xs" onClick={async () => { const ok = await copyText(o.text); toast(ok ? `${o.platform} caption copied` : "Copy blocked by the browser", ok ? "ok" : "err"); }}>
                          <Icon name="copy" size={12} />
                        </button>
                      </span>
                    </div>
                    <Meter value={o.chars} max={o.limit} tone={o.within_limit ? "good" : "warm"} />
                    <div className="small" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{o.text}</div>
                    {o.hashtags?.length ? <div className="row wrap-flex" style={{ gap: 5 }}>{o.hashtags.map((h) => <span key={h} className="chip mono">#{h}</span>)}</div> : null}
                  </div>
                ))}
              </div>
            ) : null}

            {tab === "keywords" ? (
              <div className="scroll-x">
                <table className="table">
                  <thead><tr><th>Keyword</th><th>Intent</th><th className="num">Vol/mo</th><th className="num">Difficulty</th><th className="num">CPC</th><th>Priority</th></tr></thead>
                  <tbody>
                    {(meta.keywords || []).map((r) => (
                      <tr key={r.keyword}>
                        <td style={{ color: "var(--ink)" }}><b>{r.keyword}</b></td>
                        <td><span className="chip">{r.intent}</span></td>
                        <td className="num">{nf(r.volume)}</td>
                        <td className="num">{r.difficulty}</td>
                        <td className="num">${r.cpc}</td>
                        <td style={{ width: 140 }}><div className="bar-cell"><i style={{ width: `${r.priority}%` }} /><span className="mono tiny">{r.priority}</span></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {tab === "structure" ? (
              <div className="grid-2" style={{ gap: 14 }}>
                {Object.entries(meta).filter(([k]) => !["options", "keywords", "fixes", "metrics", "flags", "before", "after"].includes(k))
                  .map(([k, v]) => (
                    <div key={k} className="card-flat" style={{ display: "grid", gap: 6 }}>
                      <span className="label">{k.replace(/_/g, " ")}</span>
                      {Array.isArray(v) ? (
                        <div className="row wrap-flex" style={{ gap: 5 }}>
                          {v.slice(0, 10).map((x, i) => <span key={i} className="chip">{typeof x === "object" ? JSON.stringify(x).slice(0, 40) : String(x)}</span>)}
                          {!v.length ? <span className="tiny dim">—</span> : null}
                        </div>
                      ) : typeof v === "object" && v ? (
                        <pre className="mono tiny" style={{ whiteSpace: "pre-wrap", margin: 0, color: "var(--ink-2)" }}>{JSON.stringify(v, null, 1)}</pre>
                      ) : (
                        <b className="mono" style={{ fontSize: 15 }}>{String(v)}</b>
                      )}
                    </div>
                  ))}
              </div>
            ) : null}

            {tab === "export" ? (
              <div className="col" style={{ gap: 14 }}>
                <p className="small muted">Exports run through <span className="mono">GET /api/export/{"{id}"}</span> and carry the metadata block with them.</p>
                <div className="row wrap-flex" style={{ gap: 9 }}>
                  {[["md", "Markdown"], ["html", "Styled HTML"], ["txt", "Plain text"], ["json", "JSON + params"], ["csv", "CSV (SEO table)"]].map(([f, label]) => (
                    <a key={f} className="btn btn-ghost btn-sm" href={api.exportUrl(result.id, f)} download>
                      <Icon name="download" size={14} />{label}
                    </a>
                  ))}
                </div>
                <div className="card-flat" style={{ display: "grid", gap: 8 }}>
                  <span className="label">Prompt used</span>
                  <pre className="mono tiny" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify({ kind, prompt: prompt || undefined, source: needsSource ? `${source.slice(0, 120)}…` : undefined, tone, length, format, style }, null, 1)}</pre>
                  <button className="btn btn-ghost btn-sm" style={{ alignSelf: "start" }} onClick={async () => {
                    try { await api.savePrompt(result.id, {}); toast("Saved to the prompt library", "ok"); }
                    catch (e) { toast(e.message, "err"); }
                  }}><Icon name="quote" size={14} />Save prompt to library</button>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <Empty title={busy ? "Generating…" : "Your output lands here"}
            hint={busy ? "Streaming the draft — it is saved to the library automatically." : "Pick a format, fill the brief, then press Generate. The result is typed in so you can read it as it lands."} />
        )}
      </div>
    </div>
  );
}
