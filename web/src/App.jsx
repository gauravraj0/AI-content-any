import { Navigate, Route, Routes } from "react-router-dom";
import Landing from "./pages/Landing";
import Pricing from "./pages/Pricing";
import Features from "./pages/Features";
import Auth from "./pages/Auth";
import AppShell from "./pages/app/Shell";
import Dashboard from "./pages/app/Dashboard";
import Studio from "./pages/app/Studio";
import Documents from "./pages/app/Documents";
import DocumentView from "./pages/app/DocumentView";
import Templates from "./pages/app/Templates";
import Prompts from "./pages/app/Prompts";
import Analytics from "./pages/app/Analytics";
import Billing from "./pages/app/Billing";
import Settings from "./pages/app/Settings";
import { useStudio } from "./lib/store";

function RequireAuth({ children }) {
  const { signedIn, booting } = useStudio();
  if (booting) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", gap: 12 }} className="col">
        <div className="logo"><span className="logo-mark"><Icon /></span>Nebula Studio</div>
        <span className="tiny dim">Loading your workspace…</span>
      </div>
    );
  }
  if (!signedIn) return <Navigate to="/signin" replace state={{ from: "/app" }} />;
  return children;
}

function Icon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="#06070d" aria-hidden="true">
      <path d="M12 3.2c1 5.2 3.6 8 8.8 8.8-5.2 1-7.8 3.6-8.8 8.8-1-5.2-3.6-8-8.8-8.8 5.2-.8 7.8-3.6 8.8-8.8Z" />
    </svg>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/features" element={<Features />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/signin" element={<Auth />} />
      <Route path="/signup" element={<Auth mode="signup" />} />
      <Route path="/analyzer" element={<Landing focus="analyzer" />} />
      <Route path="/app/*" element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="create" element={<Studio />} />
        <Route path="create/:kind" element={<Studio />} />
        <Route path="documents" element={<Documents />} />
        <Route path="documents/:id" element={<DocumentView />} />
        <Route path="templates" element={<Templates />} />
        <Route path="prompts" element={<Prompts />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="billing" element={<Billing />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
