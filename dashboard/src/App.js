import { useState, useEffect, useRef } from "react";
import { QRCodeSVG as QRCode } from "qrcode.react";

const API = "https://mdm-app-production.up.railway.app";

const fetchJSON = async (url, options) => {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const REQUIRED_FIELDS = ["model","manufacturer","osVersion","sdkVersion","uuid"];
const OPTIONAL_FIELDS = ["serialNumber","imei"];

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
  info:    { bg: "rgba(59,130,246,0.08)", text: "#60a5fa", dot: "#3b82f6", border: "rgba(59,130,246,0.2)", label: "Missing Data" },
};

const QR_PAYLOAD = JSON.stringify({
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.mdm.agent/.DeviceAdminReceiver",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": "https://mdm-app-production.up.railway.app/mdm.apk",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": "dcdf18f66de2a936306e68ce2fdcde36e3d951f846f68c8b64644f6c5d3c7283",
  "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": true,
  "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
    "server_url": "https://mdm-app-production.up.railway.app"
  }
});

export default function App() {
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

  useEffect(() => { loadAll(); }, []);

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
    <div style={s.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: #060b14; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e2d45; border-radius: 4px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
        .nav-item { transition: all 0.15s ease; }
        .nav-item:hover { background: rgba(30,58,138,0.3) !important; color: #93c5fd !important; }
        .device-card { transition: all 0.2s ease; }
        .device-card:hover { border-color: #1d4ed8 !important; transform: translateY(-3px); box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(59,130,246,0.1) !important; cursor: pointer; }
        .app-row:hover { background: rgba(30,42,70,0.5) !important; }
        .health-row:hover { background: rgba(15,31,61,0.5) !important; cursor: pointer; }
        .stat-card { transition: all 0.2s ease; }
        .stat-card:hover { border-color: rgba(59,130,246,0.3) !important; transform: translateY(-2px); }
        .btn-primary:hover { background: #2563eb !important; box-shadow: 0 0 20px rgba(37,99,235,0.4); }
        .btn-sync:hover { background: #1e3a8a !important; }
        .sidebar-item { transition: all 0.12s ease; }
        input:focus { outline: none; border-color: #2563eb !important; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        .fade-in { animation: fadeIn 0.3s ease forwards; }
        .grid-bg {
          background-image: linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
          background-size: 40px 40px;
        }
      `}</style>

      {/* SIDEBAR */}
      <aside style={{...s.sidebar, width: sidebarCollapsed ? 64 : 240}}>
        <div style={s.brand}>
          <div style={s.brandIcon}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="3" width="9" height="9" rx="2.5" fill="#3b82f6"/>
              <rect x="13" y="3" width="9" height="9" rx="2.5" fill="#60a5fa" opacity="0.7"/>
              <rect x="2" y="14" width="9" height="9" rx="2.5" fill="#60a5fa" opacity="0.7"/>
              <rect x="13" y="14" width="9" height="9" rx="2.5" fill="#1d4ed8" opacity="0.8"/>
            </svg>
          </div>
          {!sidebarCollapsed && (
            <div style={{flex:1}}>
              <div style={s.brandName}>MDM Console</div>
              <div style={s.brandTag}>Enterprise v2.0</div>
            </div>
          )}
          <button style={s.collapseBtn} onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              {sidebarCollapsed
                ? <path d="M8 5l8 7-8 7"/>
                : <path d="M16 5l-8 7 8 7"/>}
            </svg>
          </button>
        </div>

        <nav style={s.nav}>
          {!sidebarCollapsed && <div style={s.navSection}>NAVIGATION</div>}
          <SideNavItem icon={<DashIcon/>} label="Dashboard" active={view==="dashboard"} collapsed={sidebarCollapsed}
            onClick={() => { setView("dashboard"); setSelectedDevice(null); }} />
          <SideNavItem icon={<PhoneIcon/>} label="Devices" active={view==="devices"||view==="detail"} collapsed={sidebarCollapsed}
            onClick={() => { setView("devices"); setSelectedDevice(null); }} />
          <SideNavItem icon={<KeyIcon/>} label="Enrollment" active={view==="token"} collapsed={sidebarCollapsed}
            onClick={() => setView("token")} />
          <SideNavItem icon={<QrIcon/>} label="QR Provision" active={view==="qr"} collapsed={sidebarCollapsed}
            onClick={() => setView("qr")} />
          <SideNavItem icon={<ShieldIcon/>} label="Health Check" active={view==="health"} collapsed={sidebarCollapsed}
            onClick={() => setView("health")}
            badge={healthCounts.critical + healthCounts.warning > 0 ? healthCounts.critical + healthCounts.warning : null} />
        </nav>

        <div style={s.sidebarFooter}>
          <div style={s.onlinePill}>
            <div style={s.onlineDot}/>
            {!sidebarCollapsed && <span style={s.onlineText}>Backend Online</span>}
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <div style={s.main}>
        {/* TOP BAR */}
        <header style={s.topbar}>
          <div style={s.breadcrumb}>
            <span style={s.breadHome} onClick={() => { setView("dashboard"); setSelectedDevice(null); }}>
              <HomeIcon/> Home
            </span>
            {view !== "dashboard" && <>
              <span style={s.breadSep}>›</span>
              <span style={s.breadCur}>
                {view==="devices"?"Devices":view==="detail"&&selectedDevice?selectedDevice.deviceId.slice(0,20)+"…":view==="token"?"Enrollment":view==="qr"?"QR Provision":view==="health"?"Health Check":""}
              </span>
            </>}
          </div>
          <div style={s.topbarRight}>
            <button className="btn-sync" style={{...s.syncBtn,...(syncDone?s.syncDoneBtnStyle:{})}} onClick={syncAllDevices} disabled={syncing}>
              {syncing ? <><Spinner/> Syncing…</> : syncDone ? <><CheckIcon/> Synced</> : <><SyncIcon/> Refresh</>}
            </button>
            {view==="token" && <button className="btn-primary" style={s.newTokenBtn} onClick={generateToken}>+ New Token</button>}
          </div>
        </header>

        <main style={s.content} className="grid-bg">
          {error && (
            <div style={s.errorBanner} className="fade-in">
              <span style={{display:"flex",alignItems:"center",gap:8}}><AlertIcon/> {error}</span>
              <button style={s.errClose} onClick={() => setError(null)}>✕</button>
            </div>
          )}

          {/* DASHBOARD VIEW */}
          {view === "dashboard" && (
            <div className="fade-in">
              <div style={s.pageHeader}>
                <div>
                  <h1 style={s.pageTitle}>Command Center</h1>
                  <p style={s.pageSub}>Real-time overview of your device fleet</p>
                </div>
                <div style={s.headerBadge}>
                  <div style={s.headerBadgeDot}/>
                  Live
                </div>
              </div>

              {/* STAT CARDS */}
              <div style={s.statGrid}>
                <StatCard icon={<PhoneIcon/>} label="Total Devices" value={devices.length} color="#3b82f6" sub="enrolled" loading={loading}/>
                <StatCard icon={<CheckCircleIcon/>} label="Compliance Rate" value={`${complianceRate}%`} color="#22c55e" sub="devices healthy" loading={loading}/>
                <StatCard icon={<AppIcon/>} label="Apps Tracked" value={totalApps.toLocaleString()} color="#a78bfa" sub="across all devices" loading={loading}/>
                <StatCard icon={<AlertIcon/>} label="Issues" value={healthCounts.critical + healthCounts.warning} color="#f87171" sub={`${healthCounts.critical} critical`} loading={loading}/>
              </div>

              {/* HEALTH BREAKDOWN + RECENT */}
              <div style={s.dashGrid}>
                <div style={s.dashCard}>
                  <div style={s.dashCardHead}>
                    <span style={s.dashCardTitle}>Fleet Health</span>
                    <span style={s.dashCardSub}>{devices.length} total devices</span>
                  </div>
                  <div style={s.healthBars}>
                    {Object.entries(HEALTH_COLORS).map(([key, hc]) => {
                      const count = healthCounts[key];
                      const pct = devices.length > 0 ? (count / devices.length) * 100 : 0;
                      return (
                        <div key={key} style={s.healthBarRow}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <div style={{width:8,height:8,borderRadius:"50%",background:hc.dot,boxShadow:`0 0 6px ${hc.dot}`}}/>
                              <span style={{fontSize:12,fontWeight:600,color:"#94a3b8"}}>{hc.label}</span>
                            </div>
                            <span style={{fontSize:13,fontWeight:700,color:hc.text}}>{count}</span>
                          </div>
                          <div style={s.barTrack}>
                            <div style={{...s.barFill, width:`${pct}%`, background:hc.dot, boxShadow:`0 0 6px ${hc.dot}40`}}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={s.dashCard}>
                  <div style={s.dashCardHead}>
                    <span style={s.dashCardTitle}>Recent Enrollments</span>
                    <button style={s.viewAllBtn} onClick={() => setView("devices")}>View All →</button>
                  </div>
                  {loading ? <MiniLoader/> : devices.length === 0 ? (
                    <div style={s.emptyState}>
                      <div style={s.emptyIcon}><PhoneIcon/></div>
                      <div style={s.emptyTitle}>No devices yet</div>
                      <div style={s.emptySub}>Enroll your first device to get started</div>
                    </div>
                  ) : (
                    <div>
                      {devices.slice(0,5).map(d => {
                        const health = getHealthStatus(d, deviceInfoMap, appInventoryMap);
                        const hc = HEALTH_COLORS[health];
                        const info = deviceInfoMap[d.deviceId];
                        return (
                          <div key={d.id} className="health-row" style={s.recentRow} onClick={() => loadDeviceDetails(d)}>
                            <div style={{...s.recentAvatar, borderColor: hc.dot+"33"}}>
                              {d.deviceId.slice(0,2).toUpperCase()}
                            </div>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={s.recentId}>{info ? `${info.manufacturer} ${info.model}` : d.deviceId.slice(0,22)+"…"}</div>
                              <div style={s.recentDate}>{new Date(d.enrolledAt).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div>
                            </div>
                            <div style={{...s.miniHealthBadge, background:hc.bg, color:hc.text, borderColor:hc.border}}>
                              <div style={{width:5,height:5,borderRadius:"50%",background:hc.dot}}/>
                              {hc.label}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* QUICK ACTIONS */}
              <div style={s.quickActions}>
                <div style={s.qaTitle}>Quick Actions</div>
                <div style={s.qaGrid}>
                  <QuickAction icon={<KeyIcon/>} title="Generate Token" desc="Create enrollment token for a new device" onClick={() => setView("token")} color="#3b82f6"/>
                  <QuickAction icon={<QrIcon/>} title="QR Provisioning" desc="Provision device as Device Owner via QR" onClick={() => setView("qr")} color="#a78bfa"/>
                  <QuickAction icon={<ShieldIcon/>} title="Health Report" desc="Review fleet health and missing data" onClick={() => setView("health")} color={healthCounts.critical > 0 ? "#ef4444" : "#22c55e"}/>
                  <QuickAction icon={<SyncIcon2/>} title="Sync All" desc="Force refresh all device data now" onClick={syncAllDevices} color="#f59e0b"/>
                </div>
              </div>
            </div>
          )}

          {/* DEVICES VIEW */}
          {view === "devices" && (
            <div className="fade-in">
              <div style={s.pageHeader}>
                <div>
                  <h1 style={s.pageTitle}>Devices</h1>
                  <p style={s.pageSub}>{devices.length} enrolled · {healthCounts.critical} critical · {healthCounts.warning} warnings</p>
                </div>
              </div>

              <div style={s.filterRow}>
                {[
                  {id:"all",label:`All`,count:devices.length},
                  {id:"healthy",label:"Healthy",count:healthCounts.healthy,color:"#22c55e"},
                  {id:"warning",label:"Warning",count:healthCounts.warning,color:"#eab308"},
                  {id:"critical",label:"Critical",count:healthCounts.critical,color:"#ef4444"},
                  {id:"info",label:"Missing Data",count:healthCounts.info,color:"#3b82f6"},
                ].map(f => (
                  <button key={f.id} style={{...s.filterChip,...(healthFilter===f.id?{...s.filterChipActive,borderColor:(f.color||"#3b82f6")+"66",color:f.color||"#93c5fd"}:{})}}
                    onClick={() => setHealthFilter(f.id)}>
                    {f.color && healthFilter===f.id && <div style={{width:6,height:6,borderRadius:"50%",background:f.color}}/>}
                    {f.label}
                    <span style={{...s.filterCount,...(healthFilter===f.id?{background:(f.color||"#3b82f6")+"22",color:f.color||"#60a5fa"}:{})}}>{f.count}</span>
                  </button>
                ))}
              </div>

              {loading ? <Loader/> : (
                <div style={s.deviceGrid}>
                  {filteredDevices.map(d => {
                    const health = getHealthStatus(d, deviceInfoMap, appInventoryMap);
                    const hc = HEALTH_COLORS[health];
                    const info = deviceInfoMap[d.deviceId];
                    const missing = getMissingFields(info);
                    return (
                      <div key={d.id} className="device-card" style={s.deviceCard} onClick={() => loadDeviceDetails(d)}>
                        <div style={s.dcHeader}>
                          <div style={{...s.dcAvatar, borderColor: hc.dot+"44", boxShadow:`0 0 16px ${hc.dot}22`}}>
                            {d.deviceId.slice(0,2).toUpperCase()}
                          </div>
                          <div style={{...s.healthPill, background:hc.bg, color:hc.text, border:`1px solid ${hc.border}`}}>
                            <div style={{width:5,height:5,borderRadius:"50%",background:hc.dot,boxShadow:`0 0 4px ${hc.dot}`}}/>
                            {hc.label}
                          </div>
                        </div>
                        <div style={s.dcId}>{d.deviceId.length>22?d.deviceId.slice(0,22)+"…":d.deviceId}</div>
                        {info && <div style={s.dcModel}>{info.manufacturer} {info.model}</div>}
                        <div style={s.dcDivider}/>
                        <div style={s.dcMeta}>
                          <span style={s.dcMetaLabel}>Token</span>
                          <span style={s.dcMetaVal}>{d.enrollmentToken.slice(0,12)}…</span>
                        </div>
                        <div style={s.dcMeta}>
                          <span style={s.dcMetaLabel}>Enrolled</span>
                          <span style={s.dcMetaVal}>{new Date(d.enrolledAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span>
                        </div>
                        {missing.length > 0 && (
                          <div style={s.dcWarning}>
                            <span style={{color:"#f59e0b",fontSize:10}}>⚠</span>
                            <span style={s.dcWarningText}>{missing.slice(0,2).join(", ")}{missing.length>2?` +${missing.length-2} more`:""} missing</span>
                          </div>
                        )}
                        <div style={s.dcFooter}>View Details <ArrowIcon/></div>
                      </div>
                    );
                  })}
                  {filteredDevices.length === 0 && (
                    <div style={s.emptyFull}>
                      <div style={s.emptyIcon}><PhoneIcon/></div>
                      <div style={s.emptyTitle}>No devices in this category</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* DETAIL VIEW */}
          {view === "detail" && selectedDevice && (
            <div className="fade-in">
              <div style={s.pageHeader}>
                <div style={{display:"flex",alignItems:"center",gap:14}}>
                  <button style={s.backBtn} onClick={() => { setView("devices"); setSelectedDevice(null); }}>
                    ‹
                  </button>
                  <div style={{...s.dcAvatar, width:48,height:48,fontSize:17, borderColor: "#1e3a5f"}}>
                    {selectedDevice.deviceId.slice(0,2).toUpperCase()}
                  </div>
                  <div>
                    <h1 style={s.pageTitle}>{selectedDevice.deviceId.slice(0,28)}{selectedDevice.deviceId.length>28?"…":""}</h1>
                    <p style={s.pageSub}>Enrolled {new Date(selectedDevice.enrolledAt).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {missingFields.length > 0 && (
                <div style={s.alertBox}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <span style={{color:"#f59e0b",fontSize:16}}>⚠</span>
                    <span style={s.alertTitle}>Missing Device Data</span>
                  </div>
                  <div style={s.alertDesc}>The following fields are missing or restricted for this device:</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:10}}>
                    {missingFields.map(f => (
                      <span key={f} style={{
                        fontSize:11, padding:"3px 10px", borderRadius:6, fontWeight:700,
                        background: REQUIRED_FIELDS.includes(f) ? "rgba(239,68,68,0.1)" : "rgba(234,179,8,0.1)",
                        color: REQUIRED_FIELDS.includes(f) ? "#f87171" : "#facc15",
                        border: `1px solid ${REQUIRED_FIELDS.includes(f) ? "rgba(239,68,68,0.3)" : "rgba(234,179,8,0.3)"}`
                      }}>{f} {REQUIRED_FIELDS.includes(f)?"(required)":"(optional)"}</span>
                    ))}
                  </div>
                </div>
              )}

              {detailLoading ? <Loader/> : (
                <div style={s.detailLayout}>
                  <div style={s.detailLeft}>
                    <InfoPanel title="Enrollment">
                      <InfoRow label="Device ID" value={selectedDevice.deviceId} mono/>
                      <InfoRow label="Token" value={selectedDevice.enrollmentToken} mono/>
                      <InfoRow label="Enrolled At" value={new Date(selectedDevice.enrolledAt).toLocaleString()}/>
                    </InfoPanel>

                    {deviceInfo ? (
                      <InfoPanel title="Hardware & Software">
                        <InfoRow label="Model" value={deviceInfo.model} missing={!deviceInfo.model}/>
                        <InfoRow label="Manufacturer" value={deviceInfo.manufacturer} missing={!deviceInfo.manufacturer}/>
                        <InfoRow label="Android" value={deviceInfo.osVersion} missing={!deviceInfo.osVersion}/>
                        <InfoRow label="SDK" value={String(deviceInfo.sdkVersion||"")} missing={!deviceInfo.sdkVersion}/>
                        <InfoRow label="Serial" value={deviceInfo.serialNumber||"Restricted"} mono restricted={!deviceInfo.serialNumber||deviceInfo.serialNumber==="RESTRICTED"}/>
                        <InfoRow label="UUID" value={deviceInfo.uuid} mono missing={!deviceInfo.uuid}/>
                        <InfoRow label="IMEI" value={deviceInfo.imei||"Restricted"} mono restricted={!deviceInfo.imei}/>
                        {(deviceInfo.latitude || deviceInfo.longitude) && (
                          <InfoRow label="Location" value={`${deviceInfo.latitude?.toFixed(5)}, ${deviceInfo.longitude?.toFixed(5)}`} mono/>
                        )}
                      </InfoPanel>
                    ) : (
                      <div style={s.noDataPanel}>
                        <div style={{fontSize:28,marginBottom:10}}>⚠</div>
                        <div style={s.noDataTitle}>No Device Info</div>
                        <div style={s.noDataSub}>This device has not sent hardware information yet.</div>
                      </div>
                    )}
                  </div>

                  <div style={s.appPanel}>
                    <div style={s.appPanelHead}>
                      <div style={s.appPanelTitle}>App Inventory</div>
                      <div style={{display:"flex",gap:6}}>
                        <span style={s.userBadge}>{userApps.length} user</span>
                        <span style={s.sysBadge}>{systemApps.length} system</span>
                      </div>
                    </div>
                    {appInventory.length === 0 ? (
                      <div style={s.noDataPanel}>
                        <div style={{fontSize:28,marginBottom:10}}>📦</div>
                        <div style={s.noDataTitle}>No App Inventory</div>
                        <div style={s.noDataSub}>This device has not synced its app list yet.</div>
                      </div>
                    ) : (
                      <>
                        <div style={s.appSearch}>
                          <input style={s.searchInput} placeholder="Search applications…"
                            value={appSearch} onChange={e => setAppSearch(e.target.value)}/>
                        </div>
                        <div style={s.appList}>
                          {userApps.length > 0 && <>
                            <div style={s.appGroupLabel}>User Installed</div>
                            {userApps.map((app,i) => <AppRow key={i} app={app}/>)}
                          </>}
                          {systemApps.length > 0 && <>
                            <div style={s.appGroupLabel}>System</div>
                            {systemApps.map((app,i) => <AppRow key={i} app={app}/>)}
                          </>}
                          {filteredApps.length === 0 && <div style={s.noApps}>No apps match your search</div>}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* HEALTH VIEW */}
          {view === "health" && (
            <div className="fade-in">
              <div style={s.pageHeader}>
                <div>
                  <h1 style={s.pageTitle}>Health Check</h1>
                  <p style={s.pageSub}>Missing or incomplete data across all enrolled devices</p>
                </div>
              </div>

              <div style={s.healthCards}>
                {Object.entries(HEALTH_COLORS).map(([key, hc]) => (
                  <div key={key} className="stat-card" style={{...s.healthSumCard, borderColor: hc.border}}>
                    <div style={{width:10,height:10,borderRadius:"50%",background:hc.dot,boxShadow:`0 0 10px ${hc.dot}`,margin:"0 auto 12px"}}/>
                    <div style={{fontSize:36,fontWeight:800,color:"#f1f5f9",lineHeight:1,marginBottom:6}}>{healthCounts[key]}</div>
                    <div style={{fontSize:12,color:"#64748b",fontWeight:600}}>{hc.label}</div>
                  </div>
                ))}
              </div>

              <div style={s.tableWrap}>
                <div style={s.tableHead}>
                  <span style={{flex:2}}>Device</span>
                  <span style={{flex:2}}>Status</span>
                  <span style={{flex:3}}>Missing Fields</span>
                  <span style={{flex:1,textAlign:"right"}}>Apps</span>
                </div>
                {devices.map(d => {
                  const health = getHealthStatus(d, deviceInfoMap, appInventoryMap);
                  const hc = HEALTH_COLORS[health];
                  const info = deviceInfoMap[d.deviceId];
                  const apps = appInventoryMap[d.deviceId] || [];
                  const missing = getMissingFields(info);
                  return (
                    <div key={d.id} className="health-row" style={s.tableRow} onClick={() => loadDeviceDetails(d)}>
                      <div style={{flex:2}}>
                        <div style={{fontSize:13,fontWeight:700,color:"#e2e8f0"}}>{d.deviceId.slice(0,20)}{d.deviceId.length>20?"…":""}</div>
                        <div style={{fontSize:11,color:"#374151",fontWeight:600,marginTop:2}}>{new Date(d.enrolledAt).toLocaleDateString()}</div>
                      </div>
                      <div style={{flex:2}}>
                        <div style={{...s.healthPill, background:hc.bg, color:hc.text, border:`1px solid ${hc.border}`, display:"inline-flex"}}>
                          <div style={{width:5,height:5,borderRadius:"50%",background:hc.dot}}/>
                          {hc.label}
                        </div>
                      </div>
                      <div style={{flex:3}}>
                        {missing.length === 0 ? (
                          <span style={{fontSize:12,color:"#4ade80",fontWeight:700}}>✓ Complete</span>
                        ) : (
                          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                            {missing.map(f => (
                              <span key={f} style={{
                                fontSize:10, padding:"2px 8px", borderRadius:4, fontWeight:700,
                                background: REQUIRED_FIELDS.includes(f) ? "rgba(239,68,68,0.1)" : "rgba(234,179,8,0.1)",
                                color: REQUIRED_FIELDS.includes(f) ? "#f87171" : "#facc15",
                              }}>{f}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{flex:1,textAlign:"right",fontSize:14,fontWeight:800,color:"#3b82f6"}}>{apps.length}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TOKEN VIEW */}
          {view === "token" && (
            <div className="fade-in">
              <div style={s.pageHeader}>
                <div>
                  <h1 style={s.pageTitle}>Enrollment Tokens</h1>
                  <p style={s.pageSub}>Generate secure tokens to authorize device enrollment</p>
                </div>
              </div>
              <div style={s.tokenLayout}>
                <div style={s.tokenCard}>
                  <div style={s.tokenCardIcon}><KeyIcon/></div>
                  <div style={s.tokenCardTitle}>Generate Enrollment Token</div>
                  <div style={s.tokenCardDesc}>
                    A unique token authorizes a device to enroll in your MDM. Tokens are single-use — once a device enrolls, the token is invalidated automatically.
                  </div>
                  <button className="btn-primary" style={s.genTokenBtn} onClick={generateToken}>Generate Token</button>
                </div>

                {generatedToken && (
                  <div style={s.tokenResult} className="fade-in">
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                      <div style={s.tokenResultTitle}>Token Generated</div>
                      <div style={{...s.healthPill, background:"rgba(34,197,94,0.08)", color:"#4ade80", border:"1px solid rgba(34,197,94,0.2)", display:"inline-flex"}}>
                        <div style={{width:5,height:5,borderRadius:"50%",background:"#22c55e"}}/>
                        Ready to Use
                      </div>
                    </div>
                    <div style={s.tokenResultDesc}>Share this token with the device user. Enter it in the MDM app during setup.</div>
                    <div style={s.tokenBox}>
                      <code style={s.tokenCode}>{generatedToken}</code>
                      <button style={{...s.copyBtn,...(copied?s.copiedBtnStyle:{})}} onClick={copyToken}>
                        {copied ? "✓ Copied" : "Copy"}
                      </button>
                    </div>
                    <div style={s.tokenWarn}>⚠ Store this token securely. It grants device enrollment access and is single-use.</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* QR VIEW */}
          {view === "qr" && (
            <div className="fade-in">
              <div style={s.pageHeader}>
                <div>
                  <h1 style={s.pageTitle}>QR Provisioning</h1>
                  <p style={s.pageSub}>Scan during device setup to auto-install MDM as Device Owner</p>
                </div>
              </div>
              <div style={s.qrLayout}>
                <div style={s.qrCard}>
                  <div style={s.qrCardTitle}>Device Owner Provisioning QR</div>
                  <div style={s.qrCardDesc}>
                    On a factory reset device, tap the welcome screen <strong style={{color:"#60a5fa"}}>6 times</strong> to open the QR scanner. Android will automatically download and install the MDM app as Device Owner.
                  </div>
                  <div style={s.qrCodeWrap}>
                    <QRCode value={QR_PAYLOAD} size={220} level="M" bgColor="#ffffff" fgColor="#000000"/>
                  </div>
                  <div style={s.qrWarn}>⚠ Ensure the device has WiFi access before scanning</div>
                  <div style={s.qrMeta}>
                    <div style={s.qrMetaRow}>
                      <span style={s.qrMetaLabel}>APK URL</span>
                      <span style={s.qrMetaVal}>mdm-app-production.up.railway.app/mdm.apk</span>
                    </div>
                    <div style={s.qrMetaRow}>
                      <span style={s.qrMetaLabel}>Component</span>
                      <span style={s.qrMetaVal}>com.mdm.agent/.DeviceAdminReceiver</span>
                    </div>
                  </div>
                </div>

                <div style={s.qrStepsCard}>
                  <div style={s.qrStepsTitle}>How It Works</div>
                  {[
                    ["1","Factory reset the target Android device"],
                    ["2","On welcome screen, tap 6 times to trigger QR mode"],
                    ["3","Connect to WiFi when prompted by setup wizard"],
                    ["4","Point the camera at this QR code to scan it"],
                    ["5","Android downloads & installs MDM app automatically"],
                    ["6","App enrolls as Device Owner and sends data to dashboard"],
                  ].map(([num, text]) => (
                    <div key={num} style={s.qrStep}>
                      <div style={s.qrStepNum}>{num}</div>
                      <div style={s.qrStepText}>{text}</div>
                    </div>
                  ))}
                  <div style={s.qrNote}>
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
    <button className="nav-item sidebar-item" onClick={onClick} style={{
      display:"flex", alignItems:"center", gap:10, width:"100%",
      padding: collapsed ? "10px 0" : "10px 12px",
      justifyContent: collapsed ? "center" : "flex-start",
      borderRadius:10, border:"none",
      background: active ? "rgba(30,58,138,0.4)" : "transparent",
      color: active ? "#93c5fd" : "#4b5563",
      cursor:"pointer", fontSize:13, fontFamily:"'DM Sans',inherit",
      fontWeight:600, textAlign:"left", marginBottom:2, position:"relative"
    }}>
      <span style={{color: active ? "#60a5fa" : "#374151", flexShrink:0}}>{icon}</span>
      {!collapsed && <span style={{flex:1}}>{label}</span>}
      {badge && !collapsed && <span style={{background:"#ef4444",color:"#fff",fontSize:10,fontWeight:800,padding:"2px 7px",borderRadius:20}}>{badge}</span>}
      {badge && collapsed && <div style={{position:"absolute",top:6,right:8,width:8,height:8,borderRadius:"50%",background:"#ef4444"}}/>}
      {active && !collapsed && <div style={{width:3,height:20,borderRadius:2,background:"#3b82f6",marginLeft:"auto"}}/>}
    </button>
  );
}

function StatCard({ icon, label, value, color, sub, loading }) {
  return (
    <div className="stat-card" style={{background:"#0a1020",border:"1px solid #0f1a2e",borderRadius:16,padding:"22px 24px",borderTop:`2px solid ${color}33`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
        <div style={{width:40,height:40,borderRadius:10,background:`${color}11`,border:`1px solid ${color}22`,display:"flex",alignItems:"center",justifyContent:"center",color:color}}>
          {icon}
        </div>
      </div>
      {loading ? (
        <div style={{height:36,background:"#0f1a2e",borderRadius:8,animation:"pulse 1.5s infinite"}}/>
      ) : (
        <div style={{fontSize:32,fontWeight:800,color:"#f1f5f9",lineHeight:1,letterSpacing:-1,marginBottom:6}}>{value}</div>
      )}
      <div style={{fontSize:13,color:"#64748b",fontWeight:600,marginBottom:2}}>{label}</div>
      <div style={{fontSize:11,color:color,fontWeight:600,opacity:0.8}}>{sub}</div>
    </div>
  );
}

function QuickAction({ icon, title, desc, onClick, color }) {
  return (
    <div className="device-card" style={{background:"#0a1020",border:"1px solid #0f1a2e",borderRadius:14,padding:"18px 20px",cursor:"pointer"}} onClick={onClick}>
      <div style={{width:38,height:38,borderRadius:10,background:`${color}11`,border:`1px solid ${color}22`,display:"flex",alignItems:"center",justifyContent:"center",color:color,marginBottom:14}}>
        {icon}
      </div>
      <div style={{fontSize:14,fontWeight:700,color:"#e2e8f0",marginBottom:5}}>{title}</div>
      <div style={{fontSize:12,color:"#374151",fontWeight:500,lineHeight:1.5}}>{desc}</div>
    </div>
  );
}

function InfoPanel({ title, children }) {
  return (
    <div style={{background:"#0a1020",border:"1px solid #0f1a2e",borderRadius:14,overflow:"hidden"}}>
      <div style={{fontSize:10,fontWeight:800,color:"#1e3a5f",letterSpacing:2,padding:"11px 16px",borderBottom:"1px solid #0f1a2e",background:"#070d1a",textTransform:"uppercase"}}>{title}</div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, mono, missing, restricted }) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",borderBottom:"1px solid #0a1020",gap:12}}>
      <span style={{fontSize:12,color:"#4b5563",fontWeight:600,flexShrink:0}}>{label}</span>
      <span style={{
        fontSize:12,fontWeight:600,textAlign:"right",wordBreak:"break-all",
        fontFamily: mono ? "'JetBrains Mono',monospace" : "inherit",
        color: missing ? "#f87171" : restricted ? "#facc15" : "#cbd5e1"
      }}>{value||"—"}</span>
    </div>
  );
}

function AppRow({ app }) {
  return (
    <div className="app-row" style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",borderBottom:"1px solid #0a1020"}}>
      <div style={{width:32,height:32,borderRadius:8,background:"#0f1f3d",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#3b82f6",flexShrink:0}}>
        {app.appName?.[0]?.toUpperCase()||"?"}
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,fontWeight:700,color:"#e2e8f0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{app.appName}</div>
        <div style={{fontSize:10,color:"#374151",fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginTop:2,fontFamily:"'JetBrains Mono',monospace"}}>{app.packageName}</div>
      </div>
      <div style={{fontSize:10,color:"#4b5563",fontWeight:600,flexShrink:0}}>{app.versionName}</div>
    </div>
  );
}

function Loader() {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:80,gap:16}}>
      <div style={{width:32,height:32,border:"2px solid #0f1a2e",borderTop:"2px solid #3b82f6",borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/>
      <div style={{fontSize:13,color:"#374151",fontWeight:600}}>Loading…</div>
    </div>
  );
}

function MiniLoader() {
  return (
    <div style={{display:"flex",justifyContent:"center",padding:24}}>
      <div style={{width:20,height:20,border:"2px solid #0f1a2e",borderTop:"2px solid #3b82f6",borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/>
    </div>
  );
}

function Spinner() {
  return <div style={{width:11,height:11,border:"2px solid #93c5fd",borderTop:"2px solid #fff",borderRadius:"50%",animation:"spin 0.7s linear infinite",marginRight:6,display:"inline-block"}}/>;
}

// ─── ICONS ────────────────────────────────────────────────────────
function DashIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>; }
function PhoneIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17 1H7C5.9 1 5 1.9 5 3v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-2-2-2zm-5 20c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm5-4H7V3h10v14z"/></svg>; }
function KeyIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>; }
function QrIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M3 11h8V3H3v8zm2-6h4v4H5V5zm8-2v8h8V3h-8zm6 6h-4V5h4v4zM3 21h8v-8H3v8zm2-6h4v4H5v-4zm13 0h-2v2h2v-2zm0 4h-2v2h2v-2zm2-4h-2v2h2v-2zm-4-2h-2v2h2v-2zm2 2h-2v2h2v-2zm2 2h-2v2h2v-2zm-2 2h-2v2h2v-2z"/></svg>; }
function ShieldIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>; }
function AlertIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>; }
function SyncIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{marginRight:6}}><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>; }
function SyncIcon2() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>; }
function CheckIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{marginRight:6}}><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>; }
function CheckCircleIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>; }
function AppIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/></svg>; }
function HomeIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{marginRight:4}}><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>; }
function ArrowIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{marginLeft:4}}><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>; }

// ─── STYLES ───────────────────────────────────────────────────────
const s = {
  root: { display:"flex", height:"100vh", background:"#060b14", color:"#e2e8f0", fontFamily:"'DM Sans',-apple-system,'Segoe UI',sans-serif", overflow:"hidden" },
  sidebar: { background:"#070d1a", borderRight:"1px solid #0d1424", display:"flex", flexDirection:"column", flexShrink:0, transition:"width 0.2s ease" },
  brand: { display:"flex", alignItems:"center", gap:10, padding:"18px 14px", borderBottom:"1px solid #0d1424", minHeight:64 },
  brandIcon: { width:36, height:36, background:"#0f1f3d", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  brandName: { fontSize:14, fontWeight:800, color:"#f1f5f9", letterSpacing:-0.3 },
  brandTag: { fontSize:9, color:"#1e3a5f", letterSpacing:1, fontWeight:700, marginTop:2 },
  collapseBtn: { width:24, height:24, borderRadius:6, background:"transparent", border:"1px solid #0d1424", color:"#1e3a5f", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginLeft:"auto" },
  nav: { padding:"16px 10px 0", flex:1 },
  navSection: { fontSize:9, color:"#1e3a5f", letterSpacing:2, padding:"0 8px 10px", fontWeight:800, textTransform:"uppercase" },
  sidebarFooter: { padding:14, borderTop:"1px solid #0d1424" },
  onlinePill: { display:"flex", alignItems:"center", gap:8, background:"#04080f", borderRadius:8, padding:"8px 10px", border:"1px solid #0d1424" },
  onlineDot: { width:7, height:7, borderRadius:"50%", background:"#22c55e", boxShadow:"0 0 8px #22c55e", flexShrink:0 },
  onlineText: { fontSize:11, color:"#1e3a5f", fontWeight:700 },
  main: { flex:1, display:"flex", flexDirection:"column", overflow:"hidden" },
  topbar: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 24px", height:56, background:"#070d1a", borderBottom:"1px solid #0d1424", flexShrink:0 },
  breadcrumb: { display:"flex", alignItems:"center", gap:6, fontSize:13, fontWeight:600 },
  breadHome: { display:"flex", alignItems:"center", cursor:"pointer", color:"#3b82f6" },
  breadSep: { color:"#1e2d45", fontSize:16 },
  breadCur: { color:"#4b5563" },
  topbarRight: { display:"flex", gap:8, alignItems:"center" },
  syncBtn: { display:"flex", alignItems:"center", padding:"7px 14px", background:"#0f1f3d", border:"1px solid #1e3a5f", borderRadius:8, color:"#60a5fa", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700, transition:"all 0.15s" },
  syncDoneBtnStyle: { background:"#0c2518", border:"1px solid #166534", color:"#4ade80" },
  newTokenBtn: { padding:"7px 14px", background:"#1d4ed8", border:"none", borderRadius:8, color:"#fff", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700 },
  content: { flex:1, overflowY:"auto", padding:"24px 28px" },
  errorBanner: { display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(239,68,68,0.07)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:10, padding:"10px 16px", marginBottom:20, fontSize:13, color:"#fca5a5", fontWeight:600 },
  errClose: { background:"none", border:"none", color:"#fca5a5", cursor:"pointer", fontSize:16 },
  pageHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 },
  pageTitle: { margin:0, fontSize:26, fontWeight:800, color:"#f1f5f9", letterSpacing:-0.8 },
  pageSub: { margin:"4px 0 0", fontSize:12, color:"#374151", fontWeight:600 },
  headerBadge: { display:"flex", alignItems:"center", gap:6, background:"rgba(34,197,94,0.07)", border:"1px solid rgba(34,197,94,0.15)", borderRadius:20, padding:"5px 12px", fontSize:12, fontWeight:700, color:"#4ade80" },
  headerBadgeDot: { width:7, height:7, borderRadius:"50%", background:"#22c55e", boxShadow:"0 0 6px #22c55e", animation:"pulse 2s infinite" },
  statGrid: { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:20 },
  dashGrid: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 },
  dashCard: { background:"#0a1020", border:"1px solid #0f1a2e", borderRadius:16, padding:22, overflow:"hidden" },
  dashCardHead: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 },
  dashCardTitle: { fontSize:13, fontWeight:800, color:"#e2e8f0" },
  dashCardSub: { fontSize:11, color:"#374151", fontWeight:600 },
  viewAllBtn: { fontSize:12, color:"#3b82f6", fontWeight:700, background:"none", border:"none", cursor:"pointer", fontFamily:"inherit" },
  healthBars: { display:"flex", flexDirection:"column", gap:14 },
  healthBarRow: {},
  barTrack: { height:4, background:"#0f1a2e", borderRadius:4, overflow:"hidden" },
  barFill: { height:"100%", borderRadius:4, transition:"width 0.6s ease" },
  recentRow: { display:"flex", alignItems:"center", gap:12, padding:"10px 4px", borderBottom:"1px solid #0a1020", borderRadius:6 },
  recentAvatar: { width:34, height:34, borderRadius:9, background:"#0f1f3d", border:"1px solid", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, color:"#3b82f6", flexShrink:0 },
  recentId: { fontSize:12, fontWeight:700, color:"#e2e8f0" },
  recentDate: { fontSize:10, color:"#374151", fontWeight:600, marginTop:2 },
  miniHealthBadge: { display:"flex", alignItems:"center", gap:5, padding:"3px 9px", borderRadius:20, fontSize:10, fontWeight:700, border:"1px solid", flexShrink:0 },
  quickActions: { background:"#0a1020", border:"1px solid #0f1a2e", borderRadius:16, padding:22 },
  qaTitle: { fontSize:13, fontWeight:800, color:"#e2e8f0", marginBottom:16 },
  qaGrid: { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 },
  filterRow: { display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" },
  filterChip: { display:"flex", alignItems:"center", gap:6, padding:"6px 14px", background:"#0a1020", border:"1px solid #0f1a2e", borderRadius:20, color:"#4b5563", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700 },
  filterChipActive: { background:"rgba(30,58,138,0.2)" },
  filterCount: { background:"#0f1a2e", borderRadius:10, padding:"1px 7px", fontSize:11, fontWeight:700, color:"#374151" },
  deviceGrid: { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))", gap:14 },
  deviceCard: { background:"#0a1020", border:"1px solid #0f1a2e", borderRadius:16, padding:20 },
  dcHeader: { display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 },
  dcAvatar: { width:44, height:44, borderRadius:12, background:"#0f1f3d", border:"1px solid", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:800, color:"#3b82f6" },
  healthPill: { display:"flex", alignItems:"center", gap:5, padding:"4px 10px", borderRadius:20, fontSize:11, fontWeight:700 },
  dcId: { fontSize:13, fontWeight:700, color:"#e2e8f0", marginBottom:4 },
  dcModel: { fontSize:12, fontWeight:600, color:"#3b82f6", marginBottom:12 },
  dcDivider: { height:1, background:"#0f1a2e", marginBottom:12 },
  dcMeta: { display:"flex", justifyContent:"space-between", marginBottom:5 },
  dcMetaLabel: { fontSize:11, color:"#374151", fontWeight:600 },
  dcMetaVal: { fontSize:11, color:"#64748b", fontWeight:600, fontFamily:"'JetBrains Mono',monospace" },
  dcWarning: { display:"flex", alignItems:"center", gap:5, marginTop:8, marginBottom:6 },
  dcWarningText: { fontSize:11, color:"#78350f", fontWeight:600 },
  dcFooter: { display:"flex", alignItems:"center", marginTop:12, fontSize:12, color:"#2563eb", fontWeight:700 },
  emptyFull: { gridColumn:"1/-1", padding:60, textAlign:"center" },
  emptyState: { padding:"32px 0", textAlign:"center" },
  emptyIcon: { color:"#1e3a5f", marginBottom:10, display:"flex", justifyContent:"center" },
  emptyTitle: { fontSize:14, fontWeight:700, color:"#1e3a5f", marginBottom:6 },
  emptySub: { fontSize:12, color:"#0f1a2e", fontWeight:600 },
  backBtn: { width:36, height:36, borderRadius:10, background:"#0f1f3d", border:"1px solid #1e3a5f", color:"#3b82f6", cursor:"pointer", fontSize:22, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontWeight:800 },
  alertBox: { background:"rgba(234,179,8,0.05)", border:"1px solid rgba(234,179,8,0.15)", borderRadius:12, padding:"16px 20px", marginBottom:20 },
  alertTitle: { fontSize:14, fontWeight:800, color:"#f59e0b" },
  alertDesc: { fontSize:12, color:"#78350f", fontWeight:600 },
  detailLayout: { display:"grid", gridTemplateColumns:"300px 1fr", gap:16, alignItems:"start" },
  detailLeft: { display:"flex", flexDirection:"column", gap:14 },
  noDataPanel: { background:"#0a1020", border:"1px solid #0f1a2e", borderRadius:14, padding:28, textAlign:"center" },
  noDataTitle: { fontSize:14, fontWeight:800, color:"#374151", marginBottom:6 },
  noDataSub: { fontSize:12, color:"#1e3a5f", fontWeight:600, lineHeight:1.5 },
  appPanel: { background:"#0a1020", border:"1px solid #0f1a2e", borderRadius:14, overflow:"hidden" },
  appPanelHead: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px", borderBottom:"1px solid #0a1020", background:"#070d1a" },
  appPanelTitle: { fontSize:11, fontWeight:800, color:"#374151", letterSpacing:1.5, textTransform:"uppercase" },
  userBadge: { fontSize:10, padding:"3px 10px", borderRadius:20, background:"rgba(34,197,94,0.07)", color:"#4ade80", fontWeight:700, border:"1px solid rgba(34,197,94,0.15)" },
  sysBadge: { fontSize:10, padding:"3px 10px", borderRadius:20, background:"rgba(59,130,246,0.07)", color:"#60a5fa", fontWeight:700, border:"1px solid rgba(59,130,246,0.15)" },
  appSearch: { padding:"10px 12px", borderBottom:"1px solid #0a1020", background:"#070d1a" },
  searchInput: { width:"100%", background:"#0a1020", border:"1px solid #0f1a2e", borderRadius:8, padding:"8px 12px", color:"#e2e8f0", fontSize:13, fontFamily:"inherit", fontWeight:600, transition:"all 0.15s" },
  appList: { maxHeight:480, overflowY:"auto" },
  appGroupLabel: { fontSize:9, color:"#1e3a5f", letterSpacing:2, padding:"10px 16px 4px", fontWeight:800, background:"#070d1a", textTransform:"uppercase" },
  noApps: { padding:24, textAlign:"center", color:"#1e3a5f", fontSize:13, fontWeight:600 },
  healthCards: { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:24 },
  healthSumCard: { background:"#0a1020", border:"1px solid", borderRadius:14, padding:"22px 16px", textAlign:"center" },
  tableWrap: { background:"#0a1020", border:"1px solid #0f1a2e", borderRadius:14, overflow:"hidden" },
  tableHead: { display:"flex", padding:"11px 20px", background:"#070d1a", borderBottom:"1px solid #0d1424", fontSize:9, color:"#1e3a5f", fontWeight:800, letterSpacing:2, textTransform:"uppercase" },
  tableRow: { display:"flex", alignItems:"center", padding:"14px 20px", borderBottom:"1px solid #0a1020", transition:"background 0.15s" },
  tokenLayout: { display:"flex", flexDirection:"column", gap:16, maxWidth:560 },
  tokenCard: { background:"#0a1020", border:"1px solid #0f1a2e", borderRadius:16, padding:28 },
  tokenCardIcon: { width:44, height:44, borderRadius:12, background:"rgba(59,130,246,0.08)", border:"1px solid rgba(59,130,246,0.15)", display:"flex", alignItems:"center", justifyContent:"center", color:"#3b82f6", marginBottom:16 },
  tokenCardTitle: { fontSize:18, fontWeight:800, color:"#f1f5f9", marginBottom:10, letterSpacing:-0.4 },
  tokenCardDesc: { fontSize:13, color:"#4b5563", fontWeight:500, lineHeight:1.7, marginBottom:22 },
  genTokenBtn: { padding:"11px 24px", background:"#1d4ed8", border:"none", borderRadius:10, color:"#fff", cursor:"pointer", fontFamily:"inherit", fontSize:14, fontWeight:700 },
  tokenResult: { background:"#0a1020", border:"1px solid #1e3a5f", borderRadius:16, padding:24 },
  tokenResultTitle: { fontSize:15, fontWeight:800, color:"#f1f5f9" },
  tokenResultDesc: { fontSize:12, color:"#4b5563", fontWeight:600, marginBottom:16, lineHeight:1.5 },
  tokenBox: { display:"flex", alignItems:"center", gap:12, background:"#04080f", border:"1px solid #0f1a2e", borderRadius:10, padding:"14px 16px", marginBottom:14 },
  tokenCode: { flex:1, fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"#60a5fa", fontWeight:600, wordBreak:"break-all" },
  copyBtn: { padding:"8px 16px", background:"#1d4ed8", border:"none", borderRadius:8, color:"#fff", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700, flexShrink:0, transition:"all 0.15s" },
  copiedBtnStyle: { background:"#15803d" },
  tokenWarn: { fontSize:12, color:"#f59e0b", background:"rgba(245,158,11,0.07)", border:"1px solid rgba(245,158,11,0.2)", borderRadius:8, padding:"9px 14px", fontWeight:600 },
  qrLayout: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, maxWidth:860 },
  qrCard: { background:"#0a1020", border:"1px solid #0f1a2e", borderRadius:16, padding:28 },
  qrCardTitle: { fontSize:18, fontWeight:800, color:"#f1f5f9", marginBottom:10, letterSpacing:-0.4 },
  qrCardDesc: { fontSize:13, color:"#4b5563", fontWeight:500, lineHeight:1.7, marginBottom:22 },
  qrCodeWrap: { background:"#fff", padding:18, display:"inline-block", borderRadius:14, marginBottom:18 },
  qrWarn: { fontSize:12, color:"#f59e0b", fontWeight:600, marginBottom:14 },
  qrMeta: { background:"#04080f", borderRadius:10, padding:14, border:"1px solid #0f1a2e", display:"flex", flexDirection:"column", gap:10 },
  qrMetaRow: { display:"flex", flexDirection:"column", gap:3 },
  qrMetaLabel: { fontSize:9, color:"#1e3a5f", fontWeight:800, letterSpacing:1.5, textTransform:"uppercase" },
  qrMetaVal: { fontSize:11, color:"#60a5fa", fontFamily:"'JetBrains Mono',monospace", fontWeight:600, wordBreak:"break-all" },
  qrStepsCard: { background:"#0a1020", border:"1px solid #0f1a2e", borderRadius:16, padding:28 },
  qrStepsTitle: { fontSize:15, fontWeight:800, color:"#f1f5f9", marginBottom:20, letterSpacing:-0.3 },
  qrStep: { display:"flex", alignItems:"flex-start", gap:14, marginBottom:16 },
  qrStepNum: { width:26, height:26, borderRadius:"50%", background:"#0f1f3d", border:"1px solid #1e3a5f", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:"#3b82f6", flexShrink:0 },
  qrStepText: { fontSize:13, color:"#64748b", fontWeight:600, lineHeight:1.5, paddingTop:3 },
  qrNote: { background:"rgba(59,130,246,0.05)", border:"1px solid rgba(59,130,246,0.15)", borderRadius:10, padding:"12px 14px", fontSize:12, color:"#60a5fa", fontWeight:600, lineHeight:1.5, marginTop:6 },
};
