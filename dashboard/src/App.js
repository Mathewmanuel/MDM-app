import { useState, useEffect } from "react";
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
  healthy: { bg: "#0d2218", text: "#4ade80", dot: "#22c55e", label: "Healthy" },
  warning: { bg: "#1c1a08", text: "#facc15", dot: "#eab308", label: "Warning" },
  critical: { bg: "#2d0f0f", text: "#f87171", dot: "#ef4444", label: "Critical" },
  info:    { bg: "#0d1f3c", text: "#60a5fa", dot: "#3b82f6", label: "Missing Data" },
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
  const [view, setView] = useState("devices");
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

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true); setError(null);
    try {
      const devs = await fetchJSON(`${API}/devices`);
      setDevices(devs);
      const infoResults = await Promise.allSettled(
        devs.map(d => fetchJSON(`${API}/device-info/${d.deviceId}`))
      );
      const appResults = await Promise.allSettled(
        devs.map(d => fetchJSON(`${API}/app-inventory/${d.deviceId}`))
      );
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

  return (
    <div style={s.root}>
      <style>{`*{box-sizing:border-box;}body{margin:0;}@keyframes spin{to{transform:rotate(360deg)}}.hrow:hover{background:#0d1424!important;cursor:pointer;}.arow:hover{background:#0d1424!important;}.dcard:hover{border-color:#2563eb!important;transform:translateY(-2px);transition:all 0.2s;}`}</style>

      {/* SIDEBAR */}
      <aside style={s.sidebar}>
        <div style={s.brand}>
          <div style={s.brandLogo}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="3" width="9" height="9" rx="2" fill="#2563eb"/>
              <rect x="13" y="3" width="9" height="9" rx="2" fill="#3b82f6" opacity="0.8"/>
              <rect x="2" y="14" width="9" height="9" rx="2" fill="#3b82f6" opacity="0.8"/>
              <rect x="13" y="14" width="9" height="9" rx="2" fill="#1d4ed8" opacity="0.6"/>
            </svg>
          </div>
          <div>
            <div style={s.brandName}>MDM Console</div>
            <div style={s.brandSub}>Enterprise Management</div>
          </div>
        </div>

        <div style={s.navSection}>
          <div style={s.navLabel}>MANAGEMENT</div>
          <NavBtn icon={<PhoneIcon />} label="Devices" active={view==="devices"||view==="detail"}
            onClick={() => { setView("devices"); setSelectedDevice(null); }} />
          <NavBtn icon={<KeyIcon />} label="Enrollment Tokens" active={view==="token"}
            onClick={() => setView("token")} />
          <NavBtn icon={<QrIcon />} label="QR Provisioning" active={view==="qr"}
            onClick={() => setView("qr")} />
          <NavBtn icon={<AlertIcon />} label="Health Check" active={view==="health"}
            onClick={() => setView("health")}
            badge={healthCounts.critical + healthCounts.warning > 0 ? healthCounts.critical + healthCounts.warning : null} />
        </div>

        <div style={s.sidebarBottom}>
          <div style={s.statusPill}>
            <div style={s.statusDot} />
            <span style={s.statusLabel}>Backend Online</span>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <div style={s.mainWrap}>
        {/* TOP BAR */}
        <div style={s.topBar}>
          <div style={s.breadcrumb}>
            <span style={s.breadcrumbRoot} onClick={() => { setView("devices"); setSelectedDevice(null); }}>Devices</span>
            {view === "detail" && selectedDevice && (<><span style={s.sep}>›</span><span style={s.breadcrumbCur}>{selectedDevice.deviceId.slice(0,20)}…</span></>)}
            {view === "token" && (<><span style={s.sep}>›</span><span style={s.breadcrumbCur}>Enrollment Tokens</span></>)}
            {view === "qr" && (<><span style={s.sep}>›</span><span style={s.breadcrumbCur}>QR Provisioning</span></>)}
            {view === "health" && (<><span style={s.sep}>›</span><span style={s.breadcrumbCur}>Health Check</span></>)}
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <button style={{...s.syncBtn,...(syncDone?s.syncDoneBtn:{})}} onClick={syncAllDevices} disabled={syncing}>
              {syncing ? <><Spinner/> Syncing…</> : syncDone ? "✓ Synced" : <><SyncIcon/> Sync All Devices</>}
            </button>
            {view === "token" && <button style={s.actionBtn} onClick={generateToken}>+ New Token</button>}
          </div>
        </div>

        <div style={s.page}>
          {error && <div style={s.errorBar}><span>⚠ {error}</span><button style={s.errX} onClick={() => setError(null)}>✕</button></div>}

          {/* DEVICES */}
          {view === "devices" && (
            <>
              <div style={s.pageHead}>
                <div>
                  <h1 style={s.pageTitle}>Devices</h1>
                  <p style={s.pageSub}>{devices.length} enrolled · {healthCounts.critical} critical · {healthCounts.warning} warnings</p>
                </div>
              </div>
              <div style={s.filterRow}>
                {[
                  {id:"all", label:`All (${devices.length})`},
                  {id:"healthy", label:`Healthy (${healthCounts.healthy})`},
                  {id:"warning", label:`Warning (${healthCounts.warning})`},
                  {id:"critical", label:`Critical (${healthCounts.critical})`},
                  {id:"info", label:`Missing Data (${healthCounts.info})`},
                ].map(f => (
                  <button key={f.id} style={{...s.filterPill,...(healthFilter===f.id?s.filterPillActive:{})}}
                    onClick={() => setHealthFilter(f.id)}>{f.label}</button>
                ))}
              </div>
              {loading ? <Loader /> : (
                <div style={s.deviceGrid}>
                  {filteredDevices.map(d => {
                    const health = getHealthStatus(d, deviceInfoMap, appInventoryMap);
                    const hc = HEALTH_COLORS[health];
                    const info = deviceInfoMap[d.deviceId];
                    const missing = getMissingFields(info);
                    return (
                      <div key={d.id} className="dcard" style={s.deviceCard} onClick={() => loadDeviceDetails(d)}>
                        <div style={s.dcTop}>
                          <div style={s.dcAvatar}>{d.deviceId.slice(0,2).toUpperCase()}</div>
                          <div style={{...s.healthBadge, background:hc.bg, color:hc.text}}>
                            <div style={{...s.healthDot, background:hc.dot, boxShadow:`0 0 5px ${hc.dot}`}}/>
                            {hc.label}
                          </div>
                        </div>
                        <div style={s.dcId}>{d.deviceId.length>22?d.deviceId.slice(0,22)+"…":d.deviceId}</div>
                        {info && <div style={s.dcModel}>{info.manufacturer} {info.model}</div>}
                        <div style={s.dcMeta}>Token: {d.enrollmentToken.slice(0,14)}…</div>
                        <div style={s.dcDate}>{new Date(d.enrolledAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div>
                        {missing.length > 0 && (
                          <div style={s.dcMissingRow}>
                            <span style={s.dcMissingLabel}>⚠ Missing: </span>
                            <span style={s.dcMissingFields}>{missing.slice(0,3).join(", ")}{missing.length>3?` +${missing.length-3}`:""}</span>
                          </div>
                        )}
                        <div style={s.dcLink}>View Details ›</div>
                      </div>
                    );
                  })}
                  {filteredDevices.length === 0 && <div style={s.empty}><div style={s.emptyT}>No devices in this category</div></div>}
                </div>
              )}
            </>
          )}

          {/* DETAIL */}
          {view === "detail" && selectedDevice && (
            <>
              <div style={s.pageHead}>
                <div style={{display:"flex",alignItems:"center",gap:14}}>
                  <button style={s.backBtn} onClick={() => { setView("devices"); setSelectedDevice(null); }}>‹</button>
                  <div style={s.dcAvatarLg}>{selectedDevice.deviceId.slice(0,2).toUpperCase()}</div>
                  <div>
                    <h1 style={s.pageTitle}>{selectedDevice.deviceId.slice(0,28)}{selectedDevice.deviceId.length>28?"…":""}</h1>
                    <p style={s.pageSub}>Enrolled {new Date(selectedDevice.enrolledAt).toLocaleString()}</p>
                  </div>
                </div>
              </div>
              {missingFields.length > 0 && (
                <div style={s.missingAlert}>
                  <div style={s.missingAlertTitle}>⚠ Missing Device Data</div>
                  <div style={s.missingAlertDesc}>The following fields are missing or restricted for this device:</div>
                  <div style={s.missingTags}>
                    {missingFields.map(f => (
                      <span key={f} style={{
                        ...s.missingTag,
                        background: REQUIRED_FIELDS.includes(f) ? "#2d0f0f" : "#1c1a08",
                        color: REQUIRED_FIELDS.includes(f) ? "#f87171" : "#facc15",
                        border: `1px solid ${REQUIRED_FIELDS.includes(f) ? "#7f1d1d" : "#78350f"}`
                      }}>{f} {REQUIRED_FIELDS.includes(f)?"(required)":"(optional)"}</span>
                    ))}
                  </div>
                </div>
              )}
              {detailLoading ? <Loader /> : (
                <div style={s.detailGrid}>
                  <div style={s.detailLeft}>
                    <InfoCard title="ENROLLMENT">
                      <Row label="Token" value={selectedDevice.enrollmentToken} mono />
                      <Row label="Enrolled At" value={new Date(selectedDevice.enrolledAt).toLocaleString()} />
                      <Row label="Device ID" value={selectedDevice.deviceId} mono />
                    </InfoCard>
                    {deviceInfo ? (
                      <InfoCard title="HARDWARE & SOFTWARE">
                        <Row label="Model" value={deviceInfo.model} missing={!deviceInfo.model} />
                        <Row label="Manufacturer" value={deviceInfo.manufacturer} missing={!deviceInfo.manufacturer} />
                        <Row label="Android Version" value={deviceInfo.osVersion} missing={!deviceInfo.osVersion} />
                        <Row label="SDK Level" value={String(deviceInfo.sdkVersion||"")} missing={!deviceInfo.sdkVersion} />
                        <Row label="Serial" value={deviceInfo.serialNumber||"Restricted"} mono restricted={!deviceInfo.serialNumber||deviceInfo.serialNumber==="RESTRICTED"} />
                        <Row label="UUID" value={deviceInfo.uuid} mono missing={!deviceInfo.uuid} />
                        <Row label="IMEI" value={deviceInfo.imei||"Restricted"} mono restricted={!deviceInfo.imei} />
                      </InfoCard>
                    ) : (
                      <div style={s.noDataCard}>
                        <div style={s.noDataIcon}>⚠</div>
                        <div style={s.noDataTitle}>No Device Info</div>
                        <div style={s.noDataDesc}>This device has not sent hardware information yet.</div>
                      </div>
                    )}
                  </div>
                  <div style={s.appPanel}>
                    <div style={s.appPanelHead}>
                      <div style={s.appPanelTitle}>APP INVENTORY</div>
                      <div style={s.appBadges}>
                        <span style={s.userBadge}>{userApps.length} user</span>
                        <span style={s.sysBadge}>{systemApps.length} system</span>
                      </div>
                    </div>
                    {appInventory.length === 0 ? (
                      <div style={s.noDataCard}>
                        <div style={s.noDataIcon}>📦</div>
                        <div style={s.noDataTitle}>No App Inventory</div>
                        <div style={s.noDataDesc}>This device has not synced its app list yet.</div>
                      </div>
                    ) : (
                      <>
                        <div style={s.searchWrap}>
                          <input style={s.searchInput} placeholder="Search applications…"
                            value={appSearch} onChange={e => setAppSearch(e.target.value)} />
                        </div>
                        <div style={s.appScroll}>
                          {userApps.length > 0 && <>
                            <div style={s.groupLabel}>USER INSTALLED</div>
                            {userApps.map((app,i) => <AppRow key={i} app={app} />)}
                          </>}
                          {systemApps.length > 0 && <>
                            <div style={s.groupLabel}>SYSTEM</div>
                            {systemApps.map((app,i) => <AppRow key={i} app={app} />)}
                          </>}
                          {filteredApps.length === 0 && <div style={s.emptyApps}>No apps match your search.</div>}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* HEALTH CHECK */}
          {view === "health" && (
            <>
              <div style={s.pageHead}>
                <h1 style={s.pageTitle}>Health Check</h1>
                <p style={s.pageSub}>Missing or incomplete data across all enrolled devices</p>
              </div>
              <div style={s.healthSummary}>
                {Object.entries(HEALTH_COLORS).map(([key, hc]) => (
                  <div key={key} style={{...s.healthSumCard, borderColor: hc.dot+"44"}}>
                    <div style={{...s.healthSumDot, background:hc.dot, boxShadow:`0 0 8px ${hc.dot}`}}/>
                    <div style={s.healthSumCount}>{healthCounts[key]}</div>
                    <div style={s.healthSumLabel}>{hc.label}</div>
                  </div>
                ))}
              </div>
              <div style={s.healthTable}>
                <div style={s.healthTableHead}>
                  <span style={{flex:2}}>DEVICE</span>
                  <span style={{flex:2}}>STATUS</span>
                  <span style={{flex:3}}>MISSING FIELDS</span>
                  <span style={{flex:1}}>APPS</span>
                </div>
                {devices.map(d => {
                  const health = getHealthStatus(d, deviceInfoMap, appInventoryMap);
                  const hc = HEALTH_COLORS[health];
                  const info = deviceInfoMap[d.deviceId];
                  const apps = appInventoryMap[d.deviceId] || [];
                  const missing = getMissingFields(info);
                  return (
                    <div key={d.id} className="hrow" style={s.healthRow} onClick={() => loadDeviceDetails(d)}>
                      <div style={{flex:2}}>
                        <div style={s.healthRowId}>{d.deviceId.slice(0,20)}{d.deviceId.length>20?"…":""}</div>
                        <div style={s.healthRowDate}>{new Date(d.enrolledAt).toLocaleDateString()}</div>
                      </div>
                      <div style={{flex:2}}>
                        <div style={{...s.healthBadge, background:hc.bg, color:hc.text, display:"inline-flex"}}>
                          <div style={{...s.healthDot, background:hc.dot}}/>
                          {hc.label}
                        </div>
                      </div>
                      <div style={{flex:3}}>
                        {missing.length === 0 ? (
                          <span style={s.allGood}>✓ All fields present</span>
                        ) : (
                          <div style={s.missingTags}>
                            {missing.map(f => (
                              <span key={f} style={{...s.missingTag,
                                background: REQUIRED_FIELDS.includes(f)?"#2d0f0f":"#1c1a08",
                                color: REQUIRED_FIELDS.includes(f)?"#f87171":"#facc15",
                                border:`1px solid ${REQUIRED_FIELDS.includes(f)?"#7f1d1d":"#78350f"}`
                              }}>{f}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{flex:1}}>
                        <span style={s.appCount}>{apps.length}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* TOKEN */}
          {view === "token" && (
            <>
              <div style={s.pageHead}>
                <h1 style={s.pageTitle}>Enrollment Tokens</h1>
                <p style={s.pageSub}>Generate secure tokens to authorize device enrollment</p>
              </div>
              <div style={s.tokenWrap}>
                <div style={s.tokenCard}>
                  <div style={s.tokenCardTitle}>Generate Enrollment Token</div>
                  <div style={s.tokenCardDesc}>A unique token authorizes a device to enroll in your MDM. Share it with the device user — they enter it during setup.</div>
                  <button style={s.genBtn} onClick={generateToken}>Generate Token</button>
                </div>
                {generatedToken && (
                  <div style={s.tokenResult}>
                    <div style={s.tokenResTop}>
                      <div style={s.tokenResTitle}>Token Generated</div>
                      <div style={{...s.healthBadge, background:"#0d2218", color:"#4ade80", display:"inline-flex"}}>
                        <div style={{...s.healthDot, background:"#22c55e"}}/>Ready to Use
                      </div>
                    </div>
                    <div style={s.tokenResDesc}>Share this with the device user. It authorizes enrollment into your MDM system.</div>
                    <div style={s.tokenBox}>
                      <code style={s.tokenCode}>{generatedToken}</code>
                      <button style={{...s.copyBtn,...(copied?s.copiedBtn:{})}} onClick={copyToken}>
                        {copied?"✓ Copied":"Copy"}
                      </button>
                    </div>
                    <div style={s.tokenWarn}>⚠ Store this token securely. It grants device enrollment access.</div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* QR PROVISIONING */}
          {view === "qr" && (
            <>
              <div style={s.pageHead}>
                <div>
                  <h1 style={s.pageTitle}>QR Provisioning</h1>
                  <p style={s.pageSub}>Scan during device setup to auto-install MDM as Device Owner</p>
                </div>
              </div>
              <div style={s.qrWrap}>
                <div style={s.qrCard}>
                  <div style={s.qrCardTitle}>Device Owner Provisioning QR</div>
                  <div style={s.qrCardDesc}>
                    On a factory reset device, tap the welcome screen <strong style={{color:"#60a5fa"}}>6 times</strong> to open the QR scanner.
                    Android will automatically download and install the MDM app as Device Owner — no manual setup needed.
                  </div>
                  <div style={s.qrBox}>
                    <QRCode
                      value={QR_PAYLOAD}
                      size={220}
                      level="M"
                      bgColor="#ffffff"
                      fgColor="#000000"
                    />
                  </div>
                  <div style={s.qrWarnRow}>
                    <span style={s.qrWarnText}>⚠ Ensure the device has WiFi access before scanning</span>
                  </div>
                  <div style={s.qrMetaRow}>
                    <div style={s.qrMeta}><span style={s.qrMetaLabel}>APK URL</span><span style={s.qrMetaVal}>mdm-app-production.up.railway.app/mdm.apk</span></div>
                    <div style={s.qrMeta}><span style={s.qrMetaLabel}>Component</span><span style={s.qrMetaVal}>com.mdm.agent/.DeviceAdminReceiver</span></div>
                  </div>
                </div>

                <div style={s.qrStepsCard}>
                  <div style={s.qrStepsTitle}>How It Works</div>
                  {[
                    ["1", "Factory reset the target Android device"],
                    ["2", "On the welcome screen, tap 6 times to trigger QR mode"],
                    ["3", "Connect to WiFi when prompted by the setup wizard"],
                    ["4", "Point the camera at this QR code to scan it"],
                    ["5", "Android downloads & installs MDM app automatically"],
                    ["6", "App enrolls as Device Owner and sends data to dashboard"],
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function NavBtn({ icon, label, active, onClick, badge }) {
  return (
    <button style={{...s.navItem,...(active?s.navItemActive:{})}} onClick={onClick}>
      <span style={{color: active?"#3b82f6":"#4b5563"}}>{icon}</span>
      <span style={{flex:1}}>{label}</span>
      {badge && <span style={s.navBadge}>{badge}</span>}
    </button>
  );
}

function InfoCard({ title, children }) {
  return (
    <div style={s.infoCard}>
      <div style={s.infoCardTitle}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value, mono, missing, restricted }) {
  return (
    <div style={s.row}>
      <span style={s.rowLabel}>{label}</span>
      <span style={{
        ...s.rowValue,
        ...(mono?{fontFamily:"monospace",fontSize:11}:{}),
        ...(missing?{color:"#f87171"}:{}),
        ...(restricted?{color:"#facc15"}:{})
      }}>{value||"—"}</span>
    </div>
  );
}

function AppRow({ app }) {
  return (
    <div className="arow" style={s.appRow}>
      <div style={s.appAvatar}>{app.appName?.[0]?.toUpperCase()||"?"}</div>
      <div style={s.appInfo}>
        <div style={s.appName}>{app.appName}</div>
        <div style={s.appPkg}>{app.packageName}</div>
      </div>
      <div style={s.appVer}>{app.versionName}</div>
    </div>
  );
}

function Loader() {
  return (
    <div style={{display:"flex",justifyContent:"center",padding:80}}>
      <div style={{width:32,height:32,border:"3px solid #1e2d45",borderTop:"3px solid #3b82f6",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
    </div>
  );
}

function Spinner() {
  return <div style={{width:12,height:12,border:"2px solid #93c5fd",borderTop:"2px solid #fff",borderRadius:"50%",animation:"spin 0.7s linear infinite",marginRight:6,display:"inline-block"}}/>
}

function PhoneIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17 1H7C5.9 1 5 1.9 5 3v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-2-2-2zm-5 20c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm5-4H7V3h10v14z"/></svg>; }
function KeyIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>; }
function AlertIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>; }
function SyncIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{marginRight:6}}><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>; }
function QrIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M3 11h8V3H3v8zm2-6h4v4H5V5zm8-2v8h8V3h-8zm6 6h-4V5h4v4zM3 21h8v-8H3v8zm2-6h4v4H5v-4zm13 0h-2v2h2v-2zm0 4h-2v2h2v-2zm2-4h-2v2h2v-2zm-4-2h-2v2h2v-2zm2 2h-2v2h2v-2zm2 2h-2v2h2v-2zm-2 2h-2v2h2v-2z"/></svg>; }

const s = {
  root:{display:"flex",height:"100vh",background:"#070b14",color:"#e2e8f0",fontFamily:"-apple-system,'SF Pro Display','Segoe UI',sans-serif",overflow:"hidden"},
  sidebar:{width:240,background:"#0a0f1e",borderRight:"1px solid #111827",display:"flex",flexDirection:"column",flexShrink:0},
  brand:{display:"flex",alignItems:"center",gap:12,padding:"22px 18px",borderBottom:"1px solid #111827"},
  brandLogo:{width:40,height:40,background:"#0f1f3d",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center"},
  brandName:{fontSize:15,fontWeight:900,color:"#f1f5f9",letterSpacing:-0.3},
  brandSub:{fontSize:10,color:"#1e3a5f",letterSpacing:0.5,marginTop:1,fontWeight:700},
  navSection:{padding:"20px 10px 0"},
  navLabel:{fontSize:10,color:"#1e3a5f",letterSpacing:1.8,padding:"0 8px 10px",fontWeight:900},
  navItem:{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 12px",borderRadius:10,border:"none",background:"transparent",color:"#4b5563",cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:700,textAlign:"left",marginBottom:3},
  navItemActive:{background:"#0f1f3d",color:"#e2e8f0"},
  navBadge:{background:"#ef4444",color:"#fff",fontSize:10,fontWeight:900,padding:"2px 7px",borderRadius:20,marginLeft:"auto"},
  sidebarBottom:{marginTop:"auto",padding:16,borderTop:"1px solid #111827"},
  statusPill:{display:"flex",alignItems:"center",gap:8,background:"#060e1c",borderRadius:10,padding:"9px 12px",border:"1px solid #0f1a2e"},
  statusDot:{width:7,height:7,borderRadius:"50%",background:"#22c55e",boxShadow:"0 0 8px #22c55e"},
  statusLabel:{fontSize:11,color:"#1e3a5f",fontWeight:700},
  mainWrap:{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"},
  topBar:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 28px",height:56,background:"#08101e",borderBottom:"1px solid #111827",flexShrink:0},
  breadcrumb:{display:"flex",alignItems:"center",gap:8,fontSize:13,fontWeight:700},
  breadcrumbRoot:{cursor:"pointer",color:"#3b82f6"},
  sep:{color:"#1e2d45",fontSize:16},
  breadcrumbCur:{color:"#6b7280"},
  syncBtn:{display:"flex",alignItems:"center",padding:"8px 16px",background:"#1e3a8a",border:"1px solid #2563eb",borderRadius:8,color:"#93c5fd",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:800},
  syncDoneBtn:{background:"#14532d",border:"1px solid #22c55e",color:"#4ade80"},
  actionBtn:{padding:"8px 16px",background:"#1d4ed8",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:800},
  page:{flex:1,overflowY:"auto",padding:"24px 28px"},
  errorBar:{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#1a0808",border:"1px solid #7f1d1d",borderRadius:10,padding:"10px 16px",marginBottom:20,fontSize:13,color:"#fca5a5",fontWeight:700},
  errX:{background:"none",border:"none",color:"#fca5a5",cursor:"pointer",fontSize:16},
  pageHead:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22},
  pageTitle:{margin:0,fontSize:24,fontWeight:900,color:"#f1f5f9",letterSpacing:-0.6},
  pageSub:{margin:"4px 0 0",fontSize:12,color:"#374151",fontWeight:700},
  filterRow:{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"},
  filterPill:{padding:"6px 14px",background:"#0a1020",border:"1px solid #1e2d45",borderRadius:20,color:"#4b5563",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700},
  filterPillActive:{background:"#1e3a8a",border:"1px solid #3b82f6",color:"#93c5fd"},
  deviceGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:16},
  deviceCard:{background:"#0a1020",border:"1px solid #111827",borderRadius:16,padding:20,cursor:"pointer"},
  dcTop:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14},
  dcAvatar:{width:46,height:46,borderRadius:12,background:"#0f1f3d",border:"1px solid #1e3a5f",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:900,color:"#3b82f6"},
  healthBadge:{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:20,fontSize:11,fontWeight:800},
  healthDot:{width:6,height:6,borderRadius:"50%",flexShrink:0},
  dcId:{fontSize:13,fontWeight:800,color:"#e2e8f0",marginBottom:4},
  dcModel:{fontSize:12,fontWeight:700,color:"#3b82f6",marginBottom:4},
  dcMeta:{fontSize:11,color:"#374151",fontFamily:"monospace",fontWeight:600,marginBottom:3},
  dcDate:{fontSize:11,color:"#374151",fontWeight:600,marginBottom:10},
  dcMissingRow:{display:"flex",alignItems:"center",gap:4,marginBottom:10},
  dcMissingLabel:{fontSize:10,color:"#f59e0b",fontWeight:800},
  dcMissingFields:{fontSize:10,color:"#78350f",fontWeight:700},
  dcLink:{fontSize:12,color:"#2563eb",fontWeight:800},
  empty:{gridColumn:"1/-1",padding:60,textAlign:"center"},
  emptyT:{fontSize:14,fontWeight:700,color:"#374151"},
  backBtn:{width:36,height:36,borderRadius:10,background:"#0f1f3d",border:"1px solid #1e3a5f",color:"#3b82f6",cursor:"pointer",fontSize:22,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontWeight:900},
  dcAvatarLg:{width:50,height:50,borderRadius:13,background:"#0f1f3d",border:"2px solid #1e3a5f",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:900,color:"#3b82f6",flexShrink:0},
  missingAlert:{background:"#1c1005",border:"1px solid #78350f",borderRadius:12,padding:"16px 20px",marginBottom:20},
  missingAlertTitle:{fontSize:14,fontWeight:900,color:"#f59e0b",marginBottom:6},
  missingAlertDesc:{fontSize:12,color:"#92400e",fontWeight:700,marginBottom:12},
  missingTags:{display:"flex",flexWrap:"wrap",gap:6},
  missingTag:{fontSize:11,padding:"3px 10px",borderRadius:6,fontWeight:800},
  detailGrid:{display:"grid",gridTemplateColumns:"320px 1fr",gap:18,alignItems:"start"},
  detailLeft:{display:"flex",flexDirection:"column",gap:14},
  infoCard:{background:"#0a1020",border:"1px solid #111827",borderRadius:14,overflow:"hidden"},
  infoCardTitle:{fontSize:10,fontWeight:900,color:"#1e3a5f",letterSpacing:1.8,padding:"12px 16px",borderBottom:"1px solid #111827",background:"#080e1c"},
  row:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",borderBottom:"1px solid #0d1424",gap:10},
  rowLabel:{fontSize:12,color:"#4b5563",fontWeight:700,flexShrink:0},
  rowValue:{fontSize:12,color:"#cbd5e1",fontWeight:700,textAlign:"right",wordBreak:"break-all"},
  noDataCard:{background:"#0a1020",border:"1px solid #111827",borderRadius:14,padding:28,textAlign:"center"},
  noDataIcon:{fontSize:28,marginBottom:10},
  noDataTitle:{fontSize:14,fontWeight:900,color:"#374151",marginBottom:6},
  noDataDesc:{fontSize:12,color:"#1e3a5f",fontWeight:700,lineHeight:1.5},
  appPanel:{background:"#0a1020",border:"1px solid #111827",borderRadius:14,overflow:"hidden"},
  appPanelHead:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:"1px solid #111827",background:"#080e1c"},
  appPanelTitle:{fontSize:10,fontWeight:900,color:"#1e3a5f",letterSpacing:1.8},
  appBadges:{display:"flex",gap:6},
  userBadge:{fontSize:10,padding:"3px 10px",borderRadius:20,background:"#0c2518",color:"#4ade80",fontWeight:800,border:"1px solid #14532d"},
  sysBadge:{fontSize:10,padding:"3px 10px",borderRadius:20,background:"#0d1f3c",color:"#60a5fa",fontWeight:800,border:"1px solid #1e3a5f"},
  searchWrap:{padding:"10px 12px",borderBottom:"1px solid #0d1424",background:"#080e1c"},
  searchInput:{width:"100%",background:"#0a1020",border:"1px solid #1e2d45",borderRadius:8,padding:"8px 12px",color:"#e2e8f0",fontSize:13,fontFamily:"inherit",fontWeight:700,outline:"none"},
  appScroll:{maxHeight:500,overflowY:"auto"},
  groupLabel:{fontSize:10,color:"#1e3a5f",letterSpacing:1.8,padding:"10px 16px 4px",fontWeight:900,background:"#080e1c"},
  appRow:{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",borderBottom:"1px solid #0d1424"},
  appAvatar:{width:34,height:34,borderRadius:8,background:"#0f1f3d",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:"#3b82f6",flexShrink:0},
  appInfo:{flex:1,minWidth:0},
  appName:{fontSize:12,fontWeight:800,color:"#e2e8f0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},
  appPkg:{fontSize:10,color:"#374151",fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginTop:2},
  appVer:{fontSize:10,color:"#4b5563",fontWeight:700,flexShrink:0},
  emptyApps:{padding:24,textAlign:"center",color:"#1e3a5f",fontSize:13,fontWeight:700},
  healthSummary:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:24},
  healthSumCard:{background:"#0a1020",border:"1px solid",borderRadius:14,padding:"20px 16px",textAlign:"center"},
  healthSumDot:{width:12,height:12,borderRadius:"50%",margin:"0 auto 10px"},
  healthSumCount:{fontSize:32,fontWeight:900,color:"#f1f5f9",lineHeight:1},
  healthSumLabel:{fontSize:12,color:"#4b5563",fontWeight:700,marginTop:6},
  healthTable:{background:"#0a1020",border:"1px solid #111827",borderRadius:14,overflow:"hidden"},
  healthTableHead:{display:"flex",padding:"12px 20px",background:"#080e1c",borderBottom:"1px solid #111827",fontSize:10,color:"#1e3a5f",fontWeight:900,letterSpacing:1.5},
  healthRow:{display:"flex",alignItems:"center",padding:"14px 20px",borderBottom:"1px solid #0d1424"},
  healthRowId:{fontSize:12,fontWeight:800,color:"#e2e8f0"},
  healthRowDate:{fontSize:10,color:"#374151",fontWeight:700,marginTop:3},
  allGood:{fontSize:12,color:"#4ade80",fontWeight:800},
  appCount:{fontSize:13,fontWeight:900,color:"#3b82f6"},
  tokenWrap:{display:"flex",flexDirection:"column",gap:16,maxWidth:580},
  tokenCard:{background:"#0a1020",border:"1px solid #111827",borderRadius:16,padding:28},
  tokenCardTitle:{fontSize:18,fontWeight:900,color:"#f1f5f9",marginBottom:10,letterSpacing:-0.4},
  tokenCardDesc:{fontSize:13,color:"#4b5563",fontWeight:700,lineHeight:1.6,marginBottom:22},
  genBtn:{padding:"11px 24px",background:"#1d4ed8",border:"none",borderRadius:10,color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:900},
  tokenResult:{background:"#0a1020",border:"1px solid #1e3a5f",borderRadius:16,padding:24},
  tokenResTop:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10},
  tokenResTitle:{fontSize:15,fontWeight:900,color:"#f1f5f9"},
  tokenResDesc:{fontSize:12,color:"#4b5563",fontWeight:700,marginBottom:16,lineHeight:1.5},
  tokenBox:{display:"flex",alignItems:"center",gap:12,background:"#050a14",border:"1px solid #1e3a5f",borderRadius:10,padding:"14px 16px",marginBottom:14},
  tokenCode:{flex:1,fontFamily:"monospace",fontSize:13,color:"#60a5fa",fontWeight:700,wordBreak:"break-all"},
  copyBtn:{padding:"8px 16px",background:"#1d4ed8",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:900,flexShrink:0},
  copiedBtn:{background:"#15803d"},
  tokenWarn:{fontSize:12,color:"#f59e0b",background:"#1a1005",border:"1px solid #78350f",borderRadius:8,padding:"9px 14px",fontWeight:700},
  // QR styles
  qrWrap:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,maxWidth:860},
  qrCard:{background:"#0a1020",border:"1px solid #111827",borderRadius:16,padding:28},
  qrCardTitle:{fontSize:18,fontWeight:900,color:"#f1f5f9",marginBottom:10,letterSpacing:-0.4},
  qrCardDesc:{fontSize:13,color:"#4b5563",fontWeight:700,lineHeight:1.6,marginBottom:22},
  qrBox:{background:"#fff",padding:20,display:"inline-block",borderRadius:12,marginBottom:18},
  qrWarnRow:{marginBottom:16},
  qrWarnText:{fontSize:12,color:"#f59e0b",fontWeight:700},
  qrMetaRow:{display:"flex",flexDirection:"column",gap:8,background:"#050a14",borderRadius:10,padding:14,border:"1px solid #1e2d45"},
  qrMeta:{display:"flex",flexDirection:"column",gap:2},
  qrMetaLabel:{fontSize:9,color:"#1e3a5f",fontWeight:900,letterSpacing:1.5},
  qrMetaVal:{fontSize:11,color:"#60a5fa",fontFamily:"monospace",fontWeight:700,wordBreak:"break-all"},
  qrStepsCard:{background:"#0a1020",border:"1px solid #111827",borderRadius:16,padding:28},
  qrStepsTitle:{fontSize:15,fontWeight:900,color:"#f1f5f9",marginBottom:18,letterSpacing:-0.3},
  qrStep:{display:"flex",alignItems:"flex-start",gap:14,marginBottom:16},
  qrStepNum:{width:26,height:26,borderRadius:"50%",background:"#0f1f3d",border:"1px solid #1e3a5f",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,color:"#3b82f6",flexShrink:0},
  qrStepText:{fontSize:13,color:"#6b7280",fontWeight:700,lineHeight:1.5,paddingTop:3},
  qrNote:{background:"#0d1f3c",border:"1px solid #1e3a5f",borderRadius:10,padding:"12px 14px",fontSize:12,color:"#60a5fa",fontWeight:700,lineHeight:1.5,marginTop:6},
};