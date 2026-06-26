import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Shield,
  Bell,
  Search,
  ChevronDown,
  UserCircle2,
  Plus,
  CheckSquare,
  Square,
  Eye,
  EyeOff,
  Camera,
  Activity,
  BarChart3,
  FolderArchive,
  GitBranch,
  ShieldAlert,
  ArrowLeft,
  Server,
  Clock3,
  ShieldCheck,
  Crosshair,
  RotateCcw,
  PencilRuler,
  Trash2,
  Power,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import "./index.css";
import { createMotionDetector } from "./detectors/motionDetector";
import { createTamperDetector } from "./detectors/tamperDetector";
import { createMovedDetector } from "./detectors/movedDetector";
import { createZoneEntryDetector } from "./detectors/zoneEntryDetector";

const alerts = [
  { id: "ALT-1042", severity: "Critical", site: "North Facility", camera: "CAM-01", status: "New", time: "2 min ago" },
  { id: "ALT-1041", severity: "Warning", site: "Perimeter", camera: "CAM-02", status: "Investigating", time: "7 min ago" },
  { id: "ALT-1039", severity: "Update", site: "Warehouse", camera: "CAM-03", status: "Acknowledged", time: "18 min ago" },
  { id: "ALT-1038", severity: "Critical", site: "South Facility", camera: "CAM-01", status: "Escalated", time: "31 min ago" },
  { id: "ALT-1037", severity: "Message", site: "HQ", camera: "CAM-02", status: "Closed", time: "48 min ago" },
];

const nodes = [
  { name: "Node-01", state: "Approved", region: "Primary Site", uptime: "99.98%" },
  { name: "Node-02", state: "Pending", region: "North Facility", uptime: "99.73%" },
  { name: "Node-03", state: "Approved", region: "Perimeter", uptime: "99.91%" },
  { name: "Node-04", state: "Review", region: "Warehouse", uptime: "98.84%" },
];

const footage = [
  { id: 1, label: "CAM-01", offline: false, location: "North Facility", node: "Node-01" },
  { id: 2, label: "CAM-02", offline: false, location: "Perimeter", node: "Node-02" },
  { id: 3, label: "CAM-03", offline: false, location: "Warehouse", node: "Node-03" },
];

const initialZonesByCamera = {
  "CAM-01": null,
  "CAM-02": null,
  "CAM-03": null,
};

const initialFeatureArmsByCamera = {
  "CAM-01": getDefaultFeatureArms(),
  "CAM-02": getDefaultFeatureArms(),
  "CAM-03": getDefaultFeatureArms(),
};

const featureArmLabels = [
  { key: "motion", label: "Motion", description: "General motion events" },
  { key: "highMotion", label: "High Motion", description: "Escalates large movement" },
  { key: "tamper", label: "Tamper", description: "Cover / visibility checks" },
  { key: "moved", label: "Camera Moved", description: "Baseline drift detection" },
  { key: "restrictedZone", label: "Restricted Zone", description: "Zone entry detector" },
  { key: "zoneHashing", label: "Zone Hashing", description: "Logs hash only on entry" },
];

const timeOptions = Array.from({ length: 48 }, (_, index) => {
  const hours = Math.floor(index / 2);
  const minutes = index % 2 === 0 ? "00" : "30";
  const value = `${String(hours).padStart(2, "0")}:${minutes}`;
  const date = new Date();
  date.setHours(hours, Number(minutes), 0, 0);

  return {
    value,
    label: date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    }),
  };
});

function getDefaultFeatureArms() {
  return {
    motion: true,
    motionScheduleEnabled: false,
    motionStartTime: "22:00",
    motionEndTime: "06:00",

    highMotion: false,
    highMotionScheduleEnabled: false,
    highMotionStartTime: "22:00",
    highMotionEndTime: "06:00",

    tamper: true,
    tamperScheduleEnabled: false,
    tamperStartTime: "22:00",
    tamperEndTime: "06:00",

    moved: true,
    movedScheduleEnabled: false,
    movedStartTime: "22:00",
    movedEndTime: "06:00",

    restrictedZone: true,
    restrictedZoneScheduleEnabled: false,
    restrictedZoneStartTime: "22:00",
    restrictedZoneEndTime: "06:00",

    zoneHashing: true,
    zoneHashingScheduleEnabled: false,
    zoneHashingStartTime: "22:00",
    zoneHashingEndTime: "06:00",
  };
}

const initialCameraEvents = {
  "CAM-01": [
    {
      eventId: "evt_cam01_seed_001",
      cameraId: "CAM-01",
      ts: "2026-05-18T09:42:12.000Z",
      eventType: "MOTION",
      severity: "HIGH",
      evidenceHash: "pending",
      metadataHash: "pending",
      meta: {
        motionScore: 0.91,
        ema: 0.74,
        burst: 0.88,
        tamperDetected: false,
        movedDetected: false,
        baselineReady: false,
        source: "seed",
      },
      status: "Anchored",
    },
    {
      eventId: "evt_cam01_seed_002",
      cameraId: "CAM-01",
      ts: "2026-05-18T09:35:47.000Z",
      eventType: "TAMPER",
      severity: "WARNING",
      evidenceHash: "pending",
      metadataHash: "pending",
      meta: {
        motionScore: 0.33,
        ema: 0.28,
        burst: 0.33,
        tamperDetected: true,
        movedDetected: false,
        baselineReady: true,
        source: "seed",
        brightness: 28.4,
        flatness: 4.2,
        darkRatio: 0.91,
        tamperReason: "OCCLUDED",
      },
      status: "Verified",
    },
    {
      eventId: "evt_cam01_seed_003",
      cameraId: "CAM-01",
      ts: "2026-05-18T09:21:03.000Z",
      eventType: "MOVED",
      severity: "WARNING",
      evidenceHash: "pending",
      metadataHash: "pending",
      meta: {
        motionScore: 0,
        ema: 0,
        burst: 0,
        tamperDetected: false,
        movedDetected: true,
        baselineReady: true,
        source: "seed",
        movedDistance: 18,
        movedThreshold: 14,
      },
      status: "Verified",
    },
  ],
  "CAM-02": [
    {
      eventId: "evt_cam02_seed_001",
      cameraId: "CAM-02",
      ts: "2026-05-18T09:39:51.000Z",
      eventType: "PERIMETER_ALERT",
      severity: "CRITICAL",
      evidenceHash: "pending",
      metadataHash: "pending",
      meta: {
        motionScore: 0.64,
        ema: 0.42,
        burst: 0.64,
        tamperDetected: false,
        movedDetected: false,
        baselineReady: true,
        source: "seed",
      },
      status: "Anchored",
    },
    {
      eventId: "evt_cam02_seed_002",
      cameraId: "CAM-02",
      ts: "2026-05-18T09:31:18.000Z",
      eventType: "HASH_WRITE",
      severity: "UPDATE",
      evidenceHash: "pending",
      metadataHash: "pending",
      meta: {
        motionScore: 0.21,
        ema: 0.17,
        burst: 0.21,
        tamperDetected: false,
        movedDetected: false,
        baselineReady: true,
        source: "seed",
      },
      status: "Committed",
    },
  ],
  "CAM-03": [
    {
      eventId: "evt_cam03_seed_001",
      cameraId: "CAM-03",
      ts: "2026-05-18T09:37:16.000Z",
      eventType: "MOTION",
      severity: "WARNING",
      evidenceHash: "pending",
      metadataHash: "pending",
      meta: {
        motionScore: 0.41,
        ema: 0.22,
        burst: 0.41,
        tamperDetected: false,
        movedDetected: false,
        baselineReady: true,
        source: "seed",
      },
      status: "Anchored",
    },
    {
      eventId: "evt_cam03_seed_002",
      cameraId: "CAM-03",
      ts: "2026-05-18T09:28:42.000Z",
      eventType: "HASH_WRITE",
      severity: "UPDATE",
      evidenceHash: "pending",
      metadataHash: "pending",
      meta: {
        motionScore: 0.12,
        ema: 0.1,
        burst: 0.12,
        tamperDetected: false,
        movedDetected: false,
        baselineReady: true,
        source: "seed",
      },
      status: "Committed",
    },
  ],
};

const cameraDetails = {
  "CAM-01": {
    name: "CAM-01",
    location: "North Facility",
    node: "Node-01",
    status: "Live",
    integrity: "Verified",
    lastEvent: "2026-05-18 09:42:12",
    firmware: "BVS Edge 4.1.2",
    resolution: "1920 x 1080",
  },
  "CAM-02": {
    name: "CAM-02",
    location: "Perimeter",
    node: "Node-02",
    status: "Live",
    integrity: "Pending Review",
    lastEvent: "2026-05-18 09:39:51",
    firmware: "BVS Edge 4.1.2",
    resolution: "1920 x 1080",
  },
  "CAM-03": {
    name: "CAM-03",
    location: "Warehouse",
    node: "Node-03",
    status: "Live",
    integrity: "Verified",
    lastEvent: "2026-05-18 09:37:16",
    firmware: "BVS Edge 4.1.2",
    resolution: "1920 x 1080",
  },
};

const chartBars = [72, 54, 81, 63, 77, 49, 84, 58, 69, 74, 61, 86];

const navGroups = {
  main: [
    { key: "home", label: "Dashboard", icon: Shield },
    { key: "access", label: "Access Log", icon: FolderArchive },
    { key: "approval", label: "Node Approval", icon: GitBranch },
    { key: "footage", label: "Stored Footage", icon: Camera },
    { key: "hashes", label: "Hash Ledger", icon: ShieldCheck },
    { key: "analytics", label: "AI Analytics", icon: BarChart3 },
    { key: "groups", label: "Camera Groups", icon: Activity },
  ],
  groups: [
    { key: "north", label: "North Facility" },
    { key: "south", label: "South Facility" },
    { key: "perimeter", label: "Perimeter" },
    { key: "warehouse", label: "Warehouse" },
    { key: "hq", label: "HQ" },
  ],
};

const API_BASE_URL =
  (import.meta.env.VITE_BLOCKVAULT_API_URL || "http://localhost:8081").replace(/\/$/, "");

const LEDGER_CAMERA_IDS = footage.map((camera) => camera.label);

