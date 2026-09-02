import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { copyText } from "../lib/api";

/* ------------------------------------------------------------------ toasts */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, tone = "info") => {
    const id = Math.random().toString(36).slice(2);
    setItems((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), tone === "err" ? 6000 : 3600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            <Icon name={t.tone === "err" ? "x" : t.tone === "ok" ? "check" : "spark"} size={15} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------------------------------------------- modal */
/** Per-page browser tab title — cheap SPA polish that also fixes history/tab labels. */
export function useTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Nebula Studio` : "Nebula Studio";
  }, [title]);
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={wide ? { width: "min(880px, 100%)" } : undefined} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3 style={{ fontSize: 16 }}>{title}</h3>
          <button className="btn btn-quiet btn-icon" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- controls */
export function Segmented({ options, value, onChange, ariaLabel }) {
  // a pressed-button group, not a tablist: there are no tabpanels to control here
  return (
    <div className="seg" role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const id = typeof o === "string" ? o : o.id;
        const label = typeof o === "string" ? o : o.label;
        return (
          <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button className="switch" role="switch" aria-checked={!!checked} aria-label={label}
      onClick={() => onChange(!checked)} />
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="tiny dim">{hint}</span> : null}
    </label>
  );
}

export function CopyButton({ text, label = "Copy", onDone }) {
  const [state, setState] = useState("idle");
  return (
    <button className="btn btn-ghost btn-sm" onClick={async () => {
      const ok = await copyText(text);
      setState(ok ? "done" : "blocked");
      if (ok) onDone?.();
      setTimeout(() => setState("idle"), 1600);
    }}>
      <Icon name={state === "done" ? "check" : "copy"} size={14} />{state === "done" ? "Copied" : state === "blocked" ? "Blocked" : label}
    </button>
  );
}

export function Counter({ to = 0, duration = 900, decimals = 0, prefix = "", suffix = "" }) {
  const [v, setV] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    let raf;
    const started = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - started) / duration);
      setV(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <span ref={ref} className="mono">{prefix}{v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>;
}

export function useReveal(deps = []) {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const nodes = root.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) { nodes.forEach((n) => n.classList.add("in")); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

/* ------------------------------------------------------------------ charts */
export function Sparkline({ data = [], height = 54, stroke = "var(--cyan)", fill = true, id = "spark" }) {
  const w = 100;
  const max = Math.max(1, ...data);
  const pts = data.map((v, i) => [(i / Math.max(1, data.length - 1)) * w, height - (v / max) * (height - 6) - 3]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");
  const area = `${d} L${w},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height }} role="img" aria-label="Trend">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.34" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill ? <path d={area} fill={`url(#${id})`} /> : null}
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function BarSeries({ data = [], height = 168, valueKey = "runs", labelKey = "date", tipKey = null }) {
  const [hover, setHover] = useState(-1);
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey]) || 0));
  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height }}>
        {data.map((d, i) => {
          const v = Number(d[valueKey]) || 0;
          const h = Math.max(3, (v / max) * (height - 26));
          return (
            <div key={i} style={{ flex: 1, display: "grid", gap: 6, justifyItems: "stretch" }}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}>
              <div style={{ height: h, minHeight: 3, borderRadius: 4,
                background: hover === i ? "linear-gradient(180deg,var(--cyan),var(--violet))" : "linear-gradient(180deg,rgba(124,92,255,.9),rgba(124,92,255,.28))",
                transition: "height .45s cubic-bezier(.2,.9,.2,1), background .18s" }} />
              <span className="tiny dim mono" style={{ textAlign: "center", fontSize: 9.5 }}>{String(d[labelKey]).slice(5)}</span>
            </div>
          );
        })}
      </div>
      {hover >= 0 && data[hover] ? (
        <div className="chip" style={{ position: "absolute", top: -6, left: `${(hover / data.length) * 100}%`, pointerEvents: "none" }}>
          {String(data[hover][labelKey])} · {data[hover][tipKey || valueKey]} {tipKey ? "" : "runs"}
        </div>
      ) : null}
    </div>
  );
}

