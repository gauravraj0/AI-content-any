import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, nf } from "../../lib/api";
import { useStudio } from "../../lib/store";
import Icon, { KIND_COLOR, KIND_ICON } from "../../components/Icon";
import { Modal } from "../../components/ui";
import { Logo } from "../../components/SiteChrome";

const NAV = [
  { to: "/app", label: "Overview", icon: "grid", end: true },
  { to: "/app/create", label: "Create", icon: "spark" },
  { to: "/app/documents", label: "Library", icon: "folder" },
  { to: "/app/templates", label: "Templates", icon: "layers" },
  { to: "/app/prompts", label: "Prompt library", icon: "quote" },
  { to: "/app/analytics", label: "Analytics", icon: "chart" },
];
const NAV2 = [
  { to: "/app/billing", label: "Billing", icon: "wallet" },
  { to: "/app/settings", label: "Workspace", icon: "gear" },
];

function GlobalSearch({ open, onClose }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const nav = useNavigate();
  const { workspaceId } = useStudio();
  useEffect(() => {
    if (!open) { setQ(""); return; }
    const t = setTimeout(() => {
      api.documents({ q, limit: 8, workspace_id: workspaceId }).then((d) => setRows(d.documents || [])).catch(() => setRows([]));
    }, q ? 180 : 0);
    return () => clearTimeout(t);
  }, [q, open, workspaceId]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!open) return null;
  return (
    <Modal title="Search documents" onClose={onClose} wide>
      <input className="input" autoFocus placeholder="Search titles, prompts and drafts…"
        value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && rows[0]) { nav(`/app/documents/${rows[0].id}`); onClose(); } }} />
      <div className="col" style={{ gap: 6, maxHeight: "52vh", overflow: "auto" }}>
        {rows.length ? rows.map((r) => (
          <button key={r.id} className="list-row" style={{ border: "1px solid var(--line)" }}
            onClick={() => { nav(`/app/documents/${r.id}`); onClose(); }}>
            <span className="kind-tag" style={{ background: `color-mix(in srgb, ${KIND_COLOR[r.kind]} 22%, transparent)` }}>
              <Icon name={KIND_ICON[r.kind]} size={15} style={{ stroke: KIND_COLOR[r.kind] }} />
            </span>
            <span className="grow col" style={{ gap: 2, alignItems: "flex-start" }}>
              <b className="truncate" style={{ maxWidth: "100%" }}>{r.title}</b>
              <span className="tiny dim">{r.kind} · {nf(r.word_count || 0)} words</span>
            </span>
            <Icon name="arrow" size={15} style={{ color: "var(--ink-3)" }} />
          </button>
        )) : <div className="empty">{q ? "No documents match that search." : "Type to search your library."}</div>}
      </div>
    </Modal>
  );
}