function createEmptyLedgerByCamera() {
  return LEDGER_CAMERA_IDS.reduce((acc, cameraId) => {
    acc[cameraId] = [];
    return acc;
  }, {});
}

function normalizeBlockchainEvent(record) {
  if (!record) return null;

  const eventId = String(record.id || record.eventId || "");
  if (!eventId) return null;

  return {
    docType: record.docType || "hashEvent",
    eventId,
    id: eventId,
    cameraId: String(record.cameraId || "UNKNOWN"),
    ts: String(record.ts || new Date().toISOString()),
    eventType: String(record.eventType || "UNKNOWN"),
    severity: String(record.severity || "NORMAL"),
    primaryHash: String(record.primaryHash || ""),
    evidenceHash: String(record.evidenceHash || "pending"),
    metadataHash: String(record.metadataHash || "pending"),
    status: String(record.status || "Committed"),
    meta: record.meta || {
      source: "blockchain",
    },
  };
}

function sortEventsNewestFirst(events = []) {
  return [...events].sort((left, right) => {
    const leftTime = new Date(left.ts).getTime();
    const rightTime = new Date(right.ts).getTime();
    return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
  });
}

function buildLedgerState(recordsByCamera = {}) {
  const baseState = createEmptyLedgerByCamera();

  Object.entries(recordsByCamera || {}).forEach(([cameraId, records]) => {
    baseState[cameraId] = sortEventsNewestFirst(
      (records || [])
        .map((record) => normalizeBlockchainEvent(record))
        .filter(Boolean)
    );
  });

  return baseState;
}

function upsertEventByEventId(events = [], nextEvent) {
  const normalized = normalizeBlockchainEvent(nextEvent) || nextEvent;
  if (!normalized?.eventId) return events;

  const existing = events.filter((event) => event.eventId !== normalized.eventId);
  return sortEventsNewestFirst([normalized, ...existing]);
}

function mergeRuntimeEventWithBlockchainRecord(runtimeEvent, blockchainRecord) {
  const normalizedRecord = normalizeBlockchainEvent(blockchainRecord);
  if (!normalizedRecord) return runtimeEvent;

  return {
    ...runtimeEvent,
    ...normalizedRecord,
    eventId: runtimeEvent?.eventId || normalizedRecord.eventId,
    meta: runtimeEvent?.meta || normalizedRecord.meta || {},
  };
}

function formatEventTime(ts) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatTimeLabel(value) {
  const match = timeOptions.find((option) => option.value === value);
  return match ? match.label : value;
}

function getFeatureScheduleKeys(featureKey) {
  return {
    enabledKey: featureKey,
    scheduleEnabledKey: `${featureKey}ScheduleEnabled`,
    startTimeKey: `${featureKey}StartTime`,
    endTimeKey: `${featureKey}EndTime`,
  };
}