export function Donut({ slices = [], size = 132, thickness = 15, centerLabel, centerValue }) {
  const total = Math.max(1, slices.reduce((a, s) => a + s.value, 0));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Mix">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={thickness} />
          {slices.map((s, i) => {
            const len = (s.value / total) * c;
            const el = (
              <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
                strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} strokeLinecap="butt"
                style={{ transition: "stroke-dasharray .6s ease" }} />
            );
            offset += len;
            return el;
          })}
        </g>
        {centerValue != null ? (
          <text x="50%" y="47%" textAnchor="middle" fill="var(--ink)" style={{ font: `700 ${size / 7}px var(--f-display)` }}>{centerValue}</text>
        ) : null}
        {centerLabel ? (
          <text x="50%" y="60%" textAnchor="middle" fill="var(--ink-3)" style={{ font: `500 ${size / 13}px var(--f-mono)`, letterSpacing: "0.1em" }}>{centerLabel}</text>
        ) : null}
      </svg>
      <div className="col" style={{ gap: 7 }}>
        {slices.map((s, i) => (
          <div key={i} className="row" style={{ gap: 8, fontSize: 13 }}>
            <i style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flex: "none" }} />
            <span className="muted grow">{s.label}</span>
            <b className="mono">{Math.round((s.value / total) * 100)}%</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScoreRing({ value = 0, label = "score", size = 154, stroke = 12, tone = "auto" }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  const color = tone === "auto"
    ? (value >= 80 ? "var(--green)" : value >= 60 ? "var(--cyan)" : value >= 40 ? "var(--amber)" : "var(--danger)")
    : tone;
  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.65" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#ring-grad)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} style={{ transition: "stroke-dasharray .8s cubic-bezier(.2,.9,.2,1)" }} />
      </svg>
      <b style={{ flexDirection: "column", gap: 2 }}>
        <span>{Math.round(value)}</span>
        <span className="tiny dim" style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</span>
      </b>
    </div>
  );
}

export function Meter({ value = 0, max = 100, tone, label, right }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 100)) * 100));
  return (
    <div className="col" style={{ gap: 6 }}>
      {label || right ? (
        <div className="spread tiny">
          <span className="muted">{label}</span>
          <span className="mono">{right}</span>
        </div>
      ) : null}
      <div className={`meter ${tone || ""}`}><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function Empty({ icon = "layers", title, hint, action }) {
  return (
    <div className="empty">
      <Icon name={icon} size={26} style={{ opacity: 0.5 }} />
      <div>
        <div style={{ color: "var(--ink)", fontWeight: 600 }}>{title}</div>
        {hint ? <div className="tiny" style={{ marginTop: 4 }}>{hint}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function Spark({ value = 0, label, hint, delta, tone = "violet", icon = "bolt" }) {
  const toneVar = { violet: "var(--violet)", cyan: "var(--cyan)", lime: "var(--lime)", pink: "var(--pink)", amber: "var(--amber)", green: "var(--green)" }[tone];
  return (
    <div className="card-flat" style={{ display: "grid", gap: 8 }}>
      <div className="row spread">
        <span className="label">{label}</span>
        <span className="kind-tag" style={{ background: `color-mix(in srgb, ${toneVar} 18%, transparent)`, width: 26, height: 26, borderRadius: 8 }}>
          <Icon name={icon} size={14} style={{ stroke: toneVar }} />
        </span>
      </div>
      <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
        <b style={{ font: `700 clamp(21px,2.2vw,27px)/1 var(--f-display)`, letterSpacing: "-0.03em" }}>{value}</b>
        {delta != null ? <span className={`delta ${delta < 0 ? "down" : ""}`}>{delta > 0 ? "+" : ""}{delta}%</span> : null}
      </div>
      {hint ? <span className="tiny dim">{hint}</span> : null}
    </div>
  );
}

export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const run = useCallback(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    Promise.resolve(fn())
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((error) => alive && setState({ data: null, loading: false, error }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(run, [run]);
  return { ...state, reload: run, setData: (d) => setState((s) => ({ ...s, data: d })) };
}