function WorkspaceSwitcher() {
  const { workspaces, workspace, chooseWorkspace } = useStudio();
  const [open, setOpen] = useState(false);
  if (!workspace) return null;
  return (
    <div style={{ position: "relative" }}>
      <button className="ws-switch" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        <span className="ws-swatch" style={{ background: workspace.color || "var(--violet)" }}>
          {(workspace.name || "?").slice(0, 1).toUpperCase()}
        </span>
        <span className="grow col" style={{ gap: 1, alignItems: "flex-start" }}>
          <b className="truncate" style={{ fontSize: 13, maxWidth: "100%" }}>{workspace.name}</b>
          <span className="tiny dim">{workspace.documents} docs · {workspace.is_owner ? "owner" : "member"}</span>
        </span>
        <Icon name="swap" size={14} style={{ color: "var(--ink-3)" }} />
      </button>
      {open ? (
        <div className="card-flat" role="menu" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 40, padding: 6, boxShadow: "var(--shadow)" }}
          onMouseLeave={() => setOpen(false)}>
          {workspaces.map((w) => (
            <button key={w.id} role="menuitem" className="nav-item" onClick={() => { chooseWorkspace(w.id); setOpen(false); }}>
              <span className="ws-swatch" style={{ width: 18, height: 18, borderRadius: 6, background: w.color }}>{(w.name || "?")[0]}</span>
              <span className="label-text truncate">{w.name}</span>
              {w.id === workspace.id ? <Icon name="check" size={14} style={{ marginLeft: "auto", stroke: "var(--lime)" }} /> : null}
            </button>
          ))}
          <hr style={{ margin: "6px 0" }} />
          <Link className="nav-item label-text" to="/app/settings" onClick={() => setOpen(false)}>
            <Icon name="plus" size={15} /><span className="label-text">New workspace</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export default function AppShell() {
  const { user, credits, signOut, workspace } = useStudio();
  const loc = useLocation();
  const nav = useNavigate();
  const [search, setSearch] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setSearch((v) => !v); }
      if (mod && e.key.toLowerCase() === "j") { e.preventDefault(); nav("/app/create"); }
      if (e.key === "?" && !/input|textarea/i.test(e.target.tagName)) setShortcuts((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav]);

  const title = useMemo(() => {
    const seg = loc.pathname.split("/")[2] || "";
    const map = { "": "Overview", create: "Create", documents: "Library", templates: "Templates", prompts: "Prompt library", analytics: "Analytics", billing: "Billing", settings: "Workspace settings" };
    return map[seg] ?? "Studio";
  }, [loc.pathname]);

  const planName = user?.plan_name || "Starter";
  const pct = Math.min(100, credits.pct || 0);

  return (
    <div className="app-shell">
      <aside className="side">
        <div className="side-brand"><Logo /></div>
        <div className="hide-narrow" style={{ padding: "0 0 10px" }}><WorkspaceSwitcher /></div>
        <div className="side-group">
          <div className="side-title">Studio</div>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} title={n.label}>
              <Icon name={n.icon} size={17} /><span className="label-text">{n.label}</span>
              {n.label === "Create" ? <span className="kbd label-text">⌘J</span> : null}
            </NavLink>
          ))}
        </div>
        <div className="side-group">
          <div className="side-title">Account</div>
          {NAV2.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} title={n.label}>
              <Icon name={n.icon} size={17} /><span className="label-text">{n.label}</span>
            </NavLink>
          ))}
          <button className="nav-item" onClick={() => nav("/")} title="Marketing site">
            <Icon name="globe" size={17} /><span className="label-text">View site</span>
          </button>
        </div>
        <div className="side-foot hide-narrow">
          <div className="col" style={{ gap: 7 }}>
            <div className="row spread tiny"><span className="label">Credits · {planName}</span><span className="mono">{nf(credits.remaining)} left</span></div>
            <div className="usage-bar"><i style={{ width: `${pct}%` }} /></div>
            <div className="row spread tiny dim"><span>{nf(credits.used)} of {nf(credits.quota)}</span>
              <Link to="/app/billing" style={{ color: "var(--cyan)" }}>{planName === "Starter" ? "Upgrade" : "Manage"}</Link>
            </div>
          </div>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <span className="avatar" style={{ background: `hsl(${user?.avatar_hue ?? 262} 80% 66%)` }}>
              {(user?.name || "N").split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </span>
            <span className="col grow" style={{ gap: 0, minWidth: 0 }}>
              <b className="truncate" style={{ fontSize: 12.5 }}>{user?.name}</b>
              <span className="tiny dim truncate">{user?.email}</span>
            </span>
            <button className="btn btn-quiet btn-icon" onClick={() => { signOut(); nav("/"); }} title="Sign out" aria-label="Sign out">
              <Icon name="logout" size={15} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="col" style={{ gap: 1 }}>
            <h1>{title}</h1>
            {workspace ? <span className="tiny dim truncate">{workspace.name} · {workspace.documents} documents</span> : null}
          </div>
          <button className="btn btn-ghost btn-sm hide-sm" onClick={() => setSearch(true)} style={{ marginLeft: "auto", minWidth: 220, justifyContent: "flex-start", gap: 8 }}>
            <Icon name="search" size={14} style={{ color: "var(--ink-3)" }} />
            <span className="dim" style={{ fontWeight: 400 }}>Search library…</span>
            <span className="kbd" style={{ marginLeft: "auto" }}>⌘K</span>
          </button>
          <button className="btn btn-ghost btn-icon" onClick={() => setShortcuts(true)} aria-label="Keyboard shortcuts" title="Shortcuts">
            <Icon name="bell" size={16} />
          </button>
          <Link className="btn btn-primary btn-sm" to="/app/create"><Icon name="plus" size={15} />New generation</Link>
        </header>
        <div className="page page-wide">
          <Outlet />
        </div>
      </main>

      <GlobalSearch open={search} onClose={() => setSearch(false)} />
      {shortcuts ? (
        <Modal title="Keyboard shortcuts" onClose={() => setShortcuts(false)}>
          <div className="col" style={{ gap: 8 }}>
            {[["⌘ / Ctrl + K", "Search the library"], ["⌘ / Ctrl + J", "Jump to the composer"],
              ["⌘ / Ctrl + Enter", "Generate (in the composer)"], ["?", "This panel"]].map(([k, v]) => (
              <div key={k} className="row spread"><span className="muted small">{v}</span><span className="kbd">{k}</span></div>
            ))}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
