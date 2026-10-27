import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import toast, { Toaster } from "react-hot-toast";
import { 
  Search, 
  Map as MapIcon, 
  LayoutDashboard, 
  List, 
  Building2, 
  SortDesc, 
  X, 
  Clock, 
  AlertCircle, 
  AlertTriangle, 
  Navigation, 
  UploadCloud, 
  Bell, 
  FileText, 
  Check, 
  Sparkles, 
  Camera, 
  Trash2, 
  ShieldCheck
} from "lucide-react";
import DetectionCard from "./DetectionCard";
import "leaflet/dist/leaflet.css";
import "./App.css";

// Fix Leaflet marker icon issue
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const API = "http://localhost:8000";
const title = (s) => (s || "Unknown").replace(/\b\w/g, c => c.toUpperCase());

// Fallback landmark coordinates for Coimbatore
const LANDMARK_COORDS = {
  "crosscut": [11.0185, 76.9634],
  "gandhipuram": [11.0175, 76.9673],
  "ukkadam": [10.9898, 76.9558],
  "peelamedu": [11.0287, 77.0016],
  "rs puram": [11.0089, 76.9489],
  "town hall": [10.9972, 76.9608],
  "main street": [11.0168, 76.9558],
  "irugur": [11.0083, 77.0658],
  "hope college": [11.0264, 77.0125],
  "saravanampatti": [11.0805, 76.9945],
};

function getCoordsForItem(item) {
  if (item.latitude && item.longitude && !isNaN(item.latitude) && !isNaN(item.longitude)) {
    return [parseFloat(item.latitude), parseFloat(item.longitude)];
  }
  const loc = (item.location || "").toLowerCase();
  for (const [key, coords] of Object.entries(LANDMARK_COORDS)) {
    if (loc.includes(key)) return coords;
  }
  // Deterministic fallback based on id
  let hash = 0;
  const idStr = item.id || "civic";
  for (let i = 0; i < idStr.length; i++) hash = idStr.charCodeAt(i) + ((hash << 5) - hash);
  const latOffset = ((hash % 100) - 50) / 1500;
  const lngOffset = (((hash >> 4) % 100) - 50) / 1500;
  return [11.0168 + latOffset, 76.9558 + lngOffset];
}

