import { useEffect, useMemo, useState } from "react";
import { api, fmtDate, nf, tokens } from "../../lib/api";
import { useStudio } from "../../lib/store";
import Icon from "../../components/Icon";
import { useTitle, Modal, useToast } from "../../components/ui";

const CHANNELS = ["blog", "linkedin", "x", "instagram", "tiktok", "newsletter", "youtube", "facebook"];
const SWATCHES = ["#7c5cff", "#22d3ee", "#c8ff5c", "#ff6bc4", "#f7b955", "#5ce6a4", "#8fb4ff", "#ff9b6b"];

export default function Settings() {
  useTitle("Workspace settings");
  const { workspace, workspaces, chooseWorkspace, refresh, user, signOut } = useStudio();
  const toast = useToast();
  const [name, setName] = useState(workspace?.name || "");
  const [color, setColor] = useState(workspace?.color || SWATCHES[0]);
  const [channels, setChannels] = useState(workspace?.channels || ["blog"]);
  const [voice, setVoice] = useState(workspace?.brand_voice || {});
  const [avoidInput, setAvoidInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [newWs, setNewWs] = useState({ name: "", tone: "professional", audience: "" });
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!workspace) return;
    setName(workspace.name || "");
    setColor(workspace.color || SWATCHES[0]);
    setChannels(workspace.channels || ["blog"]);
    setVoice(workspace.brand_voice || {});
  }, [workspace]);

  const banned = useMemo(() => voice.avoid || [], [voice]);
  const dirty = name !== workspace?.name || color !== workspace?.color
    || JSON.stringify(channels) !== JSON.stringify(workspace?.channels || [])
    || JSON.stringify(voice) !== JSON.stringify(workspace?.brand_voice || {});

  const save = async () => {
    setBusy(true);
    try {
      await api.patchWorkspace(workspace.id, { name, color, channels, brand_voice: voice });
      await refresh();
      toast("Workspace updated", "ok");
    } catch (e) { toast(e.message, "err"); } finally { setBusy(false); }
  };

  const createWorkspace = async () => {
    setBusy(true);
    try {
      const res = await api.createWorkspace(newWs);
      await refresh();
      setCreating(false); setNewWs({ name: "", tone: "professional", audience: "" });
      toast(`Created “${res.workspace.name}”`, "ok");
    } catch (e) { toast(e.message, "err"); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="split-rev">
        <div className="col" style={{ gap: 18 }}>
          <section className="card" style={{ display: "grid", gap: 14 }}>
            <div className="row spread">
              <div className="col"><h2 style={{ fontSize: 19 }}>Workspace</h2>
                <span className="tiny dim">Applies to every generation in this project.</span></div>
              {workspace?.is_owner ? <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={14} />Delete</button> : null}
            </div>
            <div className="grid-2" style={{ gap: 14 }}>
              <label className="field"><span className="label">Name</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
              <div className="field"><span className="label">Accent</span>
                <div className="row wrap-flex" style={{ gap: 7 }}>
                  {SWATCHES.map((c) => (
                    <button key={c} onClick={() => setColor(c)} aria-label={`Accent ${c}`}
                      style={{ width: 26, height: 26, borderRadius: 8, background: c, cursor: "pointer",
                        border: color === c ? "2px solid #fff" : "1px solid var(--line-2)", transition: "0.15s" }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="field"><span className="label">Channels</span>
              <div className="checks">
                {CHANNELS.map((c) => (
                  <button key={c} type="button" className="pill-toggle" aria-pressed={channels.includes(c)}
                    onClick={() => setChannels((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]))}>{c}</button>
                ))}
              </div>
            </div>
          </section>

          <section className="card" style={{ display: "grid", gap: 14 }}>
            <div className="col" style={{ gap: 4 }}>
              <h2 style={{ fontSize: 19 }}>Brand voice</h2>
              <span className="tiny dim">Default tone, audience and the words the generator must never use.</span>
            </div>
            <div className="grid-2" style={{ gap: 14 }}>
              <label className="field"><span className="label">Default tone</span>
                <select className="select" value={voice.tone || "professional"} onChange={(e) => setVoice({ ...voice, tone: e.target.value })}>
                  {["professional", "casual", "bold", "friendly", "witty", "urgent"].map((t) => <option key={t}>{t}</option>)}
                </select></label>
              <label className="field"><span className="label">Audience</span>
                <input className="input" value={voice.audience || ""} placeholder="lean marketing teams"
                  onChange={(e) => setVoice({ ...voice, audience: e.target.value })} /></label>
            </div>
            <label className="field"><span className="label">Voice notes</span>
              <textarea className="textarea" style={{ minHeight: 88 }} value={voice.voice_notes || ""}
                placeholder="Short sentences. One number per section. No adjective without evidence."
                onChange={(e) => setVoice({ ...voice, voice_notes: e.target.value })} /></label>
            <div className="field">
              <span className="label">Banned words</span>
              <div className="row wrap-flex" style={{ gap: 6 }}>
                {banned.map((w) => (
                  <span key={w} className="chip chip-danger mono" style={{ gap: 6 }}>
                    {w}
                    <button onClick={() => setVoice({ ...voice, avoid: banned.filter((x) => x !== w) })} aria-label={`Remove ${w}`}
                      style={{ background: "none", border: 0, cursor: "pointer", color: "inherit", padding: 0, display: "grid" }}><Icon name="x" size={11} /></button>
                  </span>
                ))}
                {!banned.length ? <span className="tiny dim">None — add the words that give your brand away as machine-written.</span> : null}
              </div>
              <form className="row" style={{ gap: 8, marginTop: 6 }} onSubmit={(e) => {
                e.preventDefault();
                const w = avoidInput.trim().toLowerCase();
                if (w && !banned.includes(w)) setVoice({ ...voice, avoid: [...banned, w] });
                setAvoidInput("");
              }}>
                <input className="input" style={{ maxWidth: 260 }} value={avoidInput} onChange={(e) => setAvoidInput(e.target.value)} placeholder="add a word…" aria-label="Add a word to avoid" />
                <button className="btn btn-ghost btn-sm" type="submit"><Icon name="plus" size={14} />Add</button>
              </form>
            </div>
            <label className="field"><span className="label">Target reading level (Flesch)</span>
              <div className="row" style={{ gap: 12, alignItems: "center" }}>
                <input className="slider" type="range" min={20} max={90} value={voice.reading_level || 60}
                  onChange={(e) => setVoice({ ...voice, reading_level: Number(e.target.value) })} />
                <span className="mono small" style={{ minWidth: 34 }}>{voice.reading_level || 60}</span>
              </div>
            </label>
          </section>

          <section className="card" style={{ display: "grid", gap: 12 }}>
            <h2 style={{ fontSize: 19 }}>Team & seats</h2>
            <table className="table">
              <thead><tr><th>Member</th><th>Role</th><th>Plan</th><th>Joined</th></tr></thead>
              <tbody>
                {(workspace?.members || []).length ? null : null}
                <tr>
                  <td><div className="row" style={{ gap: 8 }}>
                    <span className="avatar" style={{ width: 24, height: 24, fontSize: 10, background: `hsl(${user?.avatar_hue || 262} 80% 66%)` }}>
                      {(user?.name || "U").split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </span><b style={{ color: "var(--ink)" }}>{user?.name} (you)</b></div></td>
                  <td>{workspace?.is_owner ? "Owner" : "Member"}</td>
                  <td>{user?.plan_name}</td>
                  <td>{user?.created_at ? fmtDate(user.created_at) : "—"}</td>
                </tr>
                <tr><td colSpan={4} className="dim">Seat management invites land in the same table once email delivery is wired (Firebase Auth in production).</td></tr>
              </tbody>
            </table>
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: "start" }} onClick={() => toast("Invite flow is stubbed in this build", "info")}>
              <Icon name="users" size={14} />Invite a teammate
            </button>
          </section>
        </div>

        <div className="col sticky-col" style={{ gap: 16 }}>
          <section className="card" style={{ display: "grid", gap: 12, position: "sticky", top: 86 }}>
            <h3 style={{ fontSize: 16 }}>Changes</h3>
            <p className="tiny muted">{dirty ? "You have unsaved changes to this workspace." : "Everything is saved."}</p>
            <button className="btn btn-primary btn-block" onClick={save} disabled={!dirty || busy}>
              <Icon name={busy ? "refresh" : "check"} size={15} />{busy ? "Saving…" : "Save workspace"}
            </button>
            <button className="btn btn-quiet btn-block" onClick={() => { setName(workspace?.name); setColor(workspace?.color); setChannels(workspace?.channels); setVoice(workspace?.brand_voice || {}); }} disabled={!dirty}>
              Discard
            </button>
          </section>

          <section className="card" style={{ display: "grid", gap: 12 }}>
            <h3 style={{ fontSize: 16 }}>Workspaces</h3>
            <div className="col" style={{ gap: 8 }}>
              {workspaces.map((w) => (
                <div key={w.id} className="row spread" style={{ padding: "9px 11px", borderRadius: 11, background: w.id === workspace?.id ? "rgba(124,92,255,.13)" : "rgba(255,255,255,.025)" }}>
                  <div className="row" style={{ gap: 9 }}>
                    <span className="ws-swatch" style={{ width: 20, height: 20, borderRadius: 6, background: w.color }}>{(w.name || "?")[0]}</span>
                    <div className="col" style={{ gap: 0 }}>
                      <b style={{ fontSize: 13 }}>{w.name}</b>
                      <span className="tiny dim">{w.documents} docs{w.channels?.length ? ` · ${w.channels.join(", ")}` : ""}</span>
                    </div>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    {w.is_owner ? <span className="chip tiny">owner</span> : <span className="chip tiny">member</span>}
                    {w.id !== workspace?.id ? <button className="btn btn-quiet btn-xs" onClick={() => chooseWorkspace(w.id)}>Switch</button> : null}
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm btn-block" onClick={() => setCreating(true)}><Icon name="plus" size={14} />New workspace</button>
          </section>

          <section className="card" style={{ display: "grid", gap: 10 }}>
            <h3 style={{ fontSize: 16 }}>Account</h3>
            <div className="col" style={{ gap: 3 }}>
              <span className="tiny dim">{user?.email}</span>
              <b style={{ fontSize: 14 }}>{user?.name}</b>
              <span className="tiny dim">{user?.role} · {user?.company}</span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => { signOut(); window.location.href = "/"; }}><Icon name="logout" size={14} />Sign out</button>
          </section>

          <section className="card" style={{ display: "grid", gap: 10 }}>
            <h3 style={{ fontSize: 16 }}>Sandbox data</h3>
            <p className="small muted">
              This preview runs on a local JSON store with a deterministic content engine — no external AI calls and no
              keys. Wipe it to get the factory demo workspace back: 2 workspaces, 16 documents, 173 usage events.
            </p>
            <button className="btn btn-quiet btn-sm" onClick={() => setConfirmReset(true)}><Icon name="refresh" size={14} />Reset demo data</button>
          </section>
        </div>
      </div>

      {creating ? (
        <Modal title="New workspace" onClose={() => setCreating(false)} footer={<>
          <button className="btn btn-quiet" onClick={() => setCreating(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={createWorkspace} disabled={busy || !newWs.name.trim()}>Create</button>
        </>}>
          <div className="col" style={{ gap: 14 }}>
            <label className="field"><span className="label">Name</span>
              <input className="input" autoFocus value={newWs.name} onChange={(e) => setNewWs({ ...newWs, name: e.target.value })} placeholder="Client: Halcyon Labs" /></label>
            <div className="grid-2" style={{ gap: 12 }}>
              <label className="field"><span className="label">Default tone</span>
                <select className="select" value={newWs.tone} onChange={(e) => setNewWs({ ...newWs, tone: e.target.value })}>
                  {["professional", "casual", "bold", "friendly", "witty", "urgent"].map((t) => <option key={t}>{t}</option>)}
                </select></label>
              <label className="field"><span className="label">Audience</span>
                <input className="input" value={newWs.audience} onChange={(e) => setNewWs({ ...newWs, audience: e.target.value })} placeholder="founders" /></label>
            </div>
          </div>
        </Modal>
      ) : null}

      {confirmReset ? (
        <Modal title="Reset the demo workspace?" onClose={() => setConfirmReset(false)} footer={<>
          <button className="btn btn-quiet" onClick={() => setConfirmReset(false)}>Cancel</button>
          <button className="btn btn-danger" onClick={async () => {
            setBusy(true);
            try {
              await api.resetDemo();
              tokens.clear();
              const next = await api.demoLogin();
              tokens.set(next.token);
              await refresh();
              setConfirmReset(false); toast("Sandbox restored to its factory state", "ok");
            } catch (e) { toast(e.message, "err"); } finally { setBusy(false); }
          }}>Wipe and reseed</button>
        </>}>
          <p className="small muted">Every document, prompt, workspace and usage event in this preview is deleted and replaced
          with the seeded demo data. Nothing leaves your machine either way — this store is a local JSON file.</p>
        </Modal>
      ) : null}

      {confirmDelete ? (
        <Modal title="Delete this workspace?" onClose={() => setConfirmDelete(false)} footer={<>
          <button className="btn btn-quiet" onClick={() => setConfirmDelete(false)}>Keep it</button>
          <button className="btn btn-danger" onClick={async () => {
            try { await api.deleteWorkspace(workspace.id); await refresh(); setConfirmDelete(false); toast("Workspace deleted", "ok"); }
            catch (e) { toast(e.message, "err"); }
          }}>Delete workspace</button>
        </>}>
          <p className="small muted">This removes {nf(workspace?.documents || 0)} documents and their history in {workspace?.name}. Other workspaces are untouched.</p>
        </Modal>
      ) : null}
    </>
  );
}
