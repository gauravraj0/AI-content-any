import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, tokens } from "./api";

// Global studio state: session, active workspace, product config.
const Ctx = createContext(null);
export const useStudio = () => useContext(Ctx);

const WS_KEY = "nebula.workspace";

export function StudioProvider({ children }) {
  const [user, setUser] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState(() => {
    try { return localStorage.getItem(WS_KEY) || ""; } catch { return ""; }
  });
  const [meta, setMeta] = useState(null);
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(true);

  const refresh = useCallback(async () => {
    const [me] = await Promise.all([api.me()]);
    setUser(me.user);
    setWorkspaces(me.workspaces || []);
    setWorkspaceId((cur) => {
      const list = me.workspaces || [];
      if (cur && list.some((w) => w.id === cur)) return cur;
      const next = list[0]?.id || "";
      try { localStorage.setItem(WS_KEY, next); } catch { /* noop */ }
      return next;
    });
    return me;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const m = await api.meta();
        if (!alive) return;
        setMeta(m);
        if (tokens.get()) {
          try { await refresh(); } catch { tokens.clear(); }
        }
      } catch {
        /* backend offline - the UI still renders in demo/empty state */
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => { alive = false; };
  }, [refresh]);

  /** mode: "signup" registers a new account, anything else signs in (or uses the demo). */
  const signIn = useCallback(async (payload, mode = "signin") => {
    const res = mode === "signup" ? await api.register(payload)
      : payload?.demo ? await api.demoLogin()
      : await api.login(payload.email, payload.password);
    tokens.set(res.token);
    await refresh();
    return res;
  }, [refresh]);

  const signOut = useCallback(() => {
    tokens.clear();
    setUser(null);
    setWorkspaces([]);
  }, []);

  const chooseWorkspace = useCallback((id) => {
    setWorkspaceId(id);
    try { localStorage.setItem(WS_KEY, id); } catch { /* noop */ }
  }, []);

  const credits = user?.credits || { used: 0, quota: 0, remaining: 0, pct: 0 };
  const workspace = useMemo(() => workspaces.find((w) => w.id === workspaceId) || workspaces[0] || null, [workspaces, workspaceId]);

  const value = {
    user, setUser, credits, refresh, signIn, signOut, signedIn: !!user,
    meta, kinds: meta?.kinds || [], tones: meta?.tones || ["professional", "casual", "bold"],
    lengths: meta?.lengths || [], formats: meta?.formats || [], platforms: meta?.platforms || [],
    imageStyles: meta?.image_styles || ["aurora"], imageRatios: meta?.image_ratios || ["1:1"],
    plans: meta?.plans || [],
    workspaces, workspace, workspaceId, chooseWorkspace, setWorkspaces,
    busy, setBusy, booting,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCredits() {
  const { refresh } = useStudio();
  return refresh;
}
