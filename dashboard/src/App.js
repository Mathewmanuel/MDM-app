import { useState, useEffect, useRef } from "react";
import { QRCodeSVG as QRCode } from "qrcode.react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix Leaflet default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const API = "https://mdm-app-production.up.railway.app";

const fetchJSON = async (url, options = {}) => {
  const token = localStorage.getItem("jwt_token");
  const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) { localStorage.removeItem("jwt_token"); window.location.reload(); }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const REQUIRED_FIELDS = ["model", "manufacturer", "osVersion", "sdkVersion", "uuid"];
const OPTIONAL_FIELDS = ["serialNumber", "imei"];

function getMissingFields(info) {
  if (!info) return [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];
  const missing = [];
  [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS].forEach(f => {
    const v = info[f];
    if (!v || v === "RESTRICTED" || v === "Restricted" || v === "") missing.push(f);
  });
  return missing;
}

function getHealthStatus(device, deviceInfoMap, appInventoryMap) {
  const info = deviceInfoMap[device.deviceId];
  const apps = appInventoryMap[device.deviceId];
  const missing = getMissingFields(info);
  const requiredMissing = missing.filter(f => REQUIRED_FIELDS.includes(f));
  if (!info) return "critical";
  if (requiredMissing.length > 0) return "warning";
  if (!apps || apps.length === 0) return "warning";
  if (missing.length > 0) return "info";
  return "healthy";
}

const HEALTH_COLORS = {
  healthy: { bg: "rgba(34,197,94,0.08)", text: "#4ade80", dot: "#22c55e", border: "rgba(34,197,94,0.2)", label: "Healthy" },
  warning: { bg: "rgba(234,179,8,0.08)", text: "#facc15", dot: "#eab308", border: "rgba(234,179,8,0.2)", label: "Warning" },
  critical: { bg: "rgba(239,68,68,0.08)", text: "#f87171", dot: "#ef4444", border: "rgba(239,68,68,0.2)", label: "Critical" },
  info: { bg: "rgba(59,130,246,0.08)", text: "#60a5fa", dot: "#3b82f6", border: "rgba(59,130,246,0.2)", label: "Missing Data" },
};

const QR_PAYLOAD = JSON.stringify({
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.mdm.agent/.DeviceAdminReceiver",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": "https://mdm-app-production.up.railway.app/mdm.apk",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": "dcdf18f66de2a936306e68ce2fdcde36e3d951f846f68c8b64644f6c5d3c7283",
  "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": true,
  "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": { "server_url": "https://mdm-app-production.up.railway.app" }
});

// ─── THEME ────────────────────────────────────────────────────────
const DARK = {
  bg: "#060b14", sidebar: "#070d1a", card: "#0a1020", border: "#0f1a2e",
  text: "#e2e8f0", subtext: "#64748b", muted: "#374151", accent: "#3b82f6",
  inputBg: "#04080f", navBorder: "#0d1424",
};
const LIGHT = {
  bg: "#f1f5f9", sidebar: "#ffffff", card: "#ffffff", border: "#e2e8f0",
  text: "#0f172a", subtext: "#64748b", muted: "#94a3b8", accent: "#2563eb",
  inputBg: "#f8fafc", navBorder: "#e2e8f0",
};

// ─── LOGIN PAGE ───────────────────────────────────────────────────
function LoginPage({ onLogin, theme }) {
  const t = theme === "dark" ? DARK : LIGHT;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem("jwt_token", data.token);
        onLogin();
      } else {
        setError(data.message || "Invalid credentials");
      }
    } catch (e) {
      setError("Unable to reach server");
    }
    setLoading(false);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: t.bg, fontFamily: "'DM Sans',-apple-system,sans-serif" }}>
      <div role="main" aria-label="Login" style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 20, padding: "40px 36px", width: "100%", maxWidth: 400, boxShadow: "0 24px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#0f1f3d", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="2" y="3" width="9" height="9" rx="2.5" fill="#3b82f6" />
              <rect x="13" y="3" width="9" height="9" rx="2.5" fill="#60a5fa" opacity="0.7" />
              <rect x="2" y="14" width="9" height="9" rx="2.5" fill="#60a5fa" opacity="0.7" />
              <rect x="13" y="14" width="9" height="9" rx="2.5" fill="#1d4ed8" opacity="0.8" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: t.text, letterSpacing: -0.4 }}>DevPulse Console</div>
            <div style={{ fontSize: 11, color: t.subtext, fontWeight: 600 }}>Enterprise MDM v2.0</div>
          </div>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.text, margin: "0 0 6px", letterSpacing: -0.5 }}>Admin Login</h1>
        <p style={{ fontSize: 13, color: t.subtext, margin: "0 0 28px", fontWeight: 500 }}>Sign in to access the dashboard</p>

        {error && (
          <div role="alert" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 18, fontSize: 13, color: "#f87171", fontWeight: 600 }}>
            {error}
          </div>
        )}

        <label htmlFor="username" style={{ fontSize: 12, fontWeight: 700, color: t.subtext, display: "block", marginBottom: 6 }}>Username</label>
        <input
          id="username"
          type="text"
          aria-label="Username"
          autoComplete="username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleLogin()}
          style={{ width: "100%", background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 10, padding: "11px 14px", color: t.text, fontSize: 14, fontFamily: "inherit", fontWeight: 600, marginBottom: 14, boxSizing: "border-box" }}
        />

        <label htmlFor="password" style={{ fontSize: 12, fontWeight: 700, color: t.subtext, display: "block", marginBottom: 6 }}>Password</label>
        <input
          id="password"
          type="password"
          aria-label="Password"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleLogin()}
          style={{ width: "100%", background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 10, padding: "11px 14px", color: t.text, fontSize: 14, fontFamily: "inherit", fontWeight: 600, marginBottom: 22, boxSizing: "border-box" }}
        />

        <button
          onClick={handleLogin}
          disabled={loading}
          aria-busy={loading}
          style={{ width: "100%", padding: "12px", background: "#1d4ed8", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1 }}
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </div>
    </div>
  );
}