export default function App() {
  const [items, setItems] = useState([]);
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [location, setLocation] = useState("");
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [geoStatus, setGeoStatus] = useState("idle"); // idle, detecting, granted, denied
  const [geoMessage, setGeoMessage] = useState("");

  // Mode: "ai" for Roboflow AI triage, "manual" for direct intake
  const [mode, setMode] = useState("ai");
  const [manualIssue, setManualIssue] = useState("pothole");
  const [manualSeverity, setManualSeverity] = useState("medium");
  const [manualPriority, setManualPriority] = useState("medium");
  const [manualDept, setManualDept] = useState("roads");

  // Filters & Sorting
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  
  const [busy, setBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState("");
  const [duplicateAlert, setDuplicateAlert] = useState(null);
  const [view, setView] = useState("overview"); // overview, feed, map, departments
  
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [repairPhotoFile, setRepairPhotoFile] = useState(null);
  const [uploadingRepair, setUploadingRepair] = useState(false);

  // In-app Notifications System
  const [notifications, setNotifications] = useState([
    {
      id: "n-1",
      title: "System Ready",
      message: "Civic Eye prototype initialized and ready for damage reports.",
      type: "info",
      time: new Date().toLocaleTimeString()
    }
  ]);
  const [showNotifications, setShowNotifications] = useState(false);
  const locationInputRef = useRef(null);

  function addNotification(notifTitle, message, type = "info") {
    const newNotif = {
      id: "n-" + Date.now(),
      title: notifTitle,
      message,
      type,
      time: new Date().toLocaleTimeString()
    };
    setNotifications(prev => [newNotif, ...prev]);
  }

  // Handle image selection with preview
  function handleFileSelect(e) {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setFilePreview(URL.createObjectURL(selected));
    }
  }

  function clearSelectedFile() {
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFile(null);
    setFilePreview(null);
  }

  // T3 & T4: GPS Location Permission and Acquisition
  function requestGPSLocation() {
    if (!navigator.geolocation) {
      setGeoStatus("denied");
      setGeoMessage("Geolocation is not supported by your browser. Please enter location manually.");
      toast.error("Geolocation not supported. Please enter manually.");
      addNotification("Location Unavailable", "Browser does not support geolocation.", "warning");
      return;
    }

    setGeoStatus("detecting");
    setGeoMessage("Requesting GPS location permission...");
    const loadToast = toast.loading("Acquiring GPS location...");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setLatitude(lat);
        setLongitude(lng);
        setLocation(`${lat}, ${lng} (Coimbatore GPS Tagged)`);
        setGeoStatus("granted");
        setGeoMessage(`GPS locked: ${lat}, ${lng} (±${Math.round(pos.coords.accuracy)}m)`);
        toast.success(`Location obtained: ${lat}, ${lng}`, { id: loadToast });
        addNotification("GPS Location Obtained", `Captured coordinates ${lat}, ${lng}`, "success");
      },
      (err) => {
        console.warn("Geolocation permission/access denied:", err);
        setGeoStatus("denied");
        const msg = "Location permission denied or unavailable. Please enter your location manually.";
        setGeoMessage(msg);
        toast.error(msg, { id: loadToast });
        addNotification("Location Permission Denied", "GPS access was denied. Fallback to manual entry.", "warning");
        if (locationInputRef.current) {
          locationInputRef.current.focus();
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  // Preset location helper for rapid testing
  function setPresetLocation(name, lat, lng) {
    setLocation(name);
    setLatitude(lat);
    setLongitude(lng);
    setGeoStatus("granted");
    setGeoMessage(`Preset selected: ${lat}, ${lng}`);
    toast.success(`Selected preset: ${name}`);
  }

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${API}/api/complaints`);
      if (!response.ok) throw new Error("Could not load complaints from server");
      const data = await response.json();
      setItems(data);
    } catch (err) {
      setError(err.message);
      toast.error("Failed to connect to backend server");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`${API}/api/complaints`)
      .then(res => {
        if (!res.ok) throw new Error("Could not load complaints from server");
        return res.json();
      })
      .then(data => {
        if (active) setItems(data);
      })
      .catch(err => {
        if (active) {
          setError(err.message);
          toast.error("Failed to connect to backend server");
        }
      })
      .finally(() => {
        if (active) setInitialLoading(false);
      });
    return () => { active = false; };
  }, []);

  // Submit Report (AI or Manual)
  async function submit(e) {
    e.preventDefault();
    if (!location.trim()) {
      toast.error("Please enter a location or tag GPS.");
      return;
    }
    if (mode === "ai" && !file) {
      toast.error("Please choose a damage photo for AI classification.");
      return;
    }

    setBusy(true);
    setError("");
    setDuplicateAlert(null);
    const loadToast = toast.loading(mode === "ai" ? "Analyzing image with AI triage..." : "Saving manual report...");

    try {
      const body = new FormData();
      if (file) body.append("image", file);
      body.append("location", location.trim());
      if (latitude) body.append("latitude", String(latitude));
      if (longitude) body.append("longitude", String(longitude));

      let endpoint = `${API}/api/analyze`;
      if (mode === "manual") {
        endpoint = `${API}/api/complaints/manual`;
        body.append("issue_type", manualIssue);
        body.append("severity", manualSeverity);
        body.append("priority", manualPriority);
        body.append("department", manualDept);
      }

      const response = await fetch(endpoint, {
        method: "POST",
        body,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Submission failed");

      await refresh();
      clearSelectedFile();
      setLocation("");
      setLatitude(null);
      setLongitude(null);
      setGeoStatus("idle");
      setGeoMessage("");

      // T8: Check duplicate detection response
      if (result.has_duplicate || result.is_duplicate) {
        const warning = result.duplicate_warning || "Potential duplicate detected: a similar open issue was previously reported for this location.";
        setDuplicateAlert(warning);
        toast("⚠️ Duplicate report flagged for this location.", { id: loadToast, icon: "⚠️" });
        addNotification("Potential Duplicate Flagged", warning, "warning");
      } else {
        const count = result.complaint_count || 1;
        toast.success(`Report accepted & saved! (${count} issue recorded)`, { id: loadToast });
        addNotification("New Report Submitted", `Report saved for ${location.trim()}`, "success");
      }
    } catch (e) {
      setError(e.message);
      toast.error(e.message, { id: loadToast });
      addNotification("Submission Failed", e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  // T9: Change a report's status
  async function updateStatus(id, newStatus) {
    const loadToast = toast.loading(`Updating status to ${title(newStatus)}...`);
    try {
      const body = new FormData();
      body.append("status", newStatus);
      const res = await fetch(`${API}/api/complaints/${id}/status`, {
        method: "POST",
        body
      });
      if (!res.ok) throw new Error("Update failed on backend");
      
      // Update local list
      setItems(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
      
      // Update modal if open
      if (selectedComplaint && selectedComplaint.id === id) {
        setSelectedComplaint(prev => ({ ...prev, status: newStatus }));
      }
      
      toast.success(`Status updated to ${title(newStatus)}`, { id: loadToast });
      addNotification("Report Status Updated", `Complaint #${id.slice(0, 8)} status changed to ${title(newStatus)}`, "success");
    } catch (e) {
      toast.error("Failed to update status", { id: loadToast });
      addNotification("Status Update Failed", e.message, "error");
    }
  }

  // T10: Upload post-repair photo for comparison
  async function handleRepairPhotoUpload(complaintId, fileOverride = null) {
    const photo = fileOverride || repairPhotoFile;
    if (!photo) {
      toast.error("Please choose a repair photograph first.");
      return;
    }
    setUploadingRepair(true);
    const loadToast = toast.loading("Uploading post-repair verification photo...");
    try {
      const body = new FormData();
      body.append("image", photo);
      const res = await fetch(`${API}/api/complaints/${complaintId}/repair-photo`, {
        method: "POST",
        body
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Repair upload failed");

      // Update complaint in state
      setItems(prev => prev.map(c => c.id === complaintId ? { ...c, repair_image_url: data.repair_image_url } : c));
      if (selectedComplaint && selectedComplaint.id === complaintId) {
        setSelectedComplaint(prev => ({ ...prev, repair_image_url: data.repair_image_url }));
      }
      setRepairPhotoFile(null);
      toast.success("Post-repair photo attached successfully!", { id: loadToast });
      addNotification("Repair Photo Uploaded", `Reviewer inspection photo attached to #${complaintId.slice(0, 8)}. Physical review required before resolution.`, "info");
    } catch (err) {
      toast.error(err.message, { id: loadToast });
    } finally {
      setUploadingRepair(false);
    }
  }

  // Delete a complaint
  async function deleteComplaint(complaintId) {
    if (!window.confirm("Are you sure you want to permanently delete this report?")) return;
    const loadToast = toast.loading("Deleting complaint...");
    try {
      const res = await fetch(`${API}/api/complaints/${complaintId}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Failed to delete complaint on backend");
      setItems(prev => prev.filter(c => c.id !== complaintId));
      if (selectedComplaint && selectedComplaint.id === complaintId) {
        setSelectedComplaint(null);
      }
      toast.success("Incident report deleted successfully", { id: loadToast });
      addNotification("Report Deleted", `Complaint #${complaintId.slice(0, 8)} removed from database.`, "info");
    } catch (err) {
      toast.error(err.message, { id: loadToast });
    }
  }

  function exportCSV() {
    if (items.length === 0) {
      toast.error("No reports to export.");
      return;
    }
    const headers = ["ID", "Issue", "Department", "Location", "Latitude", "Longitude", "Priority", "Severity", "Status", "Reported At"];
    const rows = items.map(c => [
      c.id, c.issue_type, c.department, `"${c.location || ''}"`, c.latitude || '', c.longitude || '', c.priority, c.severity, c.status, c.reported_at
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `civiceye_reports_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Exported reports to CSV successfully");
  }
  
  // T12: Trigger report notification simulation
  function triggerTestNotification() {
    const dummyTypes = ["Pothole", "Streetlight Outage", "Water Leakage", "Garbage Overflow"];
    const randomType = dummyTypes[Math.floor(Math.random() * dummyTypes.length)];
    const randomLoc = ["Peelamedu", "Gandhipuram Crosscut", "RS Puram", "Town Hall"][Math.floor(Math.random() * 4)];
    
    toast.success(`⚡ Notification: New ${randomType} reported at ${randomLoc}!`);
    addNotification(`New Citizen Report: ${randomType}`, `Incoming report at ${randomLoc}. Assigned to department.`, "info");
  }

  // T11: Filtering & Sorting
  const visible = useMemo(() => {
    let filtered = items.filter(c => {
      const matchPriority = filterPriority === "all" || (c.priority || "").toLowerCase() === filterPriority.toLowerCase();
      const matchStatus = filterStatus === "all" || (c.status || "").toLowerCase() === filterStatus.toLowerCase();
      return matchPriority && matchStatus;
    });
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(c => 
        (c.location && c.location.toLowerCase().includes(q)) || 
        (c.issue_type && c.issue_type.toLowerCase().includes(q)) ||
        (c.department && c.department.toLowerCase().includes(q)) ||
        (c.id && c.id.toLowerCase().includes(q))
      );
    }
    
    filtered.sort((a, b) => {
      if (sortBy === "oldest") return new Date(a.reported_at) - new Date(b.reported_at);
      if (sortBy === "severity") {
        const p = { "high": 3, "medium": 2, "low": 1 };
        return (p[b.severity] || 0) - (p[a.severity] || 0);
      }
      return new Date(b.reported_at) - new Date(a.reported_at); // default newest
    });
    
    return filtered;
  }, [items, filterPriority, filterStatus, searchQuery, sortBy]);
  
  const highPriorityCount = items.filter(c => (c.priority || "").toLowerCase() === "high").length;
  const inProgressCount = items.filter(c => (c.status || "").toLowerCase() === "in progress").length;
  const resolvedCount = items.filter(c => (c.status || "").toLowerCase() === "resolved").length;
  const departmentsList = [...new Set(items.map(c => title(c.department)))];

  const chartData = useMemo(() => {
    const counts = {};
    items.forEach(item => {
      const dept = title(item.department);
      counts[dept] = (counts[dept] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count);
  }, [items]);

  return (
    <div className="app">
      <Toaster position="top-right" />
      
      {/* SIDEBAR NAVIGATION */}
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">◈</span> Civic<span>Eye</span>
        </div>
        <div className={`nav ${view === "overview" ? "active" : ""}`} onClick={() => setView("overview")}>
          <LayoutDashboard size={18} className="nav-icon" /> Dashboard
        </div>
        <div className={`nav ${view === "feed" ? "active" : ""}`} onClick={() => setView("feed")}>
          <List size={18} className="nav-icon" /> Reports Feed
        </div>
        <div className={`nav ${view === "map" ? "active" : ""}`} onClick={() => setView("map")}>
          <MapIcon size={18} className="nav-icon" /> Map View
        </div>
        <div className={`nav ${view === "departments" ? "active" : ""}`} onClick={() => setView("departments")}>
          <Building2 size={18} className="nav-icon" /> Departments
        </div>
        
        <div className="mt-auto flex flex-col gap-3">
          <button onClick={triggerTestNotification} className="btn-secondary" style={{ width: '100%', fontSize: '12px' }}>
            🔔 Trigger Notification (T12)
          </button>
          <div className="sidebar-foot">
            <strong>Civic Eye Prototype</strong><br />
            Verified Software Platform<br />
            <small style={{ color: "var(--accent)" }}>Coimbatore Municipal Grid</small>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main>
        <header>
          <div>
            <div className="eyebrow">INFRASTRUCTURE DAMAGE DETECTION & MANAGEMENT</div>
            <h1>Municipal Operations Center</h1>
            <p className="muted">Citizen damage reports, AI-assisted verification, and field repair tracking.</p>
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <button 
              className="notif-bell-btn" 
              onClick={() => setShowNotifications(!showNotifications)}
              title="View System Notifications"
            >
              <Bell size={16} />
              Notifications
              {notifications.length > 0 && (
                <span className="notif-badge-pill">{notifications.length}</span>
              )}
            </button>
            <button className="btn-secondary" onClick={exportCSV}>↓ Export CSV</button>
            <div className="live"><i /> System active</div>
          </div>
        </header>

        {/* NOTIFICATION DRAWER / PANEL (T12) */}
        {showNotifications && (
          <div className="notif-drawer">
            <div className="notif-header">
              <h4>System Notifications ({notifications.length})</h4>
              <button className="modal-close" style={{ position: 'static', width: '28px', height: '28px' }} onClick={() => setShowNotifications(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="notif-list">
              {notifications.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No notifications yet.
                </div>
              ) : (
                notifications.map(n => (
                  <div key={n.id} className="notif-item">
                    <span className="notif-icon">
                      {n.type === "success" ? "✅" : n.type === "warning" ? "⚠️" : n.type === "error" ? "❌" : "🔔"}
                    </span>
                    <div style={{ flex: 1 }}>
                      <strong>{n.title}</strong>
                      <p className="notif-text">{n.message}</p>
                      <div className="notif-time">{n.time}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* VIEW 1: DASHBOARD OVERVIEW */}
        {view === "overview" && (
          <div className="view-animate">
            <section className="stats">
              <div className="stat">
                <label>TOTAL COMPLAINTS</label>
                <strong>{initialLoading ? "..." : items.length}</strong>
                <small>Stored in database</small>
              </div>
              <div className="stat">
                <label>HIGH PRIORITY</label>
                <strong style={{ color: "#ef4444" }}>{initialLoading ? "..." : highPriorityCount}</strong>
                <small>Requiring urgent action</small>
              </div>
              <div className="stat">
                <label>IN PROGRESS</label>
                <strong style={{ color: "#f59e0b" }}>{initialLoading ? "..." : inProgressCount}</strong>
                <small>Field crews assigned</small>
              </div>
              <div className="stat">
                <label>RESOLVED</label>
                <strong style={{ color: "#10b981" }}>{initialLoading ? "..." : resolvedCount}</strong>
                <small>Repair verified</small>
              </div>
              <div className="panel" style={{ padding: "15px" }}>
                <label className="stat" style={{ padding: 0, paddingBottom: 10, fontSize: "11px", fontWeight: "bold", color: "var(--text-muted)", letterSpacing: "1px" }}>DEPT. DISTRIBUTION</label>
                <div className="chart-container" style={{ height: "70px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{top: 5, right: 10, left: -25, bottom: 0}}>
                      <XAxis dataKey="name" tick={{fontSize: 10, fill: "var(--text-muted)"}} axisLine={false} tickLine={false} />
                      <YAxis tick={{fontSize: 10, fill: "var(--text-muted)"}} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{fill: "rgba(0,0,0,0.05)"}} contentStyle={{ borderRadius: "8px", border: "1px solid var(--border)", fontSize: "12px", color: "var(--primary)" }} />
                      <Bar dataKey="count" fill="var(--accent)" radius={[4,4,0,0]} barSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            <div className="grid">
              {/* CITIZEN INTAKE PANEL (Checklist 1, T1, T2, T3, T4, T6, T8) */}
              <section className="panel submit">
                <div className="panel-heading">
                  <span>01 / CITIZEN INTAKE</span>
                  <h2>Submit a Damage Report</h2>
                </div>

                {/* MODE TOGGLE: AI-Assisted vs Manual Entry */}
                <div className="mode-toggle">
                  <button 
                    type="button"
                    className={`mode-btn ${mode === "ai" ? "active" : ""}`}
                    onClick={() => setMode("ai")}
                  >
                    <Sparkles size={14} /> AI Photo Triage (T6)
                  </button>
                  <button 
                    type="button"
                    className={`mode-btn ${mode === "manual" ? "active" : ""}`}
                    onClick={() => setMode("manual")}
                  >
                    <FileText size={14} /> Manual Report Entry (T2)
                  </button>
                </div>

                <form onSubmit={submit}>
                  {/* PHOTO UPLOAD & PREVIEW (T1) */}
                  <label className="field-label">DAMAGE PHOTOGRAPH</label>
                  {filePreview ? (
                    <div className="upload-preview-box">
                      <img src={filePreview} alt="Selected preview" />
                      <button type="button" className="remove-preview-btn" onClick={clearSelectedFile}>
                        <Trash2 size={12} /> Remove
                      </button>
                    </div>
                  ) : (
                    <label className="upload">
                      <span className="upload-icon">↥</span>
                      <b>Choose or drag a damage photo</b>
                      <small>JPEG, PNG or WebP • up to 10 MB</small>
                      <input 
                        type="file" 
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleFileSelect} 
                        required={mode === "ai"} 
                      />
                    </label>
                  )}

                  {/* MANUAL MODE FIELDS */}
                  {mode === "manual" && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', margin: '12px 0' }}>
                      <div>
                        <label className="field-label">ISSUE CATEGORY</label>
                        <select 
                          className="field" 
                          value={manualIssue} 
                          onChange={e => setManualIssue(e.target.value)}
                        >
                          <option value="pothole">Pothole</option>
                          <option value="road crack">Road Surface Crack</option>
                          <option value="garbage overflow">Garbage Overflow</option>
                          <option value="water leakage">Water Leakage</option>
                          <option value="streetlight outage">Streetlight Outage</option>
                          <option value="damaged signage">Damaged Signage / Manhole</option>
                        </select>
                      </div>
                      <div>
                        <label className="field-label">SEVERITY LEVEL</label>
                        <select 
                          className="field" 
                          value={manualSeverity} 
                          onChange={e => setManualSeverity(e.target.value)}
                        >
                          <option value="high">High</option>
                          <option value="medium">Medium</option>
                          <option value="low">Low</option>
                        </select>
                      </div>
                      <div>
                        <label className="field-label">PRIORITY</label>
                        <select 
                          className="field" 
                          value={manualPriority} 
                          onChange={e => setManualPriority(e.target.value)}
                        >
                          <option value="high">High</option>
                          <option value="medium">Medium</option>
                          <option value="low">Low</option>
                        </select>
                      </div>
                      <div>
                        <label className="field-label">DEPARTMENT</label>
                        <select 
                          className="field" 
                          value={manualDept} 
                          onChange={e => setManualDept(e.target.value)}
                        >
                          <option value="roads">Roads & Highways</option>
                          <option value="sanitation">Sanitation</option>
                          <option value="electrical">Electrical / Streetlights</option>
                          <option value="water authority">Water Supply</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* LOCATION ENTRY & GPS DETECTION (T3 & T4) */}
                  <div style={{ marginTop: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className="field-label">INCIDENT LOCATION</label>
                      <button 
                        type="button" 
                        className="geo-btn" 
                        onClick={requestGPSLocation}
                        title="Acquire current GPS coordinates (T3/T4)"
                        style={{ padding: '4px 10px', fontSize: '11px', marginBottom: '4px' }}
                      >
                        <Navigation size={12} /> Auto-Detect GPS (T3/T4)
                      </button>
                    </div>
                    
                    <div className="location-input-group">
                      <input 
                        ref={locationInputRef}
                        className="field" 
                        placeholder="e.g. Main Street, Gandhipuram (or click GPS)"
                        value={location} 
                        onChange={e => setLocation(e.target.value)} 
                        required 
                      />
                    </div>

                    {/* GPS Feedback message and badges */}
                    {geoStatus === "granted" && (
                      <div className="geo-badge granted">
                        <Check size={12} /> {geoMessage}
                      </div>
                    )}
                    {geoStatus === "denied" && (
                      <div className="geo-badge denied">
                        <AlertTriangle size={12} /> {geoMessage}
                      </div>
                    )}

                    {/* Quick Preset Location Selector for Fast Testing */}
                    <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <small style={{ color: 'var(--text-muted)', fontSize: '11px', alignSelf: 'center' }}>Test Presets:</small>
                      <button type="button" className="btn-secondary" style={{ padding: '2px 8px', fontSize: '11px' }}
                        onClick={() => setPresetLocation("Main Street, Coimbatore", 11.0168, 76.9558)}>
                        Main Street
                      </button>
                      <button type="button" className="btn-secondary" style={{ padding: '2px 8px', fontSize: '11px' }}
                        onClick={() => setPresetLocation("Crosscut Road, Gandhipuram", 11.0185, 76.9634)}>
                        Crosscut Road
                      </button>
                      <button type="button" className="btn-secondary" style={{ padding: '2px 8px', fontSize: '11px' }}
                        onClick={() => setPresetLocation("Ukkadam Lake", 10.9898, 76.9558)}>
                        Ukkadam Lake
                      </button>
                    </div>
                  </div>

                  {/* DUPLICATE WARNING ALERT (T8) */}
                  {duplicateAlert && (
                    <div className="duplicate-alert-banner">
                      <AlertTriangle size={18} />
                      <div>
                        <strong>Duplicate Issue Flagged (T8)</strong>
                        <p style={{ margin: 0, fontSize: '12px' }}>{duplicateAlert}</p>
                      </div>
                    </div>
                  )}

                  {/* SUBMISSION BUTTON */}
                  <button 
                    style={{ marginTop: '18px' }}
                    disabled={busy || !location.trim() || (mode === "ai" && !file)}
                  >
                    {busy 
                      ? (mode === "ai" ? "Analyzing photo with AI model…" : "Saving report…")
                      : (mode === "ai" ? "Analyze with AI & Submit → (T6)" : "Save Report to Database → (T2)")
                    }
                  </button>
                  
                  {error && <p className="error" role="alert" style={{ marginTop: '10px' }}>{error}</p>}
                </form>
              </section>

              {/* RECENT REPORTS QUEUE (Checklist 3, T11) */}
              <section className="panel feed">
                <div className="panel-heading" style={{ flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <span>02 / RECENT DISPATCH QUEUE</span>
                    <h2>Complaint Feed</h2>
                  </div>
                  
                  {/* Quick Priority Filter */}
                  <div className="filters">
                    {["all", "high", "medium", "low"].map(x =>
                      <button 
                        key={x} 
                        className={filterPriority === x ? "selected" : ""}
                        onClick={() => setFilterPriority(x)}
                      >
                        {title(x)}
                      </button>
                    )}
                  </div>
                </div>

                <div className="cards">
                  {initialLoading ? (
                    <div className="skeleton-cards">
                      <div className="skeleton-card skeleton"></div>
                      <div className="skeleton-card skeleton"></div>
                      <div className="skeleton-card skeleton"></div>
                    </div>
                  ) : visible.length === 0 ? (
                    <div className="empty">No reports match your current filters.</div>
                  ) : (
                    visible.slice(0, 5).map(c => (
                      <div key={c.id} onClick={() => setSelectedComplaint(c)} className="cursor-pointer">
                        <DetectionCard 
                          complaint={c} 
                          apiBase={API} 
                          toggleStatus={(id, s) => updateStatus(id, s)} 
                        />
                      </div>
                    ))
                  )}
                  
                  {visible.length > 5 && (
                    <button className="btn-secondary" style={{ width: '100%' }} onClick={() => setView("feed")}>
                      View all {visible.length} reports in full feed →
                    </button>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* VIEW 2: FULL COMPLAINT FEED (T11) */}
        {view === "feed" && (
          <section className="panel feed view-animate">
            <div className="panel-heading" style={{ flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h2>All Incident Reports</h2>
                <p className="muted">Filter by status, severity, or search by address and damage type.</p>
              </div>
              
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="search-bar">
                  <Search size={16} />
                  <input 
                    type="text" 
                    placeholder="Search location, issue..." 
                    value={searchQuery} 
                    onChange={e => setSearchQuery(e.target.value)} 
                  />
                </div>
                
                <div className="sort-dropdown">
                  <SortDesc size={16} />
                  <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="severity">Highest Severity</option>
                  </select>
                </div>
              </div>
            </div>

            {/* DUAL FILTERS: STATUS & PRIORITY (T11) */}
            <div style={{ display: 'flex', gap: '20px', padding: '10px 0 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <div className="filter-group">
                <span className="filter-label">Status:</span>
                <div className="filters">
                  {["all", "new", "in progress", "resolved"].map(x => (
                    <button 
                      key={x} 
                      className={filterStatus === x ? "selected" : ""}
                      onClick={() => setFilterStatus(x)}
                    >
                      {title(x)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="filter-group">
                <span className="filter-label">Priority:</span>
                <div className="filters">
                  {["all", "high", "medium", "low"].map(x => (
                    <button 
                      key={x} 
                      className={filterPriority === x ? "selected" : ""}
                      onClick={() => setFilterPriority(x)}
                    >
                      {title(x)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(550px, 1fr))', gap: '20px', marginTop: '20px' }}>
              {initialLoading ? (
                <div className="skeleton-cards">
                  <div className="skeleton-card skeleton"></div>
                  <div className="skeleton-card skeleton"></div>
                </div>
              ) : visible.length === 0 ? (
                <div className="empty" style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '40px', marginBottom: '16px' }}>📭</div>
                  <h3>No reports match the selected filters</h3>
                  <p>Try resetting the priority or status filters above.</p>
                </div>
              ) : (
                visible.map(c => (
                  <div key={c.id} onClick={() => setSelectedComplaint(c)} className="cursor-pointer h-full">
                    <DetectionCard 
                      complaint={c} 
                      apiBase={API} 
                      toggleStatus={(id, s) => updateStatus(id, s)} 
                    />
                  </div>
                ))
              )}
            </div>
          </section>
        )}
        
        {/* VIEW 3: INTERACTIVE GEOGRAPHIC MAP (Checklist 2, T5) */}
        {view === "map" && (
          <section className="panel view-animate" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)' }}>
            <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2>Interactive Incident Map (T5)</h2>
                <p className="muted">Displays reported infrastructure issues mapped to their recorded GPS coordinates.</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Showing {visible.length} mapped reports</span>
              </div>
            </div>
            <div className="map-container" style={{ flex: 1, borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <MapContainer center={[11.0168, 76.9558]} zoom={13} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="&copy; OpenStreetMap contributors"
                />
                {visible.map(item => {
                  const coords = getCoordsForItem(item);
                  return (
                    <Marker key={item.id} position={coords}>
                      <Popup>
                        <div style={{ minWidth: '180px' }}>
                          <strong style={{ fontSize: '14px' }}>{title(item.issue_type)}</strong>
                          <div style={{ fontSize: '11px', color: '#64748b', margin: '4px 0' }}>
                            📍 {item.location || "Coimbatore"}
                          </div>
                          {item.latitude && item.longitude && (
                            <div style={{ fontSize: '10px', color: '#0369a1', fontFamily: 'monospace' }}>
                              GPS: {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                            </div>
                          )}
                          <div style={{ margin: '6px 0', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            <span className={`badge ${(item.priority || 'medium').toLowerCase()}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
                              {title(item.priority)}
                            </span>
                            <span style={{ 
                              fontSize: '10px', 
                              padding: '2px 6px', 
                              borderRadius: '4px',
                              background: item.status === 'resolved' ? '#dcfce7' : item.status === 'in progress' ? '#fef3c7' : '#f1f5f9',
                              color: item.status === 'resolved' ? '#166534' : item.status === 'in progress' ? '#92400e' : '#475569',
                              fontWeight: 600
                            }}>
                              {title(item.status)}
                            </span>
                          </div>
                          <button 
                            className="btn-secondary" 
                            style={{ marginTop: '8px', width: '100%', padding: '4px 8px', fontSize: '11px' }} 
                            onClick={() => setSelectedComplaint(item)}
                          >
                            Inspect Report Details →
                          </button>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            </div>
          </section>
        )}

        {/* VIEW 4: DEPARTMENTS OVERVIEW */}
        {view === "departments" && (
          <section className="panel view-animate">
            <div className="panel-heading">
              <div>
                <h2>Department Operations</h2>
                <p className="muted">Resolution rate and volume by civic administration department.</p>
              </div>
            </div>
            
            <div className="dept-grid">
              {departmentsList.map(deptName => {
                const deptItems = items.filter(i => title(i.department) === deptName);
                const resolved = deptItems.filter(i => i.status === 'resolved').length;
                const resolveRate = deptItems.length ? Math.round((resolved / deptItems.length) * 100) : 0;
                const highPrio = deptItems.filter(i => (i.priority || "").toLowerCase() === 'high').length;
                
                return (
                  <div key={deptName} className="dept-card">
                    <div className="dept-header">
                      <h3>{deptName}</h3>
                      <span className="dept-count">{deptItems.length} issues</span>
                    </div>
                    <div className="dept-metrics">
                      <div className="metric">
                        <span className="metric-label">Resolution Rate</span>
                        <div className="progress-bar">
                          <div 
                            className="progress-fill" 
                            style={{ 
                              width: `${resolveRate}%`, 
                              backgroundColor: resolveRate > 70 ? '#10b981' : resolveRate > 30 ? '#f59e0b' : '#ef4444' 
                            }}
                          ></div>
                        </div>
                        <span className="metric-val">{resolveRate}%</span>
                      </div>
                      <div className="metric">
                        <span className="metric-label">High Priority</span>
                        <span className="metric-val text-red">{highPrio}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* COMPLAINT INSPECTOR & BEFORE/AFTER REPAIR VERIFICATION MODAL (T9, T10) */}
      {selectedComplaint && (
        <div className="modal-overlay" onClick={() => setSelectedComplaint(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedComplaint(null)}>
              <X size={20} />
            </button>
            
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h2>{title(selectedComplaint.issue_type)}</h2>
                <span className={`badge ${(selectedComplaint.priority || 'medium').toLowerCase()}`}>
                  {title(selectedComplaint.priority)} Priority
                </span>
                <span style={{ 
                  fontSize: '12px', 
                  padding: '4px 10px', 
                  borderRadius: '6px',
                  fontWeight: 600,
                  background: selectedComplaint.status === 'resolved' ? '#dcfce7' : selectedComplaint.status === 'in progress' ? '#fef3c7' : '#f1f5f9',
                  color: selectedComplaint.status === 'resolved' ? '#166534' : selectedComplaint.status === 'in progress' ? '#92400e' : '#475569'
                }}>
                  Status: {title(selectedComplaint.status)}
                </span>
                {selectedComplaint.is_duplicate ? (
                  <span className="geo-badge denied">⚠️ Flagged Duplicate (T8)</span>
                ) : null}
              </div>
              <small className="muted">ID: {selectedComplaint.id}</small>
            </div>
            
            <div className="modal-body">
              {/* BEFORE & AFTER REPAIR VERIFICATION SECTION (T10) */}
              <div className="repair-comparison-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ShieldCheck size={18} color="#2563eb" />
                    Before & After Repair Verification (T10)
                  </h4>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Side-by-side photographic review</span>
                </div>

                <div className="comparison-grid">
                  {/* BEFORE PHOTO */}
                  <div className="compare-col">
                    <h5>
                      <span>1. Before Repair (Reported)</span>
                      <span style={{ fontSize: '10px', color: '#ef4444' }}>Original Damage</span>
                    </h5>
                    <div className="compare-image-holder">
                      {selectedComplaint.image_url ? (
                        <img src={`${API}${selectedComplaint.image_url}`} alt="Before damage" />
                      ) : (
                        <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No original photo provided</div>
                      )}
                    </div>
                  </div>

                  {/* AFTER PHOTO */}
                  <div className="compare-col">
                    <h5>
                      <span>2. After Repair (Field Inspection)</span>
                      <span style={{ fontSize: '10px', color: selectedComplaint.repair_image_url ? '#10b981' : '#f59e0b' }}>
                        {selectedComplaint.repair_image_url ? "Photo Attached" : "Pending Inspection"}
                      </span>
                    </h5>
                    <div className="compare-image-holder">
                      {selectedComplaint.repair_image_url ? (
                        <img src={`${API}${selectedComplaint.repair_image_url}`} alt="After repair" />
                      ) : (
                        <div style={{ textAlign: 'center', padding: '16px' }}>
                          <Camera size={28} color="#94a3b8" style={{ margin: '0 auto 8px' }} />
                          <div style={{ fontSize: '12px', color: '#64748b' }}>No repair photo attached yet</div>
                          <label className={`upload-repair-label ${uploadingRepair ? "opacity-50 pointer-events-none" : ""}`}>
                            <UploadCloud size={14} /> {uploadingRepair ? "Uploading..." : "Attach Repair Photo"}
                            <input 
                              type="file" 
                              accept="image/jpeg,image/png,image/webp"
                              style={{ display: 'none' }}
                              disabled={uploadingRepair}
                              onChange={e => {
                                const f = e.target.files?.[0];
                                if (f) {
                                  setRepairPhotoFile(f);
                                  handleRepairPhotoUpload(selectedComplaint.id, f);
                                }
                              }} 
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Physical Human Review Requirement Disclaimer */}
                <div className="human-verification-warning">
                  <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Human Review Required (Honest Verification Standard)</strong>
                    <div>
                      The system facilitates visual comparison but does not automatically claim successful repair without sufficient evidence. Reviewers must visually inspect both photographs before marking as resolved.
                    </div>
                  </div>
                </div>
              </div>

              {/* REPORT METADATA & ACTIONS */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '24px' }}>
                <div className="modal-info">
                  <div className="info-block">
                    <span className="info-label"><MapIcon size={14} /> Location Details</span>
                    <p>{selectedComplaint.location}</p>
                    {selectedComplaint.latitude && selectedComplaint.longitude && (
                      <span style={{ fontSize: '12px', color: '#0284c7', fontFamily: 'monospace' }}>
                        Coordinates: {selectedComplaint.latitude}, {selectedComplaint.longitude}
                      </span>
                    )}
                  </div>

                  <div className="info-block">
                    <span className="info-label"><Building2 size={14} /> Assigned Department</span>
                    <p>{title(selectedComplaint.department)}</p>
                  </div>

                  <div className="info-block">
                    <span className="info-label"><Clock size={14} /> Reported At</span>
                    <p>{new Date(selectedComplaint.reported_at).toLocaleString()}</p>
                  </div>
                </div>

                <div className="modal-info">
                  <div className="info-block">
                    <span className="info-label"><Sparkles size={14} /> AI Analysis Estimates</span>
                    <p>Estimated Severity: <strong>{title(selectedComplaint.severity)}</strong></p>
                    <small style={{ color: 'var(--text-muted)' }}>
                      Confidence: {selectedComplaint.confidence ? `${Math.round(selectedComplaint.confidence * 100)}%` : "N/A"}
                    </small>
                  </div>

                  {/* STATUS ACTION BUTTONS (T9) */}
                  <div className="info-block" style={{ marginTop: 'auto' }}>
                    <span className="info-label">Update Report Status (T9)</span>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      <button 
                        type="button"
                        onClick={() => updateStatus(selectedComplaint.id, "in progress")}
                        className="btn-secondary"
                        style={{ flex: 1, borderColor: '#f59e0b', color: '#b45309' }}
                      >
                        Set In Progress
                      </button>
                      <button 
                        type="button"
                        onClick={() => updateStatus(selectedComplaint.id, "resolved")}
                        className="btn-secondary"
                        style={{ flex: 1, borderColor: '#10b981', color: '#047857' }}
                      >
                        Confirm Resolved
                      </button>
                      <button 
                        type="button"
                        onClick={() => updateStatus(selectedComplaint.id, "new")}
                        className="btn-secondary"
                        style={{ padding: '8px 12px' }}
                        title="Reset to New / Pending"
                      >
                        Reset
                      </button>
                      <button 
                        type="button"
                        onClick={() => deleteComplaint(selectedComplaint.id)}
                        className="btn-secondary"
                        style={{ padding: '8px 12px', borderColor: '#ef4444', color: '#ef4444' }}
                        title="Permanently delete this report"
                      >
                        <Trash2 size={13} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