function isTimeWithinWindow(now, startTime, endTime) {
  if (!startTime || !endTime) return true;

  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

function isFeatureActiveNow(featureArms, featureKey, now = new Date()) {
  const { enabledKey, scheduleEnabledKey, startTimeKey, endTimeKey } = getFeatureScheduleKeys(featureKey);

  if (!featureArms?.[enabledKey]) return false;
  if (!featureArms?.[scheduleEnabledKey]) return true;

  return isTimeWithinWindow(now, featureArms[startTimeKey], featureArms[endTimeKey]);
}

function getFeatureRuntimeState(featureArms, featureKey, now = new Date()) {
  const { enabledKey, scheduleEnabledKey, startTimeKey, endTimeKey } = getFeatureScheduleKeys(featureKey);
  const enabled = Boolean(featureArms?.[enabledKey]);
  const scheduleEnabled = Boolean(featureArms?.[scheduleEnabledKey]);
  const startTime = featureArms?.[startTimeKey];
  const endTime = featureArms?.[endTimeKey];
  const activeNow = enabled && (!scheduleEnabled || isTimeWithinWindow(now, startTime, endTime));

  return {
    enabled,
    scheduleEnabled,
    startTime,
    endTime,
    activeNow,
  };
}

function severityTone(severity) {
  const normalized = String(severity || "").toUpperCase();
  if (normalized === "CRITICAL" || normalized === "HIGH") return "purple";
  if (normalized === "WARNING" || normalized === "MEDIUM") return "amber";
  if (normalized === "VERIFIED" || normalized === "LIVE") return "green";
  return "gray";
}



function getEventStreamTone(event) {
  const type = String(event?.eventType || "").toUpperCase();
  const severity = String(event?.severity || "").toUpperCase();

  if (type === "SYSTEM_RUNNING_FINE") return "green";
  if (type === "TAMPER") return "amber";
  if (severity === "CRITICAL" || severity === "HIGH") return "purple";
  if (type === "ZONE_ENTRY" || type === "MOVED") return "purple";
  if (severity === "WARNING") return "amber";
  return "gray";
}

function getEventStreamHash(event) {
  const primaryHash = String(event?.primaryHash || "");
  const evidenceHash = String(event?.evidenceHash || "");
  if (primaryHash) return primaryHash;
  if (evidenceHash && evidenceHash !== "pending") return evidenceHash;
  return String(event?.eventId || "");
}

function shortenHash(value) {
  if (!value) return "event";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function getPrimaryHashValue(event) {
  const primaryHash = String(event?.primaryHash || "");
  const evidenceHash = String(event?.evidenceHash || "");
  const metadataHash = String(event?.metadataHash || "");

  if (primaryHash) return primaryHash;
  if (evidenceHash && evidenceHash !== "pending") return evidenceHash;
  if (metadataHash && metadataHash !== "pending") return metadataHash;
  return String(event?.eventId || "");
}

function getMetadataHashValue(event) {
  const metadataHash = String(event?.metadataHash || "");
  if (metadataHash && metadataHash !== "pending") return metadataHash;
  return "pending";
}

function countReadyHashes(cameraEvents) {
  return cameraEvents.filter((event) => {
    const evidenceHash = String(event?.evidenceHash || "");
    const metadataHash = String(event?.metadataHash || "");
    return (evidenceHash && evidenceHash !== "pending") || (metadataHash && metadataHash !== "pending") || Boolean(event?.eventId);
  }).length;
}

function makePseudoHash(input) {
  let hashA = 0x811c9dc5;
  let hashB = 0x01000193;

  for (let index = 0; index < input.length; index += 1) {
    const charCode = input.charCodeAt(index);
    hashA ^= charCode;
    hashA = Math.imul(hashA, 16777619);
    hashB ^= charCode + index;
    hashB = Math.imul(hashB, 2246822519);
  }

  return `${(hashA >>> 0).toString(16).padStart(8, "0")}${(hashB >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

function buildHeartbeatEvent(cameraId) {
  const now = Date.now();
  const isoTime = new Date(now).toISOString();
  const baseString = `${cameraId}|SYSTEM_RUNNING_FINE|${isoTime}`;
  const evidenceHash = makePseudoHash(`${baseString}|evidence`);
  const metadataHash = makePseudoHash(`${baseString}|metadata`);

  return {
    eventId: `evt_${cameraId.toLowerCase().replace(/[^a-z0-9]/g, "")}_${now}`,
    cameraId,
    ts: isoTime,
    eventType: "SYSTEM_RUNNING_FINE",
    severity: "VERIFIED",
    evidenceHash,
    metadataHash,
    status: "Normal",
    meta: {
      motionScore: 0,
      ema: 0,
      burst: 0,
      tamperDetected: false,
      movedDetected: false,
      baselineReady: false,
      source: "system",
      heartbeat: true,
      health: "RUNNING_FINE",
      intervalSeconds: 20,
    },
  };
}

function PillButton({ children, active = false, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`pill-button ${active ? "pill-button-active" : "pill-button-inactive"}`}
    >
      {children}
    </button>
  );
}

function TopBar({ title, searchPlaceholder = "Search security events" }) {
  return (
    <div className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <div className="search-wrap">
            <Search className="search-icon" size={16} />
            <input className="search-input" placeholder={searchPlaceholder} />
          </div>
          <h1 className="page-title">{title}</h1>
        </div>

        <div className="topbar-right">
          <button className="add-alert-btn">
            <Plus size={16} />
            <span>Add Alert</span>
          </button>

          <button className="icon-btn">
            <Shield size={18} />
          </button>

          <button className="icon-btn">
            <Bell size={18} />
          </button>

          <div className="user-chip">
            <UserCircle2 size={26} />
            <span>BVS</span>
            <ChevronDown size={16} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ current, setCurrent, onCloseCameraDetail }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">
          <Shield size={24} />
        </div>
        <div>
          <div className="brand-title">BV</div>
          <div className="brand-subtitle">Block Vault Systems</div>
        </div>
      </div>

      <div className="sidebar-section">
        {navGroups.main.map((item) => {
          const Icon = item.icon;
          return (
            <PillButton
              key={item.key}
              active={current === item.key}
              onClick={() => {
                onCloseCameraDetail();
                setCurrent(item.key);
              }}
            >
              <div className="pill-content">
                <Icon size={16} />
                <span>{item.label}</span>
              </div>
            </PillButton>
          );
        })}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">Camera Groups</div>
        {navGroups.groups.map((item) => (
          <PillButton
            key={item.key}
            active={current === item.key}
            onClick={() => {
              onCloseCameraDetail();
              setCurrent(item.key);
            }}
          >
            {item.label}
          </PillButton>
        ))}
      </div>
    </aside>
  );
}

function Card({ title, children, className = "" }) {
  return (
    <div className={`card ${className}`}>
      {title ? <div className="card-title">{title}</div> : null}
      {children}
    </div>
  );
}

function MetricCard({ title, value, subtitle }) {
  return (
    <Card className="metric-card">
      <div className="metric-title">{title}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-subtitle">{subtitle}</div>
    </Card>
  );
}

function Badge({ children, tone = "default" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function MiniBarChart() {
  return (
    <div className="mini-chart">
      {chartBars.map((h, i) => (
        <div key={i} className="mini-chart-bar-wrap">
          <div className="mini-chart-bar" style={{ height: `${h}%` }} />
          <span className="mini-chart-label">{i + 1}/10</span>
        </div>
      ))}
    </div>
  );
}

function CameraWall({ selectable = false, onCameraClick = null }) {
  const [selected, setSelected] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRefs = useRef([]);
  const streamRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        setCameraReady(true);
        setCameraError("");

        videoRefs.current.forEach((videoEl) => {
          if (videoEl) {
            videoEl.srcObject = stream;
            videoEl.play().catch(() => {});
          }
        });
      } catch (error) {
        console.error("Camera access failed:", error);
        if (isMounted) {
          setCameraReady(false);
          setCameraError("Camera access blocked or unavailable");
        }
      }
    }

    startCamera();

    return () => {
      isMounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  return (
    <div className="camera-grid">
      {footage.map((cam, idx) => {
        const isSelected = selected === idx;

        return (
          <button
            key={cam.id}
            type="button"
            onClick={() => {
              if (selectable) setSelected(idx);
              if (onCameraClick) onCameraClick(cam.label);
            }}
            className={`camera-tile ${cam.offline ? "camera-offline" : ""} ${isSelected ? "camera-selected" : ""}`}
          >
            <video
              ref={(el) => {
                videoRefs.current[idx] = el;
                if (el && streamRef.current) {
                  el.srcObject = streamRef.current;
                  el.play().catch(() => {});
                }
              }}
              className="camera-video"
              autoPlay
              playsInline
              muted
            />

            {!cameraReady && !cameraError && (
              <div className="camera-loading">
                <Camera size={28} />
                <span>Connecting camera...</span>
              </div>
            )}

            {cameraError && (
              <div className="camera-loading">
                <Camera size={28} />
                <span>{cameraError}</span>
              </div>
            )}

            <div className="camera-overlay" />
            <div className="camera-gridlines" />
            <div className="camera-label">{cam.label}</div>
            <div className="camera-status">{cameraError ? "Unavailable" : "Live feed"}</div>

            {selectable && (
              <div className="camera-check">
                {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function LiveStatusPills({ movedActive, tamperActive, zoneActive }) {
  return (
    <div className="live-pills">
      <Badge tone="green">Live</Badge>
      {tamperActive && <Badge tone="amber">Tamper</Badge>}
      {movedActive && <Badge tone="purple">Moved</Badge>}
      {zoneActive && <Badge tone="purple">Zone Entry</Badge>}
    </div>
  );
}

function LiveHashStream({ cameraEvents = [] }) {
  const liveEvents = useMemo(() => {
    const now = Date.now();

    return cameraEvents
      .filter((event) => {
        const eventTime = new Date(event.ts).getTime();
        if (Number.isNaN(eventTime)) return false;
        return now - eventTime <= 24000;
      })
      .slice(0, 6)
      .reverse();
  }, [cameraEvents]);

  if (!liveEvents.length) return null;

  return (
    <div className="live-hash-stream">
      {liveEvents.map((event) => {
        const eventTime = new Date(event.ts).getTime();
        const ageMs = Number.isNaN(eventTime) ? 0 : Date.now() - eventTime;
        const fadeProgress = Math.min(1, Math.max(0, ageMs / 24000));
        const opacity = 1 - fadeProgress * 0.78;
        const translateY = fadeProgress * -8;

        return (
          <div
            key={event.eventId}
            className={`live-hash-item live-hash-item-${getEventStreamTone(event)}`}
            style={{
              opacity,
              transform: `translateY(${translateY}px)`,
            }}
          >
            <div className="live-hash-head">
              <span className="live-hash-type">{event.eventType}</span>
              <span className="live-hash-time">{formatEventTime(event.ts)}</span>
            </div>
            <div className="live-hash-value">{shortenHash(getEventStreamHash(event))}</div>
          </div>
        );
      })}
    </div>
  );
}


function FeatureArmPanel({
  cameraId,
  featureArms,
  onFeatureArmChange,
  onFeatureScheduleToggle,
  onFeatureTimeChange,
}) {
  return (
    <Card title="Feature Arms">
      <div className="feature-arm-grid">
        {featureArmLabels.map((feature) => {
          const { scheduleEnabledKey, startTimeKey, endTimeKey } = getFeatureScheduleKeys(feature.key);
          const active = Boolean(featureArms[feature.key]);
          const scheduleEnabled = Boolean(featureArms[scheduleEnabledKey]);

          return (
            <div key={feature.key} className={`feature-arm-wrap ${active ? "feature-arm-wrap-on" : "feature-arm-wrap-off"}`}>
              <button
                type="button"
                className={`feature-arm-row ${active ? "feature-arm-on" : "feature-arm-off"}`}
                onClick={() => onFeatureArmChange(cameraId, feature.key)}
              >
                <div className="feature-arm-copy">
                  <div className="feature-arm-title">
                    <Power size={15} />
                    <span>{feature.label}</span>
                  </div>
                  <div className="feature-arm-description">{feature.description}</div>
                </div>

                <div className={`feature-toggle ${active ? "feature-toggle-on" : "feature-toggle-off"}`}>
                  <span />
                </div>
              </button>

              {active && (
                <div className="feature-schedule-panel" onClick={(event) => event.stopPropagation()}>
                  <div className="feature-schedule-toggle-row">
                    <div className="feature-schedule-copy">
                      <div className="feature-schedule-title">Use Schedule</div>
                      <div className="feature-schedule-note">
                        {scheduleEnabled ? "Feature only runs inside the selected window." : "Feature stays on all the time."}
                      </div>
                    </div>

                    <button
                      type="button"
                      className={`feature-schedule-toggle-btn ${scheduleEnabled ? "feature-schedule-toggle-btn-on" : "feature-schedule-toggle-btn-off"}`}
                      onClick={() => onFeatureScheduleToggle(cameraId, feature.key)}
                    >
                      <div className={`feature-toggle ${scheduleEnabled ? "feature-toggle-on" : "feature-toggle-off"}`}>
                        <span />
                      </div>
                    </button>
                  </div>

                  {scheduleEnabled && (
                    <div className="feature-schedule-grid">
                      <div className="feature-schedule-field">
                        <label>Start</label>
                        <select
                          value={featureArms[startTimeKey]}
                          onChange={(event) => onFeatureTimeChange(cameraId, startTimeKey, event.target.value)}
                        >
                          {timeOptions.map((option) => (
                            <option key={`${feature.key}-start-${option.value}`} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="feature-schedule-field">
                        <label>End</label>
                        <select
                          value={featureArms[endTimeKey]}
                          onChange={(event) => onFeatureTimeChange(cameraId, endTimeKey, event.target.value)}
                        >
                          {timeOptions.map((option) => (
                            <option key={`${feature.key}-end-${option.value}`} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="feature-schedule-window">
                        Active window: {formatTimeLabel(featureArms[startTimeKey])} to {formatTimeLabel(featureArms[endTimeKey])}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function DiagnosticsPanel({ debugStats }) {
  return (
    <div className="diagnostics-grid">
      <div className="diagnostic-card">
        <div className="diagnostic-title">Motion</div>
        <div className="diagnostic-value">{debugStats.motionScore.toFixed(4)}</div>
        <div className="diagnostic-subtitle">Instant score</div>
      </div>

      <div className="diagnostic-card">
        <div className="diagnostic-title">EMA</div>
        <div className="diagnostic-value">{debugStats.ema.toFixed(4)}</div>
        <div className="diagnostic-subtitle">Smoothed motion</div>
      </div>

      <div className="diagnostic-card">
        <div className="diagnostic-title">Brightness</div>
        <div className="diagnostic-value">{debugStats.brightness.toFixed(2)}</div>
        <div className="diagnostic-subtitle">Visibility signal</div>
      </div>

      <div className="diagnostic-card">
        <div className="diagnostic-title">Dark Ratio</div>
        <div className="diagnostic-value">{debugStats.darkRatio.toFixed(4)}</div>
        <div className="diagnostic-subtitle">Occlusion density</div>
      </div>

      <div className="diagnostic-card">
        <div className="diagnostic-title">Moved Distance</div>
        <div className="diagnostic-value">{debugStats.movedDistance}</div>
        <div className="diagnostic-subtitle">{debugStats.baselineReady ? "Baseline active" : "Baseline not set"}</div>
      </div>

      <div className="diagnostic-card">
        <div className="diagnostic-title">Zone Motion</div>
        <div className="diagnostic-value">{debugStats.zoneMotionScore.toFixed(4)}</div>
        <div className="diagnostic-subtitle">{debugStats.zoneReady ? "Restricted zone armed" : "No zone drawn"}</div>
      </div>

      <div className="diagnostic-card">
        <div className="diagnostic-title">Zone State</div>
        <div className="diagnostic-value">{debugStats.zoneOccupied ? "OCCUPIED" : "EMPTY"}</div>
        <div className="diagnostic-subtitle">Entry latch state</div>
      </div>

      <div className="diagnostic-card">
        <div className="diagnostic-title">Heartbeat</div>
        <div className="diagnostic-value">20s</div>
        <div className="diagnostic-subtitle">System running fine cadence</div>
      </div>
    </div>
  );
}

function DetectorStatePanel({ debugStats, zone, featureArms }) {
  const motionState = getFeatureRuntimeState(featureArms, "motion");
  const highMotionState = getFeatureRuntimeState(featureArms, "highMotion");
  const tamperState = getFeatureRuntimeState(featureArms, "tamper");
  const movedState = getFeatureRuntimeState(featureArms, "moved");
  const restrictedZoneState = getFeatureRuntimeState(featureArms, "restrictedZone");
  const zoneHashingState = getFeatureRuntimeState(featureArms, "zoneHashing");

  return (
    <div className="detector-state-panel">
      <div className="detector-state-row">
        <span>Motion</span>
        <span>{motionState.activeNow ? "ACTIVE" : motionState.enabled ? "SCHEDULED" : "OFF"}</span>
      </div>
      <div className="detector-state-row">
        <span>High Motion</span>
        <span>{highMotionState.activeNow ? "ACTIVE" : highMotionState.enabled ? "SCHEDULED" : "OFF"}</span>
      </div>
      <div className="detector-state-row">
        <span>Motion Event</span>
        <span>{debugStats.motionTriggered ? "YES" : "NO"}</span>
      </div>
      <div className="detector-state-row">
        <span>Tamper</span>
        <span>{tamperState.activeNow ? "ACTIVE" : tamperState.enabled ? "SCHEDULED" : "OFF"}</span>
      </div>
      <div className="detector-state-row">
        <span>Tamper Event</span>
        <span>{debugStats.tamperTriggered ? "YES" : "NO"}</span>
      </div>
      <div className="detector-state-row">
        <span>Tamper Reason</span>
        <span>{tamperState.activeNow ? debugStats.tamperReason : "INACTIVE"}</span>
      </div>
      <div className="detector-state-row">
        <span>Camera Moved</span>
        <span>{movedState.activeNow ? "ACTIVE" : movedState.enabled ? "SCHEDULED" : "OFF"}</span>
      </div>
      <div className="detector-state-row">
        <span>Baseline</span>
        <span>{debugStats.baselineReady ? "READY" : "NOT SET"}</span>
      </div>
      <div className="detector-state-row">
        <span>Moved Event</span>
        <span>{debugStats.movedTriggered ? "YES" : "NO"}</span>
      </div>
      <div className="detector-state-row">
        <span>Restricted Zone</span>
        <span>{restrictedZoneState.activeNow ? "ACTIVE" : restrictedZoneState.enabled ? "SCHEDULED" : "OFF"}</span>
      </div>
      <div className="detector-state-row">
        <span>Zone Drawn</span>
        <span>{zone ? "YES" : "NO"}</span>
      </div>
      <div className="detector-state-row">
        <span>Zone Hashing</span>
        <span>{zoneHashingState.activeNow ? "ACTIVE" : zoneHashingState.enabled ? "SCHEDULED" : "OFF"}</span>
      </div>
      <div className="detector-state-row">
        <span>Zone Occupied</span>
        <span>{debugStats.zoneOccupied ? "YES" : "NO"}</span>
      </div>
      <div className="detector-state-row">
        <span>Zone Entry Pulse</span>
        <span>{debugStats.zoneTriggered ? "YES" : "NO"}</span>
      </div>
      <div className="detector-state-row">
        <span>System Running Fine</span>
        <span>EVERY 20S</span>
      </div>
    </div>
  );
}

function ZoneOverlay({
  zone,
  isDrawing,
  drawRect,
  drawingMode,
  zoneArmed,
  onPointerDown,
}) {
  return (
    <div
      className={`zone-overlay-surface ${drawingMode ? "zone-overlay-armed" : ""} ${!zoneArmed ? "zone-overlay-disabled" : ""}`}
      onPointerDown={zoneArmed ? onPointerDown : undefined}
    >
      {zone && (
        <div
          className={`zone-rect ${!zoneArmed ? "zone-rect-disabled" : ""}`}
          style={{
            left: `${zone.x * 100}%`,
            top: `${zone.y * 100}%`,
            width: `${zone.width * 100}%`,
            height: `${zone.height * 100}%`,
          }}
        >
          <div className="zone-rect-label">
            {zoneArmed ? zone.label || "Restricted Zone" : "Zone Off"}
          </div>
        </div>
      )}

      {isDrawing && drawRect && (
        <div
          className="zone-rect zone-rect-drawing"
          style={{
            left: `${drawRect.x * 100}%`,
            top: `${drawRect.y * 100}%`,
            width: `${drawRect.width * 100}%`,
            height: `${drawRect.height * 100}%`,
          }}
        >
          <div className="zone-rect-label">Drawing Zone</div>
        </div>
      )}

      {drawingMode && !isDrawing && (
        <div className="zone-draw-hint">
          Click and drag to create a restricted zone
        </div>
      )}
    </div>
  );
}

function SingleCameraViewer({
  cameraId = "CAM-01",
  onNewEvent,
  zone,
  onZoneChange,
  featureArms,
  cameraEvents = [],
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const motionDetectorRef = useRef(null);
  const tamperDetectorRef = useRef(null);
  const movedDetectorRef = useRef(null);
  const zoneEntryDetectorRef = useRef(null);

  const intervalRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const lastTamperAtRef = useRef(0);
  const frameRectRef = useRef(null);
  const pendingDrawRef = useRef(null);
  const zoneSetAtRef = useRef(0);
  const singleCameraFrameRef = useRef(null);
  const fullViewVideoRef = useRef(null);
  const focusOverlayRef = useRef(null);

  const activeArmsRef = useRef(featureArms || getDefaultFeatureArms());
  const onNewEventRef = useRef(onNewEvent);
  const zoneRef = useRef(zone);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [drawingMode, setDrawingMode] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawRect, setDrawRect] = useState(null);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [debugStats, setDebugStats] = useState({
    motionScore: 0,
    ema: 0,
    motionTriggered: false,
    tamperTriggered: false,
    brightness: 0,
    flatness: 0,
    darkRatio: 0,
    tamperReason: "CLEAR",
    tamperMotionEstimate: 0,
    baselineReady: false,
    movedDistance: 0,
    movedTriggered: false,
    zoneMotionScore: 0,
    zoneReady: false,
    zoneOccupied: false,
    zoneTriggered: false,
  });

  const activeArms = featureArms || getDefaultFeatureArms();

  useEffect(() => {
    activeArmsRef.current = activeArms;
  }, [activeArms]);

  useEffect(() => {
    onNewEventRef.current = onNewEvent;
  }, [onNewEvent]);

  useEffect(() => {
    zoneRef.current = zone;

    const zoneEntryDetector = zoneEntryDetectorRef.current;
    if (!zoneEntryDetector) return;

    if (zone) {
      zoneEntryDetector.setZone(zone);
    } else {
      zoneEntryDetector.clearZone();
    }
  }, [zone]);

  useEffect(() => {
    if (!cameraReady || cameraError) return;

    heartbeatIntervalRef.current = window.setInterval(() => {
      if (!streamRef.current) return;
      const publish = onNewEventRef.current;
      if (!publish) return;

      publish(buildHeartbeatEvent(cameraId));
    }, 20000);

    return () => {
      if (heartbeatIntervalRef.current) {
        window.clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [cameraId, cameraReady, cameraError]);

  useEffect(() => {
    if (!isFocusMode) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;

      if (document.fullscreenElement === focusOverlayRef.current) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [isFocusMode]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isActive = Boolean(document.fullscreenElement);
      setIsBrowserFullscreen(isActive);

      if (!isActive) return;
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (!isFocusMode) return;
      if (document.fullscreenElement) return;
      setIsFocusMode(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFocusMode]);

  useEffect(() => {
    if (!isFocusMode || !fullViewVideoRef.current || !streamRef.current) return;

    fullViewVideoRef.current.srcObject = streamRef.current;
    fullViewVideoRef.current.play().catch(() => {});
  }, [isFocusMode, cameraReady]);

  useEffect(() => {
    let isMounted = true;

    motionDetectorRef.current = createMotionDetector({
      cameraId,
      threshold: 0.18,
      emaAlpha: 0.25,
      cooldownMs: 6500,
      hotFramesRequired: 5,
    });

    tamperDetectorRef.current = createTamperDetector({
      cameraId,
      darknessThreshold: 34,
      flatnessThreshold: 5.5,
      occlusionRatioThreshold: 0.95,
      lowMotionThreshold: 0.018,
      cooldownMs: 6000,
      warmupFrames: 16,
      tamperFramesRequired: 4,
      clearFramesRequired: 8,
    });

    movedDetectorRef.current = createMovedDetector({
      cameraId,
      threshold: 14,
      cooldownMs: 5000,
    });

    zoneEntryDetectorRef.current = createZoneEntryDetector({
      cameraId,
      threshold: 0.12,
      clearThreshold: 0.035,
      cooldownMs: 2200,
      settleFrames: 10,
      clearFramesRequired: 2,
      entryFramesRequired: 1,
    });


    if (zoneRef.current) {
      zoneEntryDetectorRef.current.setZone(zoneRef.current);
    }


    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        setCameraReady(true);
        setCameraError("");

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        if (fullViewVideoRef.current) {
          fullViewVideoRef.current.srcObject = stream;
          await fullViewVideoRef.current.play().catch(() => {});
        }

        intervalRef.current = setInterval(() => {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          const motionDetector = motionDetectorRef.current;
          const tamperDetector = tamperDetectorRef.current;
          const movedDetector = movedDetectorRef.current;
          const zoneEntryDetector = zoneEntryDetectorRef.current;
          const arms = activeArmsRef.current;
          const currentZone = zoneRef.current;

          if (!video || !canvas || !motionDetector || !tamperDetector || !movedDetector || !zoneEntryDetector) return;
          if (video.videoWidth === 0 || video.videoHeight === 0) return;

          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return;

          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);


const motionActiveNow = isFeatureActiveNow(arms, "motion");
const highMotionActiveNow = isFeatureActiveNow(arms, "highMotion");
const tamperActiveNow = isFeatureActiveNow(arms, "tamper");
const movedActiveNow = isFeatureActiveNow(arms, "moved");
const restrictedZoneActiveNow = isFeatureActiveNow(arms, "restrictedZone");
const zoneHashingActiveNow = isFeatureActiveNow(arms, "zoneHashing");

const motionResult = motionActiveNow
  ? motionDetector.processFrame(imageData, canvas.width, canvas.height)
  : {
      motionScore: 0,
      ema: 0,
      triggered: false,
      event: null,
    };

const tamperResult = tamperActiveNow
  ? tamperDetector.processFrame(imageData, canvas.width, canvas.height)
  : {
      triggered: false,
      event: null,
      brightness: 0,
      flatness: 0,
      darkRatio: 0,
      reason: "INACTIVE",
      motionEstimate: 0,
      latched: false,
    };

const movedResult = movedActiveNow
  ? movedDetector.processFrame(imageData, canvas.width, canvas.height)
  : {
      baselineReady: movedDetector.getState?.().baselineReady || false,
      distance: 0,
      movedDetected: false,
      triggered: false,
      event: null,
    };

const zoneResult = restrictedZoneActiveNow
  ? zoneEntryDetector.processFrame(imageData, canvas.width, canvas.height)
  : {
      zoneReady: Boolean(currentZone),
      zoneMotionScore: 0,
      zoneOccupied: false,
      entryDetected: false,
      triggered: false,
      event: null,
    };

          setDebugStats({
            motionScore: motionResult.motionScore,
            ema: motionResult.ema,
            motionTriggered: motionResult.triggered,
            tamperTriggered: false,
            brightness: tamperResult.brightness,
            flatness: tamperResult.flatness,
            darkRatio: tamperResult.darkRatio,
            tamperReason: tamperResult.reason,
            tamperMotionEstimate: tamperResult.motionEstimate,
            baselineReady: movedResult.baselineReady,
            movedDistance: movedResult.distance,
            movedTriggered: movedResult.triggered,
            zoneMotionScore: zoneResult.zoneMotionScore,
            zoneReady: zoneResult.zoneReady,
            zoneOccupied: zoneResult.zoneOccupied,
            zoneTriggered: zoneResult.triggered,
          });

          if (motionActiveNow && motionResult.event) {
            const highMotionBlocked =
              !highMotionActiveNow &&
              String(motionResult.event.severity || "").toUpperCase() === "HIGH";

            const enrichedMotionEvent = {
              ...motionResult.event,
              severity: highMotionBlocked ? "WARNING" : motionResult.event.severity,
              status: highMotionBlocked ? "Detected / High Motion Disarmed" : "Detected",
              meta: {
                ...motionResult.event.meta,
                highMotionArmed: highMotionActiveNow,
                highMotionSuppressed: highMotionBlocked,
              },
            };

            const publish = onNewEventRef.current;
            if (publish) publish(enrichedMotionEvent);
          }

          const tamperSuppressed = Date.now() - zoneSetAtRef.current < 2500;

          if (tamperActiveNow && !tamperSuppressed && tamperResult.event) {
            const now = Date.now();
            if (now - lastTamperAtRef.current > 3500) {
              lastTamperAtRef.current = now;
              const enrichedTamperEvent = { ...tamperResult.event, status: "Detected" };
              const publish = onNewEventRef.current;
              if (publish) publish(enrichedTamperEvent);

              setDebugStats((prev) => ({
                ...prev,
                tamperTriggered: true,
              }));
            }
          }

          if (movedActiveNow && movedResult.event) {
            const enrichedMovedEvent = { ...movedResult.event, status: "Detected" };
            const publish = onNewEventRef.current;
            if (publish) publish(enrichedMovedEvent);
          }

          if (restrictedZoneActiveNow && zoneHashingActiveNow && zoneResult.event) {
            const enrichedZoneEvent = {
              ...zoneResult.event,
              status: "Detected / Hash Pending",
              meta: {
                ...zoneResult.event.meta,
                restrictedZoneArmed: restrictedZoneActiveNow,
                zoneHashingArmed: zoneHashingActiveNow,
              },
            };
            const publish = onNewEventRef.current;
            if (publish) publish(enrichedZoneEvent);
          }
        }, 250);
      } catch (error) {
        console.error("Camera access failed:", error);
        if (isMounted) {
          setCameraReady(false);
          setCameraError("Camera access blocked or unavailable");
        }
      }
    }

    startCamera();

    return () => {
      isMounted = false;

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [cameraId]);

  const handleSetBaseline = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const movedDetector = movedDetectorRef.current;

    if (!video || !canvas || !movedDetector) return;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    movedDetector.setBaselineFromFrame(imageData, canvas.width, canvas.height);

    setDebugStats((prev) => ({
      ...prev,
      baselineReady: true,
      movedDistance: 0,
      movedTriggered: false,
    }));
  };

  const handleClearBaseline = () => {
    const movedDetector = movedDetectorRef.current;
    if (!movedDetector) return;

    movedDetector.clearBaseline();

    setDebugStats((prev) => ({
      ...prev,
      baselineReady: false,
      movedDistance: 0,
      movedTriggered: false,
    }));
  };

  const handleEnableZoneDraw = () => {
    if (!isFeatureActiveNow(activeArms, "restrictedZone")) return;

    setDrawingMode(true);
    setIsDrawing(false);
    setDrawRect(null);
    pendingDrawRef.current = null;
  };

  const handleClearZone = () => {
    setDrawingMode(false);
    setIsDrawing(false);
    setDrawRect(null);
    pendingDrawRef.current = null;
    zoneSetAtRef.current = 0;
    if (onZoneChange) onZoneChange(cameraId, null);
  };

  const handleOpenFocusMode = () => {
    setIsFocusMode(true);
  };

  const handleCloseFocusMode = () => {
    if (document.fullscreenElement === focusOverlayRef.current) {
      document.exitFullscreen().catch(() => {});
    }
    setIsFocusMode(false);
  };

  const handleToggleBrowserFullscreen = async () => {
    const target = isFocusMode ? focusOverlayRef.current : singleCameraFrameRef.current;
    if (!target) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await target.requestFullscreen();
      }
    } catch (error) {
      console.error("Fullscreen toggle failed:", error);
    }
  };

  const handleZonePointerDown = (event) => {
    if (!drawingMode) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    frameRectRef.current = bounds;

    const startX = (event.clientX - bounds.left) / bounds.width;
    const startY = (event.clientY - bounds.top) / bounds.height;

    const clampedStartX = Math.max(0, Math.min(1, startX));
    const clampedStartY = Math.max(0, Math.min(1, startY));

    setIsDrawing(true);

    const initialRect = {
      x: clampedStartX,
      y: clampedStartY,
      width: 0,
      height: 0,
    };

    pendingDrawRef.current = initialRect;
    setDrawRect(initialRect);

    const handlePointerMove = (moveEvent) => {
      const liveBounds = frameRectRef.current;
      if (!liveBounds) return;

      const currentX = (moveEvent.clientX - liveBounds.left) / liveBounds.width;
      const currentY = (moveEvent.clientY - liveBounds.top) / liveBounds.height;

      const clampedCurrentX = Math.max(0, Math.min(1, currentX));
      const clampedCurrentY = Math.max(0, Math.min(1, currentY));

      const deltaX = clampedCurrentX - clampedStartX;
      const deltaY = clampedCurrentY - clampedStartY;
      const squareSize = Math.min(Math.abs(deltaX), Math.abs(deltaY));

      const nextRect = {
        x: deltaX < 0 ? clampedStartX - squareSize : clampedStartX,
        y: deltaY < 0 ? clampedStartY - squareSize : clampedStartY,
        width: squareSize,
        height: squareSize,
      };

      pendingDrawRef.current = nextRect;
      setDrawRect(nextRect);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);

      const finalRect = pendingDrawRef.current;

      setIsDrawing(false);
      setDrawingMode(false);
      setDrawRect(null);
      pendingDrawRef.current = null;
      frameRectRef.current = null;

      if (!finalRect) return;
      if (finalRect.width <= 0.03 || finalRect.height <= 0.03) return;

      zoneSetAtRef.current = Date.now();

      const zonePayload = {
        id: "zone-1",
        label: "Restricted Zone",
        x: finalRect.x,
        y: finalRect.y,
        width: finalRect.width,
        height: finalRect.height,
      };

      if (onZoneChange) onZoneChange(cameraId, zonePayload);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  return (
    <div className="single-camera-shell">
      <div ref={singleCameraFrameRef} className="single-camera-frame">
        <video ref={videoRef} className="single-camera-video" autoPlay playsInline muted />
        <canvas ref={canvasRef} style={{ display: "none" }} />

        {!cameraReady && !cameraError && (
          <div className="camera-loading">
            <Camera size={28} />
            <span>Connecting camera...</span>
          </div>
        )}

        {cameraError && (
          <div className="camera-loading">
            <Camera size={28} />
            <span>{cameraError}</span>
          </div>
        )}

        <div className="camera-overlay" />
        <div className="camera-gridlines" />
        <div className="single-camera-label">{cameraId}</div>

        <LiveHashStream cameraEvents={cameraEvents} />

        <div className="camera-frame-actions">
          <button type="button" className="live-mode-btn" onClick={handleOpenFocusMode}>
            <Maximize2 size={15} />
            <span>Full View</span>
          </button>

          <button type="button" className="live-mode-btn" onClick={handleToggleBrowserFullscreen}>
            {isBrowserFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            <span>{isBrowserFullscreen ? "Exit Fullscreen" : "Browser Fullscreen"}</span>
          </button>
        </div>

        <LiveStatusPills
          movedActive={debugStats.movedTriggered}
          tamperActive={debugStats.tamperTriggered}
          zoneActive={debugStats.zoneTriggered}
        />

        <ZoneOverlay
          zone={zone}
          isDrawing={isDrawing}
          drawRect={drawRect}
          drawingMode={drawingMode}
          zoneArmed={isFeatureActiveNow(activeArms, "restrictedZone")}
          onPointerDown={handleZonePointerDown}
        />
      </div>

      {isFocusMode && (
        <div className="focus-overlay">
          <div ref={focusOverlayRef} className="focus-overlay-shell">
            <div className="focus-overlay-topbar">
              <div className="focus-overlay-copy">
                <div className="focus-overlay-title">{cameraId} Full View</div>
                <div className="focus-overlay-subtitle">Expanded operator view for live review and incident monitoring</div>
              </div>

              <div className="focus-overlay-actions">
                <button type="button" className="focus-action-btn" onClick={handleToggleBrowserFullscreen}>
                  {isBrowserFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  <span>{isBrowserFullscreen ? "Exit Fullscreen" : "Browser Fullscreen"}</span>
                </button>

                <button type="button" className="focus-action-btn" onClick={handleCloseFocusMode}>
                  <X size={16} />
                  <span>Close</span>
                </button>
              </div>
            </div>

            <div className="focus-overlay-frame">
              <video ref={fullViewVideoRef} className="single-camera-video focus-overlay-video" autoPlay playsInline muted />

              {!cameraReady && !cameraError && (
                <div className="camera-loading">
                  <Camera size={28} />
                  <span>Connecting camera...</span>
                </div>
              )}

              {cameraError && (
                <div className="camera-loading">
                  <Camera size={28} />
                  <span>{cameraError}</span>
                </div>
              )}

              <div className="camera-overlay" />
              <div className="camera-gridlines" />
              <div className="single-camera-label">{cameraId}</div>

              <LiveHashStream cameraEvents={cameraEvents} />

              <LiveStatusPills
                movedActive={debugStats.movedTriggered}
                tamperActive={debugStats.tamperTriggered}
                zoneActive={debugStats.zoneTriggered}
              />

              <ZoneOverlay
                zone={zone}
                isDrawing={false}
                drawRect={null}
                drawingMode={false}
                zoneArmed={isFeatureActiveNow(activeArms, "restrictedZone")}
                onPointerDown={() => {}}
              />
            </div>

            <div className="focus-overlay-footer">
              <span>Use Full View for operator review before investigating logs and hash events.</span>
              <span>{isFeatureActiveNow(activeArms, "restrictedZone") ? "Restricted zone armed" : "Restricted zone inactive"}</span>
            </div>
          </div>
        </div>
      )}

      <div className="baseline-toolbar">
        <button className="baseline-btn primary" onClick={handleSetBaseline}>
          <Crosshair size={16} />
          <span>Set Baseline</span>
        </button>
        <button className="baseline-btn" onClick={handleClearBaseline}>
          <RotateCcw size={16} />
          <span>Clear Baseline</span>
        </button>
        <button className={`baseline-btn ${drawingMode ? "baseline-btn-active" : ""}`} onClick={handleEnableZoneDraw}>
          <PencilRuler size={16} />
          <span>{drawingMode ? "Drawing Zone..." : "Draw Restricted Zone"}</span>
        </button>
        <button className="baseline-btn" onClick={handleClearZone}>
          <Trash2 size={16} />
          <span>Clear Zone</span>
        </button>
      </div>

      <DiagnosticsPanel debugStats={debugStats} />
      <DetectorStatePanel debugStats={debugStats} zone={zone} featureArms={activeArms} />
    </div>
  );
}

function RightRail({
  cameraId,
  events,
  zone,
  featureArms,
  onFeatureArmChange,
  onFeatureScheduleToggle,
  onFeatureTimeChange,
}) {
  const details = cameraDetails[cameraId] || cameraDetails["CAM-01"];
  const cameraEvents = events[cameraId] || [];

  return (
    <div className="camera-detail-side compact-side">
      <FeatureArmPanel
        cameraId={cameraId}
        featureArms={featureArms}
        onFeatureArmChange={onFeatureArmChange}
        onFeatureScheduleToggle={onFeatureScheduleToggle}
        onFeatureTimeChange={onFeatureTimeChange}
      />

      <Card title="Recent Event Logs" className="sticky-rail-card">
        <div className="detail-table">
          <div className="detail-table-head">
            <span>Time</span>
            <span>Type</span>
            <span>Severity</span>
            <span>Status</span>
            <span>ID</span>
          </div>

          {cameraEvents.map((log, idx) => (
            <div key={`${log.eventId}-${idx}`} className="detail-table-row">
              <span>{formatEventTime(log.ts)}</span>
              <span>{log.eventType}</span>
              <span>{log.severity}</span>
              <span>{log.status || "Logged"}</span>
              <span className="hash-snippet">{log.eventId}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Restricted Zone">
        {zone ? (
          <div className="zone-summary-box">
            <div className="status-row">
              <span className="muted">Label</span>
              <span>{zone.label}</span>
            </div>
            <div className="status-row">
              <span className="muted">Armed</span>
              <span>{featureArms.restrictedZone ? "ON" : "OFF"}</span>
            </div>
            <div className="status-row">
              <span className="muted">Hashing</span>
              <span>{featureArms.zoneHashing ? "ON" : "OFF"}</span>
            </div>
            <div className="status-row">
              <span className="muted">X</span>
              <span>{zone.x.toFixed(3)}</span>
            </div>
            <div className="status-row">
              <span className="muted">Y</span>
              <span>{zone.y.toFixed(3)}</span>
            </div>
            <div className="status-row">
              <span className="muted">Width</span>
              <span>{zone.width.toFixed(3)}</span>
            </div>
            <div className="status-row">
              <span className="muted">Height</span>
              <span>{zone.height.toFixed(3)}</span>
            </div>
          </div>
        ) : (
          <div className="muted">No restricted zone drawn yet.</div>
        )}
      </Card>

      <MetricCard title="Camera State" value={details.status} subtitle="Direct device availability" />
      <MetricCard title="Integrity" value={details.integrity} subtitle="Hash and audit verification" />
      <MetricCard
        title="Last Event"
        value={cameraEvents[0] ? formatEventTime(cameraEvents[0].ts) : details.lastEvent.split(" ")[1]}
        subtitle={cameraEvents[0] ? cameraEvents[0].eventType : details.lastEvent.split(" ")[0]}
      />

      <Card title="Latest Runtime Event">
        {cameraEvents[0] ? (
          <div className="runtime-event-box">
            <div className="runtime-event-top">
              <Badge tone={severityTone(cameraEvents[0].severity)}>{cameraEvents[0].severity}</Badge>
              <span className="muted small">{formatEventTime(cameraEvents[0].ts)}</span>
            </div>
            <div className="runtime-event-type">{cameraEvents[0].eventType}</div>
            <div className="runtime-event-meta">
              <div>Motion: {cameraEvents[0].meta.motionScore ?? 0}</div>
              <div>EMA: {cameraEvents[0].meta.ema ?? 0}</div>
              <div>Burst: {cameraEvents[0].meta.burst ?? 0}</div>
              <div>High Motion Armed: {cameraEvents[0].meta.highMotionArmed === false ? "NO" : "YES"}</div>
              <div>High Motion Suppressed: {cameraEvents[0].meta.highMotionSuppressed ? "YES" : "NO"}</div>
              <div>Tamper: {cameraEvents[0].meta.tamperDetected ? "YES" : "NO"}</div>
              <div>Reason: {cameraEvents[0].meta.tamperReason || "N/A"}</div>
              <div>Moved: {cameraEvents[0].meta.movedDetected ? "YES" : "NO"}</div>
              <div>Distance: {cameraEvents[0].meta.movedDistance ?? 0}</div>
              <div>Zone Entry: {cameraEvents[0].eventType === "ZONE_ENTRY" ? "YES" : "NO"}</div>
              <div>Original Event: {cameraEvents[0].meta.originalEventType || "N/A"}</div>
            </div>
          </div>
        ) : (
          <div className="muted">No runtime events yet.</div>
        )}
      </Card>

      <Card title="Camera Status">
        <div className="status-stack">
          <div className="status-row">
            <div className="status-label-wrap">
              <Server size={16} />
              <span>Node</span>
            </div>
            <span>{details.node}</span>
          </div>
          <div className="status-row">
            <div className="status-label-wrap">
              <ShieldCheck size={16} />
              <span>Integrity</span>
            </div>
            <span>{details.integrity}</span>
          </div>
          <div className="status-row">
            <div className="status-label-wrap">
              <Clock3 size={16} />
              <span>Last Event</span>
            </div>
            <span>{cameraEvents[0] ? cameraEvents[0].ts : details.lastEvent}</span>
          </div>
          <div className="status-row">
            <div className="status-label-wrap">
              <Camera size={16} />
              <span>Resolution</span>
            </div>
            <span>{details.resolution}</span>
          </div>
          <div className="status-row">
            <div className="status-label-wrap">
              <Activity size={16} />
              <span>Firmware</span>
            </div>
            <span>{details.firmware}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

function CameraDetailPage({
  cameraId,
  events,
  zonesByCamera,
  featureArmsByCamera,
  onBack,
  onNewEvent,
  onZoneChange,
  onFeatureArmChange,
  onFeatureScheduleToggle,
  onFeatureTimeChange,
}) {
  const currentZone = zonesByCamera[cameraId] || null;
  const currentFeatureArms = featureArmsByCamera[cameraId] || getDefaultFeatureArms();

  return (
    <div className="page-content">
      <div className="camera-detail-top">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          <span>Back to Camera Grid</span>
        </button>
        <div className="camera-detail-heading">
          <div>
            <h2 className="hero-title">{cameraId}</h2>
            <p className="hero-subtitle">Dedicated live view with real-time event monitoring</p>
          </div>
          <Badge tone="green">Live</Badge>
        </div>
      </div>

      <div className="camera-detail-grid camera-detail-grid-condensed">
        <div className="camera-detail-main">
          <Card title="Live Camera Feed">
            <SingleCameraViewer
              cameraId={cameraId}
              onNewEvent={onNewEvent}
              zone={currentZone}
              onZoneChange={onZoneChange}
              featureArms={currentFeatureArms}
              cameraEvents={events[cameraId] || []}
            />
          </Card>
        </div>

        <RightRail
          cameraId={cameraId}
          events={events}
          zone={currentZone}
          featureArms={currentFeatureArms}
          onFeatureArmChange={onFeatureArmChange}
          onFeatureScheduleToggle={onFeatureScheduleToggle}
          onFeatureTimeChange={onFeatureTimeChange}
        />
      </div>
    </div>
  );
}

function HomePage({ responseTimeMs }) {
  return (
    <div className="page-content">
      <div className="metrics-grid">
        <MetricCard title="System Health" value="98.4%" subtitle="All major services nominal" />
        <MetricCard title="New Alerts" value="27" subtitle="5 critical in the last 24h" />
        <MetricCard title="Response Time" value={`${responseTimeMs}ms`} subtitle="Live edge detection response" />
        <MetricCard title="Coverage" value="3" subtitle="Active cameras across all monitored zones" />
      </div>

      <div className="grid-two">
        <Card title="System Status">
          {[
            ["Server A", 98, "Low"],
            ["Server B", 75, "Medium"],
            ["Server C", 85, "High"],
            ["Server D", 50, "Threat"],
            ["Server E", 100, "Nominal"],
          ].map(([label, val, threat]) => (
            <div key={label} className="progress-row">
              <div className="progress-head">
                <span>{label}</span>
                <span className="muted">Threat: {threat}</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${val}%` }} />
              </div>
            </div>
          ))}
        </Card>

        <Card title="New Alerts">
          <MiniBarChart />
        </Card>
      </div>

      <div className="grid-two">
        <Card title="Security Status">
          <MiniBarChart />
        </Card>

        <Card title="Security Overview">
          <div className="overview-grid">
            <div className="overview-col">
              <div className="overview-row"><span className="muted">Incident Response</span><span>1,200,000</span></div>
              <div className="overview-row"><span className="muted">Total Alerts</span><span>600,000</span></div>
              <div className="overview-row"><span className="muted">Threshold Achievement</span><span>150%</span></div>
            </div>
            <div className="overview-col">
              <div className="overview-row"><span className="muted">Alerts per User</span><span>12,500</span></div>
              <div className="overview-row"><span className="muted">Avg. Edge Response</span><span>{responseTimeMs}ms</span></div>
              <div className="overview-row"><span className="muted">Node Reliability</span><span>99.93%</span></div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function AccessLogPage({ onCameraClick }) {
  return (
    <div className="page-content">
      <div className="split-grid">
        <div className="main-stack">
          <Card title="Recent Alerts">
            <div className="stack-sm">
              {alerts.map((alert) => (
                <button
                  key={alert.id}
                  className="activity-item activity-button"
                  onClick={() => onCameraClick(alert.camera)}
                >
                  <div className="activity-top">
                    <span className="activity-id">{alert.id}</span>
                    <Badge tone={severityTone(alert.severity)}>{alert.severity}</Badge>
                  </div>
                  <div className="overview-row">
                    <span>{alert.site}</span>
                    <span>{alert.camera}</span>
                  </div>
                  <div className="overview-row muted">
                    <span>{alert.status}</span>
                    <span>{alert.time}</span>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="side-stack">
          <MetricCard title="Critical" value="5" subtitle="Immediate review queue" />
          <MetricCard title="Warnings" value="14" subtitle="Operator triage active" />
          <MetricCard title="Messages" value="8" subtitle="Non-critical updates" />
        </div>
      </div>
    </div>
  );
}

function NodeApprovalPage() {
  return (
    <div className="page-content">
      <div className="split-grid">
        <div className="main-stack">
          <Card title="Node Approval Queue">
            <div className="stack-sm">
              {nodes.map((node) => (
                <div key={node.name} className="node-row">
                  <div>
                    <div className="activity-id">{node.name}</div>
                    <div className="muted">{node.region}</div>
                  </div>
                  <div className="node-actions">
                    <Badge tone={severityTone(node.state)}>{node.state}</Badge>
                    <span className="muted">{node.uptime}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="side-stack">
          <MetricCard title="Approved Nodes" value="18" subtitle="Across active security zones" />
          <MetricCard title="Pending Reviews" value="4" subtitle="Awaiting operator confirmation" />
          <MetricCard title="Sync Integrity" value="99.93%" subtitle="Cluster consensus health" />
        </div>
      </div>
    </div>
  );
}

function StoredFootagePage({ onCameraClick }) {
  return (
    <div className="page-content">
      <div className="split-grid-alt">
        <div className="side-stack">
          {["Date", "Time", "Camera #"].map((field) => (
            <Card key={field} title={field}>
              <button className="full-purple-btn">Filter</button>
            </Card>
          ))}
        </div>

        <div className="main-stack">
          <div className="section-title-center">Stored Footage</div>
          <Card>
            <CameraWall onCameraClick={onCameraClick} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function AIAnalyticsPage({ onCameraClick }) {
  const filters = ["Critical", "Warnings", "Updates", "Acknowledgments", "All Alerts", "Messages"];
  const [checked, setChecked] = useState(filters);

  const toggle = (item) => {
    setChecked((prev) => (prev.includes(item) ? prev.filter((v) => v !== item) : [...prev, item]));
  };

  return (
    <div className="page-content">
      <div className="split-grid">
        <div className="main-stack">
          <div className="section-title-center big-title">Camera Live Footage</div>
          <Card>
            <CameraWall onCameraClick={onCameraClick} />
          </Card>
        </div>

        <div className="side-stack">
          <Card title="Filter Security Invariance">
            <div className="stack-sm">
              {filters.map((item) => {
                const active = checked.includes(item);
                return (
                  <button key={item} onClick={() => toggle(item)} className="filter-row">
                    <span>{item}</span>
                    {active ? <CheckSquare size={18} className="purple-icon" /> : <Square size={18} className="muted-icon" />}
                  </button>
                );
              })}

              <div className="two-btn-grid">
                <button className="white-btn">Select All</button>
                <button className="ghost-btn">Deselect</button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function CameraGroupsPage({ onCameraClick }) {
  return (
    <div className="page-content">
      <div className="split-grid">
        <div className="main-stack">
          <Card>
            <CameraWall selectable onCameraClick={onCameraClick} />
          </Card>
        </div>

        <div className="side-stack">
          <Card title="Camera Selection (Multiview)">
            <div className="text-stack">
              <div>Select a subset of cameras or zones for the main screen.</div>
              <div>Click any single camera tile to elevate it into focused review.</div>
              <div>Use group presets for North, South, Perimeter, Warehouse, and HQ.</div>
            </div>
          </Card>

          <Card title="Policy Notes">
            <div className="text-stack muted">
              <div>Security invariants can be attached per zone.</div>
              <div>Operator permissions can be scoped by camera group.</div>
              <div>Selections persist as a saved monitoring view.</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function HashLedgerPage({ blockchainEvents, blockchainStatus, onCameraClick }) {
  const cameraLabels = footage.map((camera) => camera.label);

  const summary = useMemo(() => {
    const allEvents = cameraLabels.flatMap((cameraId) => blockchainEvents[cameraId] || []);
    const heartbeatCount = allEvents.filter((event) => event.eventType === "SYSTEM_RUNNING_FINE").length;
    const readyHashes = allEvents.filter((event) => Boolean(getPrimaryHashValue(event))).length;

    return {
      totalRecords: allEvents.length,
      heartbeatCount,
      readyHashes,
    };
  }, [blockchainEvents, cameraLabels]);

  return (
    <div className="page-content">
      <div className="metrics-grid hash-metrics-grid">
        <MetricCard title="Hash Records" value={String(summary.totalRecords)} subtitle="Pulled directly from Hyperledger Fabric" />
        <MetricCard title="Hash-Ready Events" value={String(summary.readyHashes)} subtitle="Primary, evidence, or metadata hashes available" />
        <MetricCard title="System Running Fine" value={String(summary.heartbeatCount)} subtitle="Recurring system integrity events on-chain" />
        <MetricCard
          title="Fabric Status"
          value={blockchainStatus.connected ? "Connected" : blockchainStatus.loading ? "Syncing" : "Offline"}
          subtitle={blockchainStatus.lastSync ? `Last sync ${formatEventTime(blockchainStatus.lastSync)}` : "Awaiting first sync"}
        />
      </div>

      <div className={`hash-ledger-status-banner ${blockchainStatus.connected ? "hash-ledger-status-online" : "hash-ledger-status-offline"}`}>
        <div className="hash-ledger-status-title">
          {blockchainStatus.connected ? "Blockchain ledger live" : blockchainStatus.loading ? "Syncing blockchain ledger..." : "Blockchain ledger unavailable"}
        </div>
        <div className="hash-ledger-status-copy">
          {blockchainStatus.connected
            ? `Channel ${blockchainStatus.channel || "bvschannel"} · Chaincode ${blockchainStatus.chaincode || "hashledger"}`
            : blockchainStatus.error || "The UI is currently showing the last synced blockchain records."}
        </div>
      </div>

      <div className="hash-ledger-grid">
        {cameraLabels.map((cameraId) => {
          const cameraEvents = blockchainEvents[cameraId] || [];
          const details = cameraDetails[cameraId] || { location: "Unknown" };

          return (
            <Card key={cameraId} className="hash-ledger-card">
              <div className="hash-ledger-header">
                <div className="hash-ledger-title-wrap">
                  <div className="hash-ledger-title">{cameraId} Hashes</div>
                  <div className="hash-ledger-subtitle">{details.location} · {countReadyHashes(cameraEvents)} records anchored</div>
                </div>

                <button type="button" className="ghost-btn hash-ledger-open-btn" onClick={() => onCameraClick(cameraId)}>
                  Open Camera
                </button>
              </div>

              <div className="hash-ledger-table-wrap">
                <div className="hash-ledger-table hash-ledger-table-head">
                  <span>Time</span>
                  <span>Type</span>
                  <span>Primary Hash</span>
                  <span>Evidence</span>
                  <span>Metadata</span>
                  <span>Status</span>
                </div>

                {cameraEvents.map((event) => {
                  const primaryHash = getPrimaryHashValue(event);
                  const evidenceHash = String(event?.evidenceHash || "pending");
                  const metadataHash = getMetadataHashValue(event);
                  const evidenceDisplay = evidenceHash && evidenceHash !== "pending" ? evidenceHash : "pending";

                  return (
                    <div key={event.eventId} className="hash-ledger-table hash-ledger-table-row">
                      <span>{formatEventTime(event.ts)}</span>
                      <span>{event.eventType}</span>
                      <span className="hash-ledger-code">{primaryHash}</span>
                      <span className="hash-ledger-code">{evidenceDisplay}</span>
                      <span className="hash-ledger-code">{metadataHash}</span>
                      <span>{event.status || "Logged"}</span>
                    </div>
                  );
                })}

                {!cameraEvents.length && (
                  <div className="hash-ledger-empty">No blockchain hashes for this camera yet.</div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function GroupLanding({ title, onCameraClick }) {
  return (
    <div className="page-content">
      <div className="split-grid">
        <div className="main-stack">
          <Card>
            <div className="zone-head">
              <div>
                <div className="zone-title">{title}</div>
                <div className="hero-subtitle">Site overview and multiview monitoring shell.</div>
              </div>
              <Badge tone="purple">Active Zone</Badge>
            </div>
            <CameraWall onCameraClick={onCameraClick} />
          </Card>
        </div>

        <div className="side-stack">
          <MetricCard title="Active Cameras" value="3" subtitle={`Coverage across ${title}`} />
          <MetricCard title="Open Alerts" value="6" subtitle="2 critical, 1 escalated" />
          <MetricCard title="Operator State" value="Online" subtitle="Primary desk actively monitoring" />
        </div>
      </div>
    </div>
  );
}

function LoginPage({ onEnter }) {
  const [show, setShow] = useState(false);

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="login-brand">Block Vault Systems</div>

        <div className="login-center">
          <div className="login-logo-box refined-logo-box">
            <div className="logo-glow-ring">
              <ShieldAlert size={110} />
            </div>
          </div>
          <div className="login-caption refined-caption">
            Secure monitoring, incident visibility, and audit-ready infrastructure for modern physical security operations.
          </div>
        </div>

        <div className="login-footer">Enterprise monitoring · alert review · operator workflow</div>
      </div>

      <div className="login-right">
        <div className="login-card">
          <div className="login-title">BVS</div>

          <input className="login-input" placeholder="Username" />

          <div className="password-wrap">
            <input
              className="login-input"
              type={show ? "text" : "password"}
              placeholder="Password"
            />
            <button className="password-toggle" onClick={() => setShow((v) => !v)}>
              {show ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          <button className="signin-btn" onClick={onEnter}>Sign in</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [current, setCurrent] = useState("login");
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [cameraEvents, setCameraEvents] = useState(initialCameraEvents);
  const [blockchainHashesByCamera, setBlockchainHashesByCamera] = useState(() => createEmptyLedgerByCamera());
  const [blockchainStatus, setBlockchainStatus] = useState({
    loading: false,
    connected: false,
    error: "",
    channel: "",
    chaincode: "",
    lastSync: "",
  });
  const [zonesByCamera, setZonesByCamera] = useState(initialZonesByCamera);
  const [featureArmsByCamera, setFeatureArmsByCamera] = useState(initialFeatureArmsByCamera);
  const [responseTimeMs, setResponseTimeMs] = useState(50);

  useEffect(() => {
    const updateResponseTime = () => {
      const startedAt = performance.now();

      requestAnimationFrame(() => {
        const frameCost = performance.now() - startedAt;
        const edgeProcessingBudget = 46;
        const jitter = Math.round(Math.random() * 8 - 4);
        const nextValue = Math.max(45, Math.min(58, Math.round(edgeProcessingBudget + frameCost + jitter)));

        setResponseTimeMs(nextValue);
      });
    };

    updateResponseTime();

    const intervalId = window.setInterval(updateResponseTime, 1400);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const fetchBlockchainHashes = useCallback(async () => {
    setBlockchainStatus((prev) => ({
      ...prev,
      loading: true,
      error: "",
    }));

    try {
      const [healthResponse, groupedResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/health`),
        fetch(`${API_BASE_URL}/api/hashes/grouped`),
      ]);

      if (!healthResponse.ok) {
        throw new Error(`Health request failed with status ${healthResponse.status}`);
      }

      if (!groupedResponse.ok) {
        throw new Error(`Grouped hash request failed with status ${groupedResponse.status}`);
      }

      const health = await healthResponse.json();
      const grouped = await groupedResponse.json();

      setBlockchainHashesByCamera(buildLedgerState(grouped));
      setBlockchainStatus({
        loading: false,
        connected: true,
        error: "",
        channel: health.channel || "bvschannel",
        chaincode: health.chaincode || "hashledger",
        lastSync: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Blockchain sync failed:", error);
      setBlockchainStatus((prev) => ({
        ...prev,
        loading: false,
        connected: false,
        error: error.message || "Unable to reach BlockVault API",
      }));
    }
  }, []);

  useEffect(() => {
    fetchBlockchainHashes();

    const intervalId = window.setInterval(() => {
      fetchBlockchainHashes();
    }, 12000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchBlockchainHashes]);

  const syncHashEventToBlockchain = useCallback(async (event) => {
    try {
      const payload = {
        eventId: event.eventId,
        cameraId: event.cameraId,
        eventType: event.eventType,
        severity: event.severity,
        ts: event.ts,
        status: event.status || "Committed",
        meta: event.meta || {},
      };

      const response = await fetch(`${API_BASE_URL}/api/hashes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || `Hash sync failed with status ${response.status}`);
      }

      const savedRecord = normalizeBlockchainEvent(await response.json());
      if (!savedRecord) return;

      setBlockchainHashesByCamera((prev) => ({
        ...prev,
        [savedRecord.cameraId]: upsertEventByEventId(prev[savedRecord.cameraId] || [], savedRecord),
      }));

      setCameraEvents((prev) => {
        const existing = prev[savedRecord.cameraId] || [];
        const merged = existing.map((runtimeEvent) =>
          runtimeEvent.eventId === savedRecord.eventId
            ? mergeRuntimeEventWithBlockchainRecord(runtimeEvent, savedRecord)
            : runtimeEvent
        );

        return {
          ...prev,
          [savedRecord.cameraId]: sortEventsNewestFirst(merged).slice(0, 20),
        };
      });

      setBlockchainStatus((prev) => ({
        ...prev,
        connected: true,
        error: "",
        lastSync: new Date().toISOString(),
      }));
    } catch (error) {
      console.error("Blockchain write failed:", error);
      setBlockchainStatus((prev) => ({
        ...prev,
        connected: false,
        error: error.message || "Unable to write hash event to Fabric",
      }));
    }
  }, []);

  const openCameraDetail = (cameraId) => {
    setSelectedCamera(cameraId);
  };

  const closeCameraDetail = () => {
    setSelectedCamera(null);
  };

  const handleNewCameraEvent = (event) => {
    const normalizedEvent = {
      ...event,
      eventId:
        event.eventId ||
        `evt_${String(event.cameraId || "cam").toLowerCase().replace(/[^a-z0-9]/g, "")}_${Date.now()}`,
    };

    setCameraEvents((prev) => {
      const existing = prev[normalizedEvent.cameraId] || [];
      return {
        ...prev,
        [normalizedEvent.cameraId]: sortEventsNewestFirst([normalizedEvent, ...existing]).slice(0, 20),
      };
    });

    void syncHashEventToBlockchain(normalizedEvent);
  };

  const handleZoneChange = (cameraId, zone) => {
    setZonesByCamera((prev) => ({
      ...prev,
      [cameraId]: zone,
    }));
  };

  const handleFeatureArmChange = (cameraId, featureKey) => {
    setFeatureArmsByCamera((prev) => {
      const currentArms = prev[cameraId] || getDefaultFeatureArms();
      return {
        ...prev,
        [cameraId]: {
          ...currentArms,
          [featureKey]: !currentArms[featureKey],
        },
      };
    });
  };

  const handleFeatureScheduleToggle = (cameraId, featureKey) => {
    const { scheduleEnabledKey } = getFeatureScheduleKeys(featureKey);

    setFeatureArmsByCamera((prev) => {
      const currentArms = prev[cameraId] || getDefaultFeatureArms();
      return {
        ...prev,
        [cameraId]: {
          ...currentArms,
          [scheduleEnabledKey]: !currentArms[scheduleEnabledKey],
        },
      };
    });
  };

  const handleFeatureTimeChange = (cameraId, settingKey, value) => {
    setFeatureArmsByCamera((prev) => {
      const currentArms = prev[cameraId] || getDefaultFeatureArms();
      return {
        ...prev,
        [cameraId]: {
          ...currentArms,
          [settingKey]: value,
        },
      };
    });
  };

  const page = useMemo(() => {
    if (selectedCamera) {
      return {
        title: `${selectedCamera} Detail`,
        node: (
          <CameraDetailPage
            cameraId={selectedCamera}
            events={cameraEvents}
            zonesByCamera={zonesByCamera}
            featureArmsByCamera={featureArmsByCamera}
            onBack={closeCameraDetail}
            onNewEvent={handleNewCameraEvent}
            onZoneChange={handleZoneChange}
            onFeatureArmChange={handleFeatureArmChange}
            onFeatureScheduleToggle={handleFeatureScheduleToggle}
            onFeatureTimeChange={handleFeatureTimeChange}
          />
        ),
      };
    }

    switch (current) {
      case "home":
        return { title: "Security Dashboard", node: <HomePage responseTimeMs={responseTimeMs} /> };
      case "access":
        return { title: "Access Log", node: <AccessLogPage onCameraClick={openCameraDetail} /> };
      case "approval":
        return { title: "Node Approval", node: <NodeApprovalPage /> };
      case "footage":
        return { title: "Stored Footage", node: <StoredFootagePage onCameraClick={openCameraDetail} /> };
      case "hashes":
        return {
          title: "Hash Ledger",
          node: (
            <HashLedgerPage
              blockchainEvents={blockchainHashesByCamera}
              blockchainStatus={blockchainStatus}
              onCameraClick={openCameraDetail}
            />
          ),
        };
      case "analytics":
        return { title: "AI Analytics", node: <AIAnalyticsPage onCameraClick={openCameraDetail} /> };
      case "groups":
        return { title: "Camera Groups", node: <CameraGroupsPage onCameraClick={openCameraDetail} /> };
      case "north":
        return { title: "North Facility", node: <GroupLanding title="North Facility" onCameraClick={openCameraDetail} /> };
      case "south":
        return { title: "South Facility", node: <GroupLanding title="South Facility" onCameraClick={openCameraDetail} /> };
      case "perimeter":
        return { title: "Perimeter", node: <GroupLanding title="Perimeter" onCameraClick={openCameraDetail} /> };
      case "warehouse":
        return { title: "Warehouse", node: <GroupLanding title="Warehouse" onCameraClick={openCameraDetail} /> };
      case "hq":
        return { title: "HQ", node: <GroupLanding title="HQ" onCameraClick={openCameraDetail} /> };
      default:
        return { title: "Login", node: null };
    }
  }, [
    blockchainHashesByCamera,
    blockchainStatus,
    cameraEvents,
    current,
    featureArmsByCamera,
    responseTimeMs,
    selectedCamera,
    zonesByCamera,
  ]);

  if (current === "login") {
    return <LoginPage onEnter={() => setCurrent("home")} />;
  }

  return (
    <div className="app-shell">
      <div className="app-layout">
        <Sidebar current={current} setCurrent={setCurrent} onCloseCameraDetail={closeCameraDetail} />
        <main className="main-area">
          <TopBar
            title={page.title}
            searchPlaceholder={current === "access" ? "Search Security" : "Search security events"}
          />
          {page.node}
        </main>
      </div>
    </div>
  );
}
