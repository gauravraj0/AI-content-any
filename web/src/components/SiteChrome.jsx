import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useStudio } from "../lib/store";
import Icon from "./Icon";

export function Logo({ size = 30 }) {
  return (
    <Link to="/" className="logo" aria-label="Nebula Studio home">
      <span className="logo-mark" style={{ width: size, height: size }}>
        <Icon name="spark" size={size * 0.56} fill />
      </span>
      Nebula<span style={{ color: "var(--ink-3)", fontWeight: 500 }}>&nbsp;Studio</span>
    </Link>
  );
}

export function SiteNav({ onNavigate }) {
  const { signedIn } = useStudio();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => setOpen(false), [loc.pathname]);

  const links = [
    { to: "/features", label: "Features" },
    { to: "/#analyzer", label: "Analyzer" },
    { to: "/#workflows", label: "Workflows" },
    { to: "/pricing", label: "Pricing" },
    { to: "/#faq", label: "FAQ" },
  ];
  const go = (to) => {
    setOpen(false);
    onNavigate?.(to);
  };
  return (
    <header className={`nav ${scrolled ? "scrolled" : ""}`}>
      <div className="wrap nav-inner">
        <Logo />
        <nav className={`nav-links ${open ? "open" : ""}`} aria-label="Main">
          {links.map((l) => (
            <a key={l.to} href={l.to.startsWith("/#") ? l.to : l.to}
               onClick={(e) => {
                 if (l.to.startsWith("/#")) {
                   e.preventDefault();
                   go(l.to);
                 }
               }}>{l.label}</a>
          ))}
        </nav>
        <div className="nav-cta">
          {signedIn ? (
            <Link className="btn btn-primary btn-sm" to="/app"><Icon name="bolt" size={15} />Open studio</Link>
          ) : (
            <>
              <Link className="btn btn-quiet hide-sm" to="/signin">Sign in</Link>
              <Link className="btn btn-primary btn-sm" to="/signin?demo=1">Try the live demo</Link>
            </>
          )}
          <button className="btn btn-ghost btn-icon nav-burger" onClick={() => setOpen((v) => !v)} aria-label="Menu" aria-expanded={open}>
            <Icon name={open ? "x" : "menu"} size={17} />
          </button>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const cols = [
    { title: "Product", links: [["Features", "/features"], ["Pricing", "/pricing"], ["Open studio", "/app"], ["Content analyzer", "/#analyzer"]] },
    { title: "Formats", links: [["Blog & articles", "/features#blog"], ["Social captions", "/features#social"], ["Image generation", "/features#image"], ["SEO briefs", "/features#seo"]] },
    { title: "Platform", links: [["Templates", "/app/templates"], ["Prompt library", "/app/prompts"], ["Usage analytics", "/app/analytics"], ["Export API", "/features#export"]] },
    { title: "Company", links: [["About", "#"], ["Careers", "#"], ["Security", "#"], ["Status", "#"]] },
  ];
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-grid">
          <div className="stack-14">
            <Logo />
            <p className="small muted" style={{ maxWidth: "34ch" }}>
              One dashboard for generating, reviewing, analysing and shipping every piece of content your team publishes.
            </p>
            <div className="row" style={{ gap: 8 }}>
              <span className="chip"><i className="badge-dot" />All systems operational</span>
              <span className="chip mono">v1.0</span>
            </div>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h3>{c.title}</h3>
              {c.links.map(([label, href]) => (
                <Link key={label} to={href.startsWith("#") ? "/" : href}>{label}</Link>
              ))}
            </div>
          ))}
        </div>
        <hr style={{ margin: "34px 0 20px" }} />
        <div className="spread wrap-flex tiny dim">
          <span>© {new Date().getFullYear()} Nebula Studio — built for the AI Content Creation Studio brief.</span>
          <div className="row" style={{ gap: 16 }}>
            <a href="#privacy">Privacy</a><a href="#terms">Terms</a><a href="#dpa">DPA</a>
            <span className="mono">React · FastAPI · PostgreSQL · Firebase Auth</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