// ─── DEVICE MAP ───────────────────────────────────────────────────
function DeviceMap({ latitude, longitude, deviceName }) {
  if (!latitude || !longitude) return null;
  return (
    <div style={{ borderRadius: 14, overflow: "hidden", marginTop: 14, border: "1px solid #0f1a2e" }}>
      <MapContainer
        center={[latitude, longitude]}
        zoom={14}
        style={{ height: 240, width: "100%" }}
        aria-label={`Map showing location of ${deviceName}`}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />
        <Marker position={[latitude, longitude]}>
          <Popup>{deviceName}</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem("jwt_token"));
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");
  const [view, setView] = useState("dashboard");
  const [devices, setDevices] = useState([]);
  const [deviceInfoMap, setDeviceInfoMap] = useState({});
  const [appInventoryMap, setAppInventoryMap] = useState({});
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [generatedToken, setGeneratedToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [error, setError] = useState(null);
  const [appSearch, setAppSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [healthFilter, setHealthFilter] = useState("all");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const t = theme === "dark" ? DARK : LIGHT;

  useEffect(() => { if (loggedIn) loadAll(); }, [loggedIn]);
  useEffect(() => { localStorage.setItem("theme", theme); }, [theme]);

  if (!loggedIn) return <LoginPage onLogin={() => setLoggedIn(true)} theme={theme} />;

  const loadAll = async () => {
    setLoading(true); setError(null);
    try {
      const devs = await fetchJSON(`${API}/devices`);
      setDevices(devs);
      const infoResults = await Promise.allSettled(devs.map(d => fetchJSON(`${API}/device-info/${d.deviceId}`)));
      const appResults = await Promise.allSettled(devs.map(d => fetchJSON(`${API}/app-inventory/${d.deviceId}`)));
      const infoMap = {}, appMap = {};
      devs.forEach((d, i) => {
        infoMap[d.deviceId] = infoResults[i].status === "fulfilled" ? (infoResults[i].value[0] || null) : null;
        appMap[d.deviceId] = appResults[i].status === "fulfilled" ? appResults[i].value : [];
      });
      setDeviceInfoMap(infoMap);
      setAppInventoryMap(appMap);
    } catch (e) { setError("Unable to reach backend."); }
    setLoading(false);
  };

  const loadDeviceDetails = async (device) => {
    setSelectedDevice(device);
    setView("detail");
    setDetailLoading(true);
    try {
      const [info, apps] = await Promise.all([
        fetchJSON(`${API}/device-info/${device.deviceId}`),
        fetchJSON(`${API}/app-inventory/${device.deviceId}`)
      ]);
      setDeviceInfoMap(prev => ({ ...prev, [device.deviceId]: info[0] || null }));
      setAppInventoryMap(prev => ({ ...prev, [device.deviceId]: apps }));
    } catch (e) { setError("Failed to load device details"); }
    setDetailLoading(false);
  };

  const syncAllDevices = async () => {
    setSyncing(true); setSyncDone(false);
    await loadAll();
    setSyncing(false); setSyncDone(true);
    setTimeout(() => setSyncDone(false), 3000);
  };

  const generateToken = async () => {
    setLoading(true);
    try {
      const data = await fetchJSON(`${API}/generate-token`, { method: "POST" });
      setGeneratedToken(data.token);
    } catch (e) { setError("Failed to generate token"); }
    setLoading(false);
  };

  const copyToken = () => {
    navigator.clipboard.writeText(generatedToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const logout = () => {
    localStorage.removeItem("jwt_token");
    setLoggedIn(false);
  };

  const deviceInfo = selectedDevice ? deviceInfoMap[selectedDevice.deviceId] : null;
  const appInventory = selectedDevice ? (appInventoryMap[selectedDevice.deviceId] || []) : [];
  const filteredApps = appInventory.filter(a =>
    a.appName?.toLowerCase().includes(appSearch.toLowerCase()) ||
    a.packageName?.toLowerCase().includes(appSearch.toLowerCase())
  );
  const systemApps = filteredApps.filter(a => a.systemApp);
  const userApps = filteredApps.filter(a => !a.systemApp);
  const missingFields = selectedDevice ? getMissingFields(deviceInfo) : [];

  const healthCounts = { healthy: 0, warning: 0, critical: 0, info: 0 };
  devices.forEach(d => { healthCounts[getHealthStatus(d, deviceInfoMap, appInventoryMap)]++; });

  const filteredDevices = devices.filter(d => {
    if (healthFilter === "all") return true;
    return getHealthStatus(d, deviceInfoMap, appInventoryMap) === healthFilter;
  });

  const totalApps = Object.values(appInventoryMap).reduce((sum, apps) => sum + (apps?.length || 0), 0);
  const complianceRate = devices.length > 0 ? Math.round((healthCounts.healthy / devices.length) * 100) : 0;

  return (
    <div style={{ display: "flex", height: "100vh", background: t.bg, color: t.text, fontFamily: "'DM Sans',-apple-system,'Segoe UI',sans-serif", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e2d45; border-radius: 4px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        .nav-item:hover { background: rgba(30,58,138,0.3) !important; color: #93c5fd !important; }
        .device-card { transition: all 0.2s ease; cursor: pointer; }
        .device-card:hover { border-color: #1d4ed8 !important; transform: translateY(-3px); box-shadow: 0 12px 40px rgba(0,0,0,0.3) !important; }
        .app-row:hover { background: rgba(30,42,70,0.5) !important; }
        .health-row:hover { background: rgba(15,31,61,0.5) !important; cursor: pointer; }
        .stat-card { transition: all 0.2s ease; }
        .stat-card:hover { transform: translateY(-2px); }
        .btn-primary:hover { background: #2563eb !important; }
        .btn-sync:hover { background: #1e3a8a !important; }
        .fade-in { animation: fadeIn 0.3s ease forwards; }
        button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px solid #3b82f6 !important; outline-offset: 2px; }
        input:focus { outline: none; border-color: #2563eb !important; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        .grid-bg {
          background-image: linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
          background-size: 40px 40px;
        }
      `}</style>

      {/* SIDEBAR */}
      <aside aria-label="Sidebar navigation" style={{ background: t.sidebar, borderRight: `1px solid ${t.navBorder}`, display: "flex", flexDirection: "column", flexShrink: 0, transition: "width 0.2s ease", width: sidebarCollapsed ? 64 : 240 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 14px", borderBottom: `1px solid ${t.navBorder}`, minHeight: 64 }}>
          <div style={{ width: 36, height: 36, background: "#0f1f3d", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="2" y="3" width="9" height="9" rx="2.5" fill="#3b82f6" />
              <rect x="13" y="3" width="9" height="9" rx="2.5" fill="#60a5fa" opacity="0.7" />
              <rect x="2" y="14" width="9" height="9" rx="2.5" fill="#60a5fa" opacity="0.7" />
              <rect x="13" y="14" width="9" height="9" rx="2.5" fill="#1d4ed8" opacity="0.8" />
            </svg>
          </div>
          {!sidebarCollapsed && (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: t.text, letterSpacing: -0.3 }}>DevPulse Console</div>
              <div style={{ fontSize: 9, color: t.subtext, letterSpacing: 1, fontWeight: 700, marginTop: 2 }}>Enterprise v2.0</div>
            </div>
          )}
          <button aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} style={{ width: 24, height: 24, borderRadius: 6, background: "transparent", border: `1px solid ${t.navBorder}`, color: t.subtext, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: "auto" }}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              {sidebarCollapsed ? <path d="M8 5l8 7-8 7" /> : <path d="M16 5l-8 7 8 7" />}
            </svg>
          </button>
        </div>

        <nav aria-label="Main navigation" style={{ padding: "16px 10px 0", flex: 1 }}>
          {!sidebarCollapsed && <div style={{ fontSize: 9, color: t.subtext, letterSpacing: 2, padding: "0 8px 10px", fontWeight: 800, textTransform: "uppercase" }}>Navigation</div>}
          <SideNavItem icon={<DashIcon />} label="Dashboard" active={view === "dashboard"} collapsed={sidebarCollapsed} onClick={() => { setView("dashboard"); setSelectedDevice(null); }} />
          <SideNavItem icon={<PhoneIcon />} label="Devices" active={view === "devices" || view === "detail"} collapsed={sidebarCollapsed} onClick={() => { setView("devices"); setSelectedDevice(null); }} />
          <SideNavItem icon={<KeyIcon />} label="Enrollment" active={view === "token"} collapsed={sidebarCollapsed} onClick={() => setView("token")} />
          <SideNavItem icon={<QrIcon />} label="QR Provision" active={view === "qr"} collapsed={sidebarCollapsed} onClick={() => setView("qr")} />
          <SideNavItem icon={<ShieldIcon />} label="Health Check" active={view === "health"} collapsed={sidebarCollapsed} onClick={() => setView("health")}
            badge={healthCounts.critical + healthCounts.warning > 0 ? healthCounts.critical + healthCounts.warning : null} />
        </nav>

        <div style={{ padding: 14, borderTop: `1px solid ${t.navBorder}`, display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Theme Toggle */}
          <button
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: `1px solid ${t.navBorder}`, borderRadius: 8, padding: sidebarCollapsed ? "8px 0" : "8px 10px", cursor: "pointer", color: t.subtext, fontFamily: "inherit", fontSize: 12, fontWeight: 700, justifyContent: sidebarCollapsed ? "center" : "flex-start", width: "100%" }}
          >
            {theme === "dark" ? "☀️" : "🌙"}
            {!sidebarCollapsed && <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
          </button>

          {/* Logout */}
          <button
            aria-label="Logout"
            onClick={logout}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: `1px solid ${t.navBorder}`, borderRadius: 8, padding: sidebarCollapsed ? "8px 0" : "8px 10px", cursor: "pointer", color: "#f87171", fontFamily: "inherit", fontSize: 12, fontWeight: 700, justifyContent: sidebarCollapsed ? "center" : "flex-start", width: "100%" }}
          >
            🚪 {!sidebarCollapsed && "Logout"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 8, background: t.inputBg, borderRadius: 8, padding: sidebarCollapsed ? "8px 0" : "8px 10px", border: `1px solid ${t.navBorder}`, justifyContent: sidebarCollapsed ? "center" : "flex-start" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e", flexShrink: 0 }} aria-hidden="true" />
            {!sidebarCollapsed && <span style={{ fontSize: 11, color: t.subtext, fontWeight: 700 }}>Backend Online</span>}
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* TOP BAR */}
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: 56, background: t.sidebar, borderBottom: `1px solid ${t.navBorder}`, flexShrink: 0 }}>
          <nav aria-label="Breadcrumb">
            <ol style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, listStyle: "none", margin: 0, padding: 0 }}>
              <li>
                <button style={{ display: "flex", alignItems: "center", cursor: "pointer", color: t.accent, background: "none", border: "none", fontFamily: "inherit", fontSize: 13, fontWeight: 600 }}
                  onClick={() => { setView("dashboard"); setSelectedDevice(null); }} aria-label="Go to dashboard">
                  <HomeIcon /> Home
                </button>
              </li>
              {view !== "dashboard" && <>
                <li aria-hidden="true" style={{ color: t.border, fontSize: 16 }}>›</li>
                <li aria-current="page" style={{ color: t.subtext }}>
                  {view === "devices" ? "Devices" : view === "detail" && selectedDevice ? selectedDevice.deviceId.slice(0, 20) + "…" : view === "token" ? "Enrollment" : view === "qr" ? "QR Provision" : view === "health" ? "Health Check" : ""}
                </li>
              </>}
            </ol>
          </nav>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn-sync" aria-label="Refresh all device data" style={{ display: "flex", alignItems: "center", padding: "7px 14px", background: theme === "dark" ? "#0f1f3d" : "#e2e8f0", border: `1px solid ${t.border}`, borderRadius: 8, color: t.accent, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, transition: "all 0.15s", ...(syncDone ? { background: "#0c2518", border: "1px solid #166534", color: "#4ade80" } : {}) }}
              onClick={syncAllDevices} disabled={syncing}>
              {syncing ? <><Spinner /> Syncing…</> : syncDone ? <><CheckIcon /> Synced</> : <><SyncIcon /> Refresh</>}
            </button>
            {view === "token" && <button className="btn-primary" aria-label="Generate new enrollment token" style={{ padding: "7px 14px", background: "#1d4ed8", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700 }} onClick={generateToken}>+ New Token</button>}
          </div>
        </header>

        <main id="main-content" tabIndex={-1} style={{ flex: 1, overflowY: "auto", padding: "24px 28px", background: t.bg }} className="grid-bg">
          {error && (
            <div role="alert" aria-live="assertive" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "10px 16px", marginBottom: 20, fontSize: 13, color: "#fca5a5", fontWeight: 600 }} className="fade-in">
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}><AlertIcon /> {error}</span>
              <button aria-label="Dismiss error" style={{ background: "none", border: "none", color: "#fca5a5", cursor: "pointer", fontSize: 16 }} onClick={() => setError(null)}>✕</button>
            </div>
          )}

          {/* DASHBOARD VIEW */}
          {view === "dashboard" && (
            <div className="fade-in">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: t.text, letterSpacing: -0.8 }}>Command Center</h1>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: t.muted, fontWeight: 600 }}>Real-time overview of your device fleet</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: 700, color: "#4ade80" }} aria-label="System status: Live">
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e", animation: "pulse 2s infinite" }} aria-hidden="true" />
                  Live
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
                <StatCard icon={<PhoneIcon />} label="Total Devices" value={devices.length} color="#3b82f6" sub="enrolled" loading={loading} t={t} />
                <StatCard icon={<CheckCircleIcon />} label="Compliance Rate" value={`${complianceRate}%`} color="#22c55e" sub="devices healthy" loading={loading} t={t} />
                <StatCard icon={<AppIcon />} label="Apps Tracked" value={totalApps.toLocaleString()} color="#a78bfa" sub="across all devices" loading={loading} t={t} />
                <StatCard icon={<AlertIcon />} label="Issues" value={healthCounts.critical + healthCounts.warning} color="#f87171" sub={`${healthCounts.critical} critical`} loading={loading} t={t} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 16, padding: 22 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: t.text }}>Fleet Health</span>
                    <span style={{ fontSize: 11, color: t.subtext, fontWeight: 600 }}>{devices.length} total devices</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {Object.entries(HEALTH_COLORS).map(([key, hc]) => {
                      const count = healthCounts[key];
                      const pct = devices.length > 0 ? (count / devices.length) * 100 : 0;
                      return (
                        <div key={key}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 8, height: 8, borderRadius: "50%", background: hc.dot, boxShadow: `0 0 6px ${hc.dot}` }} aria-hidden="true" />
                              <span style={{ fontSize: 12, fontWeight: 600, color: t.subtext }}>{hc.label}</span>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: hc.text }}>{count}</span>
                          </div>
                          <div style={{ height: 4, background: t.border, borderRadius: 4, overflow: "hidden" }} role="progressbar" aria-valuenow={count} aria-valuemax={devices.length} aria-label={`${hc.label}: ${count} devices`}>
                            <div style={{ height: "100%", width: `${pct}%`, background: hc.dot, borderRadius: 4, transition: "width 0.6s ease" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 16, padding: 22 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: t.text }}>Recent Enrollments</span>
                    <button style={{ fontSize: 12, color: t.accent, fontWeight: 700, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }} onClick={() => setView("devices")} aria-label="View all devices">View All →</button>
                  </div>
                  {loading ? <MiniLoader /> : devices.length === 0 ? (
                    <div style={{ padding: "32px 0", textAlign: "center" }}>
                      <div style={{ color: t.border, marginBottom: 10, display: "flex", justifyContent: "center" }}><PhoneIcon /></div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: t.subtext, marginBottom: 6 }}>No devices yet</div>
                      <div style={{ fontSize: 12, color: t.muted, fontWeight: 600 }}>Enroll your first device to get started</div>
                    </div>
                  ) : (
                    <div>
                      {devices.slice(0, 5).map(d => {
                        const health = getHealthStatus(d, deviceInfoMap, appInventoryMap);
                        const hc = HEALTH_COLORS[health];
                        const info = deviceInfoMap[d.deviceId];
                        return (
                          <div key={d.id} className="health-row" role="button" tabIndex={0} aria-label={`View details for device ${d.deviceId}`}
                            style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", borderBottom: `1px solid ${t.border}`, borderRadius: 6 }}
                            onClick={() => loadDeviceDetails(d)} onKeyDown={e => e.key === "Enter" && loadDeviceDetails(d)}>
                            <div style={{ width: 34, height: 34, borderRadius: 9, background: t.card, border: `1px solid ${hc.dot}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: t.accent, flexShrink: 0 }}>
                              {d.deviceId.slice(0, 2).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{info ? `${info.manufacturer} ${info.model}` : d.deviceId.slice(0, 22) + "…"}</div>
                              <div style={{ fontSize: 10, color: t.muted, fontWeight: 600, marginTop: 2 }}>{new Date(d.enrolledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, fontSize: 10, fontWeight: 700, border: "1px solid", background: hc.bg, color: hc.text, borderColor: hc.border, flexShrink: 0 }}>
                              <div style={{ width: 5, height: 5, borderRadius: "50%", background: hc.dot }} aria-hidden="true" />
                              {hc.label}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 16, padding: 22 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: t.text, marginBottom: 16 }}>Quick Actions</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
                  <QuickAction icon={<KeyIcon />} title="Generate Token" desc="Create enrollment token for a new device" onClick={() => setView("token")} color="#3b82f6" t={t} />
                  <QuickAction icon={<QrIcon />} title="QR Provisioning" desc="Provision device as Device Owner via QR" onClick={() => setView("qr")} color="#a78bfa" t={t} />
                  <QuickAction icon={<ShieldIcon />} title="Health Report" desc="Review fleet health and missing data" onClick={() => setView("health")} color={healthCounts.critical > 0 ? "#ef4444" : "#22c55e"} t={t} />
                  <QuickAction icon={<SyncIcon2 />} title="Sync All" desc="Force refresh all device data now" onClick={syncAllDevices} color="#f59e0b" t={t} />
                </div>
              </div>
            </div>
          )}

          {/* DEVICES VIEW */}
          {view === "devices" && (
            <div className="fade-in">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: t.text, letterSpacing: -0.8 }}>Devices</h1>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: t.muted, fontWeight: 600 }}>{devices.length} enrolled · {healthCounts.critical} critical · {healthCounts.warning} warnings</p>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }} role="group" aria-label="Filter devices by health status">
                {[
                  { id: "all", label: "All", count: devices.length },
                  { id: "healthy", label: "Healthy", count: healthCounts.healthy, color: "#22c55e" },
                  { id: "warning", label: "Warning", count: healthCounts.warning, color: "#eab308" },
                  { id: "critical", label: "Critical", count: healthCounts.critical, color: "#ef4444" },
                  { id: "info", label: "Missing Data", count: healthCounts.info, color: "#3b82f6" },
                ].map(f => (
                  <button key={f.id} aria-pressed={healthFilter === f.id} aria-label={`Filter: ${f.label} (${f.count})`}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: healthFilter === f.id ? "rgba(30,58,138,0.2)" : t.card, border: `1px solid ${healthFilter === f.id ? (f.color || "#3b82f6") + "66" : t.border}`, borderRadius: 20, color: healthFilter === f.id ? (f.color || "#93c5fd") : t.subtext, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700 }}
                    onClick={() => setHealthFilter(f.id)}>
                    {f.color && healthFilter === f.id && <div style={{ width: 6, height: 6, borderRadius: "50%", background: f.color }} aria-hidden="true" />}
                    {f.label}
                    <span style={{ background: healthFilter === f.id ? (f.color || "#3b82f6") + "22" : t.border, borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700, color: healthFilter === f.id ? (f.color || "#60a5fa") : t.subtext }}>{f.count}</span>
                  </button>
                ))}
              </div>

              {loading ? <Loader /> : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 14 }} role="list" aria-label="Device list">
                  {filteredDevices.map(d => {
                    const health = getHealthStatus(d, deviceInfoMap, appInventoryMap);
                    const hc = HEALTH_COLORS[health];
                    const info = deviceInfoMap[d.deviceId];
                    const missing = getMissingFields(info);
                    return (
                      <div key={d.id} role="listitem" className="device-card" tabIndex={0} aria-label={`Device ${info ? `${info.manufacturer} ${info.model}` : d.deviceId}, status: ${hc.label}. Click to view details.`}
                        style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 16, padding: 20 }}
                        onClick={() => loadDeviceDetails(d)} onKeyDown={e => e.key === "Enter" && loadDeviceDetails(d)}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                          <div style={{ width: 44, height: 44, borderRadius: 12, background: t.inputBg, border: `1px solid ${hc.dot}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: t.accent, boxShadow: `0 0 16px ${hc.dot}22` }}>
                            {d.deviceId.slice(0, 2).toUpperCase()}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: hc.bg, color: hc.text, border: `1px solid ${hc.border}` }}>
                            <div style={{ width: 5, height: 5, borderRadius: "50%", background: hc.dot, boxShadow: `0 0 4px ${hc.dot}` }} aria-hidden="true" />
                            {hc.label}
                          </div>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 4 }}>{d.deviceId.length > 22 ? d.deviceId.slice(0, 22) + "…" : d.deviceId}</div>
                        {info && <div style={{ fontSize: 12, fontWeight: 600, color: t.accent, marginBottom: 12 }}>{info.manufacturer} {info.model}</div>}
                        <div style={{ height: 1, background: t.border, marginBottom: 12 }} />
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                          <span style={{ fontSize: 11, color: t.muted, fontWeight: 600 }}>Token</span>
                          <span style={{ fontSize: 11, color: t.subtext, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace" }}>{d.enrollmentToken.slice(0, 12)}…</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                          <span style={{ fontSize: 11, color: t.muted, fontWeight: 600 }}>Enrolled</span>
                          <span style={{ fontSize: 11, color: t.subtext, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace" }}>{new Date(d.enrolledAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                        </div>
                        {missing.length > 0 && (
                          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, marginBottom: 6 }}>
                            <span style={{ color: "#f59e0b", fontSize: 10 }} aria-hidden="true">⚠</span>
                            <span style={{ fontSize: 11, color: "#78350f", fontWeight: 600 }}>{missing.slice(0, 2).join(", ")}{missing.length > 2 ? ` +${missing.length - 2} more` : ""} missing</span>
                          </div>
                        )}
                        <div style={{ display: "flex", alignItems: "center", marginTop: 12, fontSize: 12, color: "#2563eb", fontWeight: 700 }}>View Details <ArrowIcon /></div>
                      </div>
                    );
                  })}
                  {filteredDevices.length === 0 && (
                    <div style={{ gridColumn: "1/-1", padding: 60, textAlign: "center" }}>
                      <div style={{ color: t.border, marginBottom: 10, display: "flex", justifyContent: "center" }}><PhoneIcon /></div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: t.subtext }}>No devices in this category</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* DETAIL VIEW */}
          {view === "detail" && selectedDevice && (
            <div className="fade-in">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <button aria-label="Back to devices" style={{ width: 36, height: 36, borderRadius: 10, background: t.inputBg, border: `1px solid ${t.border}`, color: t.accent, cursor: "pointer", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 800 }}
                    onClick={() => { setView("devices"); setSelectedDevice(null); }}>‹</button>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: t.inputBg, border: `1px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 800, color: t.accent }}>
                    {selectedDevice.deviceId.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: t.text, letterSpacing: -0.8 }}>{selectedDevice.deviceId.slice(0, 28)}{selectedDevice.deviceId.length > 28 ? "…" : ""}</h1>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: t.muted, fontWeight: 600 }}>Enrolled {new Date(selectedDevice.enrolledAt).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {missingFields.length > 0 && (
                <div role="alert" style={{ background: "rgba(234,179,8,0.05)", border: "1px solid rgba(234,179,8,0.15)", borderRadius: 12, padding: "16px 20px", marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ color: "#f59e0b", fontSize: 16 }} aria-hidden="true">⚠</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: "#f59e0b" }}>Missing Device Data</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#78350f", fontWeight: 600 }}>The following fields are missing or restricted for this device:</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    {missingFields.map(f => (
                      <span key={f} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, fontWeight: 700, background: REQUIRED_FIELDS.includes(f) ? "rgba(239,68,68,0.1)" : "rgba(234,179,8,0.1)", color: REQUIRED_FIELDS.includes(f) ? "#f87171" : "#facc15", border: `1px solid ${REQUIRED_FIELDS.includes(f) ? "rgba(239,68,68,0.3)" : "rgba(234,179,8,0.3)"}` }}>
                        {f} {REQUIRED_FIELDS.includes(f) ? "(required)" : "(optional)"}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {detailLoading ? <Loader /> : (
                <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, alignItems: "start" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <InfoPanel title="Enrollment" t={t}>
                      <InfoRow label="Device ID" value={selectedDevice.deviceId} mono t={t} />
                      <InfoRow label="Token" value={selectedDevice.enrollmentToken} mono t={t} />
                      <InfoRow label="Enrolled At" value={new Date(selectedDevice.enrolledAt).toLocaleString()} t={t} />
                    </InfoPanel>

                    {deviceInfo ? (
                      <InfoPanel title="Hardware & Software" t={t}>
                        <InfoRow label="Model" value={deviceInfo.model} missing={!deviceInfo.model} t={t} />
                        <InfoRow label="Manufacturer" value={deviceInfo.manufacturer} missing={!deviceInfo.manufacturer} t={t} />
                        <InfoRow label="Android" value={deviceInfo.osVersion} missing={!deviceInfo.osVersion} t={t} />
                        <InfoRow label="SDK" value={String(deviceInfo.sdkVersion || "")} missing={!deviceInfo.sdkVersion} t={t} />
                        <InfoRow label="Serial" value={deviceInfo.serialNumber || "Restricted"} mono restricted={!deviceInfo.serialNumber || deviceInfo.serialNumber === "RESTRICTED"} t={t} />
                        <InfoRow label="UUID" value={deviceInfo.uuid} mono missing={!deviceInfo.uuid} t={t} />
                        <InfoRow label="IMEI" value={deviceInfo.imei || "Restricted"} mono restricted={!deviceInfo.imei} t={t} />
                        {(deviceInfo.latitude || deviceInfo.longitude) && (
                          <InfoRow label="Location" value={`${deviceInfo.latitude?.toFixed(5)}, ${deviceInfo.longitude?.toFixed(5)}`} mono t={t} />
                        )}
                      </InfoPanel>
                    ) : (
                      <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, padding: 28, textAlign: "center" }}>
                        <div style={{ fontSize: 28, marginBottom: 10 }} aria-hidden="true">⚠</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: t.subtext, marginBottom: 6 }}>No Device Info</div>
                        <div style={{ fontSize: 12, color: t.muted, fontWeight: 600, lineHeight: 1.5 }}>This device has not sent hardware information yet.</div>
                      </div>
                    )}

                    {/* MAP */}
                    {deviceInfo?.latitude && deviceInfo?.longitude && (
                      <InfoPanel title="Device Location" t={t}>
                        <div style={{ padding: "12px 16px" }}>
                          <DeviceMap
                            latitude={deviceInfo.latitude}
                            longitude={deviceInfo.longitude}
                            deviceName={deviceInfo ? `${deviceInfo.manufacturer} ${deviceInfo.model}` : selectedDevice.deviceId}
                          />
                        </div>
                      </InfoPanel>
                    )}
                  </div>

                  {/* APP INVENTORY — TWO SEPARATE TABLES */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, overflow: "hidden" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${t.border}`, background: t.sidebar }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: t.subtext, letterSpacing: 1.5, textTransform: "uppercase" }}>App Inventory</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: "rgba(34,197,94,0.07)", color: "#4ade80", fontWeight: 700, border: "1px solid rgba(34,197,94,0.15)" }} aria-label={`${userApps.length} user installed apps`}>{userApps.length} user</span>
                          <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: "rgba(59,130,246,0.07)", color: "#60a5fa", fontWeight: 700, border: "1px solid rgba(59,130,246,0.15)" }} aria-label={`${systemApps.length} system apps`}>{systemApps.length} system</span>
                        </div>
                      </div>

                      {appInventory.length === 0 ? (
                        <div style={{ padding: 28, textAlign: "center" }}>
                          <div style={{ fontSize: 28, marginBottom: 10 }} aria-hidden="true">📦</div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: t.subtext, marginBottom: 6 }}>No App Inventory</div>
                          <div style={{ fontSize: 12, color: t.muted, fontWeight: 600, lineHeight: 1.5 }}>This device has not synced its app list yet.</div>
                        </div>
                      ) : (
                        <>
                          <div style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}`, background: t.sidebar }}>
                            <input
                              aria-label="Search applications"
                              style={{ width: "100%", background: t.card, border: `1px solid ${t.border}`, borderRadius: 8, padding: "8px 12px", color: t.text, fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}
                              placeholder="Search applications…"
                              value={appSearch}
                              onChange={e => setAppSearch(e.target.value)}
                            />
                          </div>

                          {/* USER APPS TABLE */}
                          {userApps.length > 0 && (
                            <section aria-label="User installed apps">
                              <div style={{ fontSize: 9, color: t.subtext, letterSpacing: 2, padding: "10px 16px 4px", fontWeight: 800, background: t.sidebar, textTransform: "uppercase" }}>
                                User Installed ({userApps.length})
                              </div>
                              <div style={{ maxHeight: 300, overflowY: "auto" }} role="list">
                                {userApps.map((app, i) => <AppRow key={i} app={app} t={t} />)}
                              </div>
                            </section>
                          )}

                          {/* SYSTEM APPS TABLE */}
                          {systemApps.length > 0 && (
                            <section aria-label="System apps">
                              <div style={{ fontSize: 9, color: t.subtext, letterSpacing: 2, padding: "10px 16px 4px", fontWeight: 800, background: t.sidebar, textTransform: "uppercase", borderTop: `1px solid ${t.border}` }}>
                                System Apps ({systemApps.length})
                              </div>
                              <div style={{ maxHeight: 300, overflowY: "auto" }} role="list">
                                {systemApps.map((app, i) => <AppRow key={i} app={app} t={t} />)}
                              </div>
                            </section>
                          )}

                          {filteredApps.length === 0 && (
                            <div style={{ padding: 24, textAlign: "center", color: t.subtext, fontSize: 13, fontWeight: 600 }}>No apps match your search</div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* HEALTH VIEW */}
          {view === "health" && (
            <div className="fade-in">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: t.text, letterSpacing: -0.8 }}>Health Check</h1>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: t.muted, fontWeight: 600 }}>Missing or incomplete data across all enrolled devices</p>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
                {Object.entries(HEALTH_COLORS).map(([key, hc]) => (
                  <div key={key} className="stat-card" style={{ background: t.card, border: `1px solid ${hc.border}`, borderRadius: 14, padding: "22px 16px", textAlign: "center" }} aria-label={`${hc.label}: ${healthCounts[key]} devices`}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: hc.dot, boxShadow: `0 0 10px ${hc.dot}`, margin: "0 auto 12px" }} aria-hidden="true" />
                    <div style={{ fontSize: 36, fontWeight: 800, color: t.text, lineHeight: 1, marginBottom: 6 }}>{healthCounts[key]}</div>
                    <div style={{ fontSize: 12, color: t.subtext, fontWeight: 600 }}>{hc.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, overflow: "hidden" }}>
                <div style={{ display: "flex", padding: "11px 20px", background: t.sidebar, borderBottom: `1px solid ${t.navBorder}`, fontSize: 9, color: t.subtext, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase" }} role="row">
                  <span style={{ flex: 2 }}>Device</span>
                  <span style={{ flex: 2 }}>Status</span>
                  <span style={{ flex: 3 }}>Missing Fields</span>
                  <span style={{ flex: 1, textAlign: "right" }}>Apps</span>
                </div>
                {devices.map(d => {
                  const health = getHealthStatus(d, deviceInfoMap, appInventoryMap);
                  const hc = HEALTH_COLORS[health];
                  const info = deviceInfoMap[d.deviceId];
                  const apps = appInventoryMap[d.deviceId] || [];
                  const missing = getMissingFields(info);
                  return (
                    <div key={d.id} className="health-row" role="button" tabIndex={0} aria-label={`Device ${d.deviceId}, status ${hc.label}, ${apps.length} apps`}
                      style={{ display: "flex", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${t.border}` }}
                      onClick={() => loadDeviceDetails(d)} onKeyDown={e => e.key === "Enter" && loadDeviceDetails(d)}>
                      <div style={{ flex: 2 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{d.deviceId.slice(0, 20)}{d.deviceId.length > 20 ? "…" : ""}</div>
                        <div style={{ fontSize: 11, color: t.muted, fontWeight: 600, marginTop: 2 }}>{new Date(d.enrolledAt).toLocaleDateString()}</div>
                      </div>
                      <div style={{ flex: 2 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: hc.bg, color: hc.text, border: `1px solid ${hc.border}`, width: "fit-content" }}>
                          <div style={{ width: 5, height: 5, borderRadius: "50%", background: hc.dot }} aria-hidden="true" />
                          {hc.label}
                        </div>
                      </div>
                      <div style={{ flex: 3 }}>
                        {missing.length === 0 ? (
                          <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 700 }}>✓ Complete</span>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {missing.map(f => (
                              <span key={f} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 700, background: REQUIRED_FIELDS.includes(f) ? "rgba(239,68,68,0.1)" : "rgba(234,179,8,0.1)", color: REQUIRED_FIELDS.includes(f) ? "#f87171" : "#facc15" }}>{f}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1, textAlign: "right", fontSize: 14, fontWeight: 800, color: t.accent }}>{apps.length}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TOKEN VIEW */}
          {view === "token" && (
            <div className="fade-in">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: t.text, letterSpacing: -0.8 }}>Enrollment Tokens</h1>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: t.muted, fontWeight: 600 }}>Generate secure tokens to authorize device enrollment</p>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 560 }}>
                <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 16, padding: 28 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "#3b82f6", marginBottom: 16 }} aria-hidden="true"><KeyIcon /></div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: t.text, marginBottom: 10, letterSpacing: -0.4 }}>Generate Enrollment Token</div>
                  <div style={{ fontSize: 13, color: t.subtext, fontWeight: 500, lineHeight: 1.7, marginBottom: 22 }}>A unique token authorizes a device to enroll in your MDM. Tokens are single-use — once a device enrolls, the token is invalidated automatically.</div>
                  <button className="btn-primary" aria-label="Generate new enrollment token" style={{ padding: "11px 24px", background: "#1d4ed8", border: "none", borderRadius: 10, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700 }} onClick={generateToken}>Generate Token</button>
                </div>

                {generatedToken && (
                  <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 16, padding: 24 }} className="fade-in">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>Token Generated</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "rgba(34,197,94,0.08)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }}>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e" }} aria-hidden="true" />
                        Ready to Use
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: t.subtext, fontWeight: 600, marginBottom: 16, lineHeight: 1.5 }}>Share this token with the device user. Enter it in the MDM app during setup.</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
                      <code style={{ flex: 1, fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: "#60a5fa", fontWeight: 600, wordBreak: "break-all" }} aria-label="Enrollment token">{generatedToken}</code>
                      <button aria-label={copied ? "Token copied" : "Copy token to clipboard"} style={{ padding: "8px 16px", background: copied ? "#15803d" : "#1d4ed8", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, flexShrink: 0 }} onClick={copyToken}>
                        {copied ? "✓ Copied" : "Copy"}
                      </button>
                    </div>
                    <div style={{ fontSize: 12, color: "#f59e0b", background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 8, padding: "9px 14px", fontWeight: 600 }} role="note">⚠ Store this token securely. It grants device enrollment access and is single-use.</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* QR VIEW */}
          {view === "qr" && (
            <div className="fade-in">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: t.text, letterSpacing: -0.8 }}>QR Provisioning</h1>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: t.muted, fontWeight: 600 }}>Scan during device setup to auto-install MDM as Device Owner</p>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 860 }}>
                <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 16, padding: 28 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: t.text, marginBottom: 10, letterSpacing: -0.4 }}>Device Owner Provisioning QR</div>
                  <div style={{ fontSize: 13, color: t.subtext, fontWeight: 500, lineHeight: 1.7, marginBottom: 22 }}>
                    On a factory reset device, tap the welcome screen <strong style={{ color: "#60a5fa" }}>6 times</strong> to open the QR scanner.
                  </div>
                  <div style={{ background: "#fff", padding: 18, display: "inline-block", borderRadius: 14, marginBottom: 18 }}>
                    <QRCode value={QR_PAYLOAD} size={220} level="M" bgColor="#ffffff" fgColor="#000000" aria-label="Device Owner provisioning QR code" />
                  </div>
                  <div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600, marginBottom: 14 }}>⚠ Ensure the device has WiFi access before scanning</div>
                  <div style={{ background: t.inputBg, borderRadius: 10, padding: 14, border: `1px solid ${t.border}`, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 9, color: t.subtext, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 3 }}>APK URL</div>
                      <div style={{ fontSize: 11, color: "#60a5fa", fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, wordBreak: "break-all" }}>mdm-app-production.up.railway.app/mdm.apk</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: t.subtext, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 3 }}>Component</div>
                      <div style={{ fontSize: 11, color: "#60a5fa", fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, wordBreak: "break-all" }}>com.mdm.agent/.DeviceAdminReceiver</div>
                    </div>
                  </div>
                </div>

                <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 16, padding: 28 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: t.text, marginBottom: 20, letterSpacing: -0.3 }}>How It Works</div>
                  {[
                    ["1", "Factory reset the target Android device"],
                    ["2", "On welcome screen, tap 6 times to trigger QR mode"],
                    ["3", "Connect to WiFi when prompted by setup wizard"],
                    ["4", "Point the camera at this QR code to scan it"],
                    ["5", "Android downloads & installs MDM app automatically"],
                    ["6", "App enrolls as Device Owner and sends data to dashboard"],
                  ].map(([num, text]) => (
                    <div key={num} style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
                      <div style={{ width: 26, height: 26, borderRadius: "50%", background: t.inputBg, border: `1px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: t.accent, flexShrink: 0 }} aria-hidden="true">{num}</div>
                      <div style={{ fontSize: 13, color: t.subtext, fontWeight: 600, lineHeight: 1.5, paddingTop: 3 }}>{text}</div>
                    </div>
                  ))}
                  <div style={{ background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: 10, padding: "12px 14px", fontSize: 12, color: "#60a5fa", fontWeight: 600, lineHeight: 1.5, marginTop: 6 }} role="note">
                    💡 This method sets the app as Device Owner — giving it full management capabilities over the device.
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────
function SideNavItem({ icon, label, active, onClick, badge, collapsed }) {
  return (
    <button className="nav-item" onClick={onClick} aria-label={label} aria-current={active ? "page" : undefined}
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: collapsed ? "10px 0" : "10px 12px", justifyContent: collapsed ? "center" : "flex-start", borderRadius: 10, border: "none", background: active ? "rgba(30,58,138,0.4)" : "transparent", color: active ? "#93c5fd" : "#4b5563", cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans',inherit", fontWeight: 600, textAlign: "left", marginBottom: 2, position: "relative" }}>
      <span style={{ color: active ? "#60a5fa" : "#374151", flexShrink: 0 }} aria-hidden="true">{icon}</span>
      {!collapsed && <span style={{ flex: 1 }}>{label}</span>}
      {badge && !collapsed && <span style={{ background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 20 }} aria-label={`${badge} alerts`}>{badge}</span>}
      {badge && collapsed && <div style={{ position: "absolute", top: 6, right: 8, width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} aria-hidden="true" />}
      {active && !collapsed && <div style={{ width: 3, height: 20, borderRadius: 2, background: "#3b82f6", marginLeft: "auto" }} aria-hidden="true" />}
    </button>
  );
}

function StatCard({ icon, label, value, color, sub, loading, t }) {
  return (
    <div className="stat-card" style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 16, padding: "22px 24px", borderTop: `2px solid ${color}33` }} aria-label={`${label}: ${value}`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}11`, border: `1px solid ${color}22`, display: "flex", alignItems: "center", justifyContent: "center", color }} aria-hidden="true">{icon}</div>
      </div>
      {loading ? (
        <div style={{ height: 36, background: t.border, borderRadius: 8, animation: "pulse 1.5s infinite" }} aria-label="Loading" />
      ) : (
        <div style={{ fontSize: 32, fontWeight: 800, color: t.text, lineHeight: 1, letterSpacing: -1, marginBottom: 6 }}>{value}</div>
      )}
      <div style={{ fontSize: 13, color: t.subtext, fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11, color, fontWeight: 600, opacity: 0.8 }}>{sub}</div>
    </div>
  );
}

function QuickAction({ icon, title, desc, onClick, color, t }) {
  return (
    <div className="device-card" role="button" tabIndex={0} aria-label={title}
      style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, padding: "18px 20px", cursor: "pointer" }}
      onClick={onClick} onKeyDown={e => e.key === "Enter" && onClick()}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: `${color}11`, border: `1px solid ${color}22`, display: "flex", alignItems: "center", justifyContent: "center", color, marginBottom: 14 }} aria-hidden="true">{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: 12, color: t.subtext, fontWeight: 500, lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}

function InfoPanel({ title, children, t }) {
  return (
    <section aria-label={title} style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: t.subtext, letterSpacing: 2, padding: "11px 16px", borderBottom: `1px solid ${t.border}`, background: t.sidebar, textTransform: "uppercase" }}>{title}</div>
      {children}
    </section>
  );
}

function InfoRow({ label, value, mono, missing, restricted, t }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: `1px solid ${t.border}`, gap: 12 }}>
      <span style={{ fontSize: 12, color: t.subtext, fontWeight: 600, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, textAlign: "right", wordBreak: "break-all", fontFamily: mono ? "'JetBrains Mono',monospace" : "inherit", color: missing ? "#f87171" : restricted ? "#facc15" : t.text }}>{value || "—"}</span>
    </div>
  );
}

function AppRow({ app, t }) {
  return (
    <div className="app-row" role="listitem" aria-label={`${app.appName}, ${app.packageName}, version ${app.versionName}`}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: `1px solid ${t.border}` }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: t.inputBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#3b82f6", flexShrink: 0 }} aria-hidden="true">
        {app.appName?.[0]?.toUpperCase() || "?"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{app.appName}</div>
        <div style={{ fontSize: 10, color: t.subtext, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2, fontFamily: "'JetBrains Mono',monospace" }}>{app.packageName}</div>
      </div>
      <div style={{ fontSize: 10, color: t.subtext, fontWeight: 600, flexShrink: 0 }}>{app.versionName}</div>
    </div>
  );
}

function Loader() {
  return (
    <div role="status" aria-label="Loading" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 80, gap: 16 }}>
      <div style={{ width: 32, height: 32, border: "2px solid #0f1a2e", borderTop: "2px solid #3b82f6", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} aria-hidden="true" />
      <div style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>Loading…</div>
    </div>
  );
}

function MiniLoader() {
  return (
    <div role="status" aria-label="Loading" style={{ display: "flex", justifyContent: "center", padding: 24 }}>
      <div style={{ width: 20, height: 20, border: "2px solid #0f1a2e", borderTop: "2px solid #3b82f6", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} aria-hidden="true" />
    </div>
  );
}

function Spinner() {
  return <div aria-hidden="true" style={{ width: 11, height: 11, border: "2px solid #93c5fd", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.7s linear infinite", marginRight: 6, display: "inline-block" }} />;
}

// ─── ICONS ────────────────────────────────────────────────────────
function DashIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" /></svg>; }
function PhoneIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17 1H7C5.9 1 5 1.9 5 3v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-2-2-2zm-5 20c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm5-4H7V3h10v14z" /></svg>; }
function KeyIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" /></svg>; }
function QrIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 11h8V3H3v8zm2-6h4v4H5V5zm8-2v8h8V3h-8zm6 6h-4V5h4v4zM3 21h8v-8H3v8zm2-6h4v4H5v-4zm13 0h-2v2h2v-2zm0 4h-2v2h2v-2zm2-4h-2v2h2v-2zm-4-2h-2v2h2v-2zm2 2h-2v2h2v-2zm2 2h-2v2h2v-2zm-2 2h-2v2h2v-2z" /></svg>; }
function ShieldIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" /></svg>; }
function AlertIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" /></svg>; }
function SyncIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 6 }} aria-hidden="true"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" /></svg>; }
function SyncIcon2() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" /></svg>; }
function CheckIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 6 }} aria-hidden="true"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg>; }
function CheckCircleIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>; }
function AppIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z" /></svg>; }
function HomeIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 4 }} aria-hidden="true"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></svg>; }
function ArrowIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 4 }} aria-hidden="true"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" /></svg>; }