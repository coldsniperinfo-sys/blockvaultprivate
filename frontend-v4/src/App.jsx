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
} from "lucide-react";
import "./index.css";
import { createMotionDetector } from "./detectors/motionDetector";
import { createTamperDetector } from "./detectors/tamperDetector";
import { createMovedDetector } from "./detectors/movedDetector";
import { createZoneEntryDetector } from "./detectors/zoneEntryDetector";
import { getAnalysisDimensions, getCameraSource, getMediaDimensions } from "./cameraSources";

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
  "CAM-01": [],
  "CAM-02": [],
  "CAM-03": [],
};

const cameraDetails = {
  "CAM-01": {
    name: "CAM-01",
    location: "North Facility",
    node: "Node-01",
  },
  "CAM-02": {
    name: "CAM-02",
    location: "Perimeter",
    node: "Node-02",
  },
  "CAM-03": {
    name: "CAM-03",
    location: "Warehouse",
    node: "Node-03",
  },
};

const chartBars = [72, 54, 81, 63, 77, 49, 84, 58, 69, 74, 61, 86];

const navGroups = {
  main: [
    { key: "home", label: "Overview", icon: Shield },
    { key: "groups", label: "Cameras", icon: Camera },
    { key: "access", label: "Events", icon: Activity },
    { key: "hashes", label: "Evidence Ledger", icon: ShieldCheck },
  ],
};

const BLOCKVAULT_RUNTIME_HOST =
  typeof window !== "undefined" && window.location?.hostname
    ? window.location.hostname
    : "localhost";

const API_BASE_URL =
  (
    import.meta.env.VITE_BLOCKVAULT_API_URL ||
    "/bvs-api"
  ).replace(/\/$/, "");

const CAMERA_SERVICE_BASE_URL =
  (
    import.meta.env.VITE_CAMERA_SERVICE_URL ||
    "/bvs-camera"
  ).replace(/\/$/, "");


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

function clampUnit(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function getFeedFreshnessState(value) {
  if (!Number.isFinite(value)) return "unknown";
  if (value <= 50) return "excellent";
  if (value <= 100) return "good";
  if (value <= 250) return "degraded";
  return "stale";
}

function getCameraOperationalState(cameraId, cameraHealth) {
  const source = getCameraSource(cameraId);

  if (source.kind === "offline") {
    return {
      label: "Offline",
      tone: "amber",
      relayHealth: "Unavailable",
      ingestLabel: "Stopped",
      frameAgeLabel: "No frame",
      connectedClientsLabel: "0",
      state: "offline",
    };
  }

  if (!cameraHealth) {
    return {
      label: "Checking",
      tone: "amber",
      relayHealth: "Awaiting health",
      ingestLabel: "Checking",
      frameAgeLabel: "—",
      connectedClientsLabel: "—",
      state: "checking",
    };
  }

  const ingestRunning = Boolean(cameraHealth.ingestRunning);
  const hasFrame = Boolean(cameraHealth.hasFrame);
  const frameAge = Number(cameraHealth.lastFrameAgeMs);
  const hasFrameAge = Number.isFinite(frameAge);

  if (!ingestRunning) {
    return {
      label: "Offline",
      tone: "amber",
      relayHealth: "Ingest stopped",
      ingestLabel: "Stopped",
      frameAgeLabel: hasFrameAge ? `${Math.round(frameAge)} ms` : "No frame",
      connectedClientsLabel: String(cameraHealth.connectedClients ?? 0),
      state: "offline",
    };
  }

  if (!hasFrame) {
    return {
      label: "Degraded",
      tone: "amber",
      relayHealth: "No current frame",
      ingestLabel: "Running",
      frameAgeLabel: "No frame",
      connectedClientsLabel: String(cameraHealth.connectedClients ?? 0),
      state: "degraded",
    };
  }

  if (hasFrameAge && frameAge > 1000) {
    return {
      label: "Stale",
      tone: "amber",
      relayHealth: "Frame stale",
      ingestLabel: "Running",
      frameAgeLabel: `${Math.round(frameAge)} ms`,
      connectedClientsLabel: String(cameraHealth.connectedClients ?? 0),
      state: "stale",
    };
  }

  return {
    label: "Live",
    tone: "green",
    relayHealth: "Healthy",
    ingestLabel: "Running",
    frameAgeLabel: hasFrameAge ? `${Math.round(frameAge)} ms` : "Live",
    connectedClientsLabel: String(cameraHealth.connectedClients ?? 0),
    state: "live",
  };
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
  if (evidenceHash && evidenceHash !== "pending") return evidenceHash;
  if (primaryHash) return primaryHash;
  return String(event?.eventId || "");
}

function shortenHash(value) {
  if (!value) return "event";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function addFrameEvidence(event, canvas, sourceKind) {
  if (!event || !canvas || canvas.width === 0 || canvas.height === 0) return event;

  try {
    const evidence = canvas.toDataURL("image/jpeg", 0.72);
    return {
      ...event,
      evidence,
      snapshotRef: `${event.cameraId}:${event.eventId || event.ts}`,
      meta: {
        ...(event.meta || {}),
        source: sourceKind === "mjpeg" ? "axis-camera" : "browser-camera",
        evidenceFrameWidth: canvas.width,
        evidenceFrameHeight: canvas.height,
        evidenceFormat: "image/jpeg",
      },
    };
  } catch (error) {
    console.error("Unable to capture frame evidence:", error);
    return event;
  }
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

function TopBar({
  title,
  blockchainStatus,
  authUser,
  onLogout,
}) {
  const fabricLabel = blockchainStatus?.connected
    ? "Fabric Connected"
    : blockchainStatus?.loading
      ? "Fabric Connecting"
      : "Fabric Offline";

  const fabricTone = blockchainStatus?.connected
    ? "badge-green"
    : "badge-amber";

  return (
    <div className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <h1 className="page-title">{title}</h1>
        </div>

        <div className="topbar-right">
          <span className={`badge ${fabricTone}`}>
            {fabricLabel}
          </span>

          <div
            className="operator-session-chip"
            aria-label={`Logged in as ${
              authUser || "admin"
            }`}
          >
            <UserCircle2 size={16} />

            <div className="operator-session-copy">
              <span className="operator-session-label">
                Logged in as
              </span>

              <strong>
                {authUser || "admin"}
              </strong>
            </div>
          </div>

          <button
            className="operator-logout-btn"
            type="button"
            onClick={onLogout}
            aria-label="Log out of BlockVault"
            title="Log Out"
          >
            <Power size={15} />
            <span>Log Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ current, setCurrent, onCloseCameraDetail }) {
  return (
    <aside className="sidebar">
      <div className="brand" aria-label="BlockVault Systems">
        <div className="brand-orb" aria-hidden="true" />
        <div className="brand-copy">
          <div className="brand-title">BLOCKVAULT</div>
          <div className="brand-subtitle">BVS · Secure at creation</div>
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

function CameraMedia({
  cameraId,
  className,
  elementRef,
  webcamStream = null,
  onReady,
  onError,
  style = undefined,
}) {
  const source = useMemo(() => getCameraSource(cameraId), [cameraId]);
  const localRef = useRef(null);
  const readyReportedRef = useRef(false);

  const setMediaRef = useCallback(
    (element) => {
      localRef.current = element;

      if (typeof elementRef === "function") {
        elementRef(element);
      }
    },
    [elementRef]
  );

  useEffect(() => {
    readyReportedRef.current = false;
  }, [cameraId, source.kind, source.url]);

  useEffect(() => {
    if (source.kind !== "offline") return;
    onError?.("Camera stream not configured");
  }, [onError, source.kind]);

  useEffect(() => {
    if (source.kind !== "webcam" || !webcamStream || !localRef.current) return;

    const video = localRef.current;
    video.srcObject = webcamStream;
    video.play().catch(() => {});
  }, [source.kind, webcamStream]);

  useEffect(() => {
    if (source.kind === "offline") return undefined;

    const intervalId = window.setInterval(() => {
      const { width, height } = getMediaDimensions(localRef.current);
      if (!width || !height || readyReportedRef.current) return;

      readyReportedRef.current = true;
      onReady?.();
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [onReady, source.kind]);

  if (source.kind === "mjpeg") {
    return (
      <img
        ref={setMediaRef}
        className={className}
        style={style}
        src={source.url}
        crossOrigin="anonymous"
        alt={`${cameraId} live Axis feed`}
        draggable="false"
        onLoad={() => {
          if (!readyReportedRef.current) {
            readyReportedRef.current = true;
            onReady?.();
          }
        }}
        onError={() => onError?.("Axis stream unavailable")}
      />
    );
  }

  if (source.kind === "webcam") {
    return <video ref={setMediaRef} className={className} style={style} autoPlay playsInline muted />;
  }

  return null;
}

function CameraWall({ selectable = false, onCameraClick = null }) {
  const [selected, setSelected] = useState(0);
  const [cameraStates, setCameraStates] = useState(() =>
    footage.reduce((acc, camera) => {
      acc[camera.label] = { ready: false, error: "" };
      return acc;
    }, {})
  );
  const videoRefs = useRef([]);
  const streamRef = useRef(null);
  const [webcamStream, setWebcamStream] = useState(null);

  const requiresWebcam = useMemo(
    () => footage.some((camera) => getCameraSource(camera.label).kind === "webcam"),
    []
  );

  const markReady = useCallback((cameraId) => {
    setCameraStates((prev) => ({
      ...prev,
      [cameraId]: { ready: true, error: "" },
    }));
  }, []);

  const markError = useCallback((cameraId, message) => {
    setCameraStates((prev) => ({
      ...prev,
      [cameraId]: { ready: false, error: message },
    }));
  }, []);

  useEffect(() => {
    if (!requiresWebcam) return undefined;

    let isMounted = true;

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
        if (!isMounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        setWebcamStream(stream);
        setCameraStates((prev) => {
          const next = { ...prev };
          footage.forEach((camera) => {
            if (getCameraSource(camera.label).kind === "webcam") {
              next[camera.label] = { ready: true, error: "" };
            }
          });
          return next;
        });
      })
      .catch((error) => {
        console.error("Camera access failed:", error);
        setCameraStates((prev) => {
          const next = { ...prev };
          footage.forEach((camera) => {
            if (getCameraSource(camera.label).kind === "webcam") {
              next[camera.label] = { ready: false, error: "Browser camera unavailable" };
            }
          });
          return next;
        });
      });

    return () => {
      isMounted = false;
      if (streamRef.current?.getTracks) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      setWebcamStream(null);
    };
  }, [requiresWebcam]);

  return (
    <div className="camera-grid">
      {footage.map((cam, idx) => {
        const isSelected = selected === idx;
        const source = getCameraSource(cam.label);
        const state = cameraStates[cam.label] || { ready: false, error: "" };

        return (
          <button
            key={cam.id}
            type="button"
            onClick={() => {
              if (selectable) setSelected(idx);
              if (onCameraClick) onCameraClick(cam.label);
            }}
            className={`camera-tile ${state.error ? "camera-offline" : ""} ${isSelected ? "camera-selected" : ""}`}
          >
            <CameraMedia
              cameraId={cam.label}
              className="camera-video"
              webcamStream={webcamStream}
              elementRef={(element) => {
                videoRefs.current[idx] = element;
              }}
              onReady={() => markReady(cam.label)}
              onError={(message) => markError(cam.label, message)}
            />

            {!state.ready && !state.error && (
              <div className="camera-loading">
                <Camera size={28} />
                <span>Connecting camera...</span>
              </div>
            )}

            {state.error && (
              <div className="camera-loading">
                <Camera size={28} />
                <span>{state.error}</span>
              </div>
            )}

            <div className="camera-overlay" />
            <div className="camera-gridlines" />
            <div className="camera-label">{cam.label}</div>
            <div className="camera-status">{state.error ? "Unavailable" : state.ready ? "Live feed" : source.label}</div>
            <div className="camera-source-badge">{source.label}</div>

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
  const [now, setNow] = useState(0);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const liveEvents = useMemo(() => {
    if (!now) return [];

    return cameraEvents
      .filter((event) => {
        const eventTime = new Date(event.ts).getTime();
        if (Number.isNaN(eventTime)) return false;
        return now - eventTime <= 24000;
      })
      .slice(0, 6)
      .reverse();
  }, [cameraEvents, now]);

  if (!liveEvents.length) return null;

  return (
    <div className="live-hash-stream">
      {liveEvents.map((event) => {
        const eventTime = new Date(event.ts).getTime();
        const ageMs = Number.isNaN(eventTime) ? 0 : now - eventTime;
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
            {String(event.status || "").toUpperCase().includes("ANCHOR") && (
              <div className="live-hash-anchor">HASH ANCHORED</div>
            )}
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
  onCancelDrawing,
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
        <div
          className="zone-draw-guide"
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
        >
          <div className="zone-draw-guide-copy">
            <PencilRuler size={15} />
            <div>
              <strong>Draw Restricted Zone</strong>
              <span>
                Drag across the live feed. Release to save.
              </span>
            </div>
          </div>

          <button
            type="button"
            className="zone-draw-cancel"
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={onCancelDrawing}
          >
            Cancel
          </button>
        </div>
      )}

      {drawingMode && isDrawing && (
        <div className="zone-draw-release-hint">
          Release to save zone
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
  const [webcamStream, setWebcamStream] = useState(null);

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
  const operatorFeedbackTimerRef = useRef(null);
  const ptzQueueRef = useRef(Promise.resolve());

  const activeArmsRef = useRef(featureArms || getDefaultFeatureArms());
  const onNewEventRef = useRef(onNewEvent);
  const zoneRef = useRef(zone);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [operatorFeedback, setOperatorFeedback] = useState("");
  const [drawingMode, setDrawingMode] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawRect, setDrawRect] = useState(null);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [isMobileFocusMode, setIsMobileFocusMode] = useState(false);
  const [showFullscreenControls, setShowFullscreenControls] = useState(false);
  const [ptzActiveCommand, setPtzActiveCommand] = useState("");
  const [ptzError, setPtzError] = useState("");
  const [ptzCapabilities, setPtzCapabilities] = useState({
    loading: true,
    available: false,
    panTilt: false,
    zoom: false,
    home: false,
  });
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
  const cameraSource = useMemo(() => getCameraSource(cameraId), [cameraId]);

  const cameraServiceBaseUrl = useMemo(() => {
    const configuredBase = String(
      import.meta.env.VITE_CAMERA_SERVICE_URL ||
      import.meta.env.VITE_CAMERA_BASE_URL ||
      ""
    ).trim();

    if (configuredBase) {
      return configuredBase.replace(/\/$/, "");
    }

    try {
      const parsed = new URL(cameraSource.url, window.location.origin);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return "http://localhost:5600";
    }
  }, [cameraSource.url]);

  const showOperatorFeedback = (message) => {
    setOperatorFeedback(message);

    if (operatorFeedbackTimerRef.current) {
      window.clearTimeout(
        operatorFeedbackTimerRef.current
      );
    }

    operatorFeedbackTimerRef.current =
      window.setTimeout(() => {
        setOperatorFeedback("");
        operatorFeedbackTimerRef.current = null;
      }, 2600);
  };


  const refreshPtzCapabilities = useCallback(async () => {
    if (cameraSource.kind !== "mjpeg") {
      setPtzCapabilities({
        loading: false,
        available: false,
        panTilt: false,
        zoom: false,
        home: false,
      });
      setPtzError("");
      return;
    }

    setPtzCapabilities((previous) => ({
      ...previous,
      loading: true,
    }));
    setPtzError("");

    try {
      const response = await fetch(
        `${cameraServiceBaseUrl}/camera/${encodeURIComponent(cameraId)}/capabilities`,
        {
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error(
          `PTZ capability check failed with status ${response.status}`
        );
      }

      const payload = await response.json();
      const ptz = payload?.ptz || {};

      const available = Boolean(
        ptz.available ??
        ptz.supported
      );

      setPtzCapabilities({
        loading: false,
        available,
        panTilt: Boolean(
          ptz.panTilt ??
          (ptz.pan && ptz.tilt)
        ),
        zoom: Boolean(ptz.zoom),
        home: Boolean(ptz.home),
      });
    } catch (error) {
      console.error("PTZ capability check failed:", error);

      setPtzCapabilities({
        loading: false,
        available: false,
        panTilt: false,
        zoom: false,
        home: false,
      });

      setPtzError(
        error.message ||
        "Unable to check PTZ capability"
      );
    }
  }, [
    cameraId,
    cameraServiceBaseUrl,
    cameraSource.kind,
  ]);

  const queuePtzRequest = useCallback(
    (endpoint, payload = {}) => {
      const runRequest = async () => {
        const response = await fetch(
          `${cameraServiceBaseUrl}/camera/${encodeURIComponent(cameraId)}/ptz/${endpoint}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }
        );

        if (!response.ok) {
          const errorPayload = await response
            .json()
            .catch(() => ({}));

          throw new Error(
            errorPayload.error ||
            `PTZ request failed with status ${response.status}`
          );
        }

        return response.json().catch(() => ({}));
      };

      const nextRequest = ptzQueueRef.current
        .catch(() => {})
        .then(runRequest);

      ptzQueueRef.current = nextRequest;

      nextRequest.catch((error) => {
        console.error("PTZ command failed:", error);
        setPtzError(
          error.message ||
          "PTZ command failed"
        );
        setPtzActiveCommand("");
        showOperatorFeedback(
          error.message ||
          "PTZ command failed"
        );
      });

      return nextRequest;
    },
    [
      cameraId,
      cameraServiceBaseUrl,
    ]
  );

  const handlePtzMoveStart = (direction) => {
    if (
      !ptzCapabilities.available ||
      !ptzCapabilities.panTilt
    ) {
      return;
    }

    setPtzError("");
    setPtzActiveCommand(direction);

    void queuePtzRequest(
      "move",
      {
        direction,
        speed: 55,
      }
    );
  };

  const handlePtzZoomStart = (direction) => {
    if (
      !ptzCapabilities.available ||
      !ptzCapabilities.zoom
    ) {
      return;
    }

    setPtzError("");
    setPtzActiveCommand(
      direction === "in"
        ? "zoom-in"
        : "zoom-out"
    );

    void queuePtzRequest(
      "zoom",
      {
        direction,
        speed: 55,
      }
    );
  };

  const handlePtzStop = () => {
    if (!ptzCapabilities.available) {
      return;
    }

    setPtzActiveCommand("");

    void queuePtzRequest(
      "stop",
      {}
    );
  };

  const handlePtzHome = () => {
    if (
      !ptzCapabilities.available ||
      !ptzCapabilities.home
    ) {
      return;
    }

    setPtzError("");
    setPtzActiveCommand("home");

    void queuePtzRequest(
      "home",
      {}
    ).finally(() => {
      setPtzActiveCommand("");
    });
  };

  useEffect(() => {
    activeArmsRef.current = activeArms;
  }, [activeArms]);

  useEffect(() => {
    void refreshPtzCapabilities();
  }, [refreshPtzCapabilities]);

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
    if (!isMobileFocusMode) {
      return undefined;
    }

    const root = document.documentElement;
    const body = document.body;
    const appShell =
      singleCameraFrameRef.current?.closest(
        ".app-shell"
      );

    const previousRootOverflow =
      root.style.overflow;
    const previousBodyOverflow =
      body.style.overflow;
    const previousRootOverscroll =
      root.style.overscrollBehavior;
    const previousBodyOverscroll =
      body.style.overscrollBehavior;

    root.classList.add(
      "bvs-mobile-focus-active"
    );
    body.classList.add(
      "bvs-mobile-focus-active"
    );
    appShell?.classList.add(
      "bvs-mobile-focus-active"
    );

    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";

    return () => {
      root.classList.remove(
        "bvs-mobile-focus-active"
      );
      body.classList.remove(
        "bvs-mobile-focus-active"
      );
      appShell?.classList.remove(
        "bvs-mobile-focus-active"
      );

      root.style.overflow =
        previousRootOverflow;
      body.style.overflow =
        previousBodyOverflow;
      root.style.overscrollBehavior =
        previousRootOverscroll;
      body.style.overscrollBehavior =
        previousBodyOverscroll;
    };
  }, [isMobileFocusMode]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isActive =
        document.fullscreenElement ===
        singleCameraFrameRef.current;

      setIsBrowserFullscreen(isActive);
      setShowFullscreenControls(false);

      if (!isActive) {
        setPtzActiveCommand("");
        if (ptzCapabilities.available) {
          void queuePtzRequest("stop", {});
        }
      }
    };

    document.addEventListener(
      "fullscreenchange",
      handleFullscreenChange
    );

    return () => {
      document.removeEventListener(
        "fullscreenchange",
        handleFullscreenChange
      );
    };
  }, [
    ptzCapabilities.available,
    queuePtzRequest,
  ]);

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


    function startDetectorLoop() {
      intervalRef.current = window.setInterval(() => {
        const media = videoRef.current;
        const canvas = canvasRef.current;
        const motionDetector = motionDetectorRef.current;
        const tamperDetector = tamperDetectorRef.current;
        const movedDetector = movedDetectorRef.current;
        const zoneEntryDetector = zoneEntryDetectorRef.current;
        const arms = activeArmsRef.current;
        const currentZone = zoneRef.current;

        if (!media || !canvas || !motionDetector || !tamperDetector || !movedDetector || !zoneEntryDetector) return;

        const dimensions = getAnalysisDimensions(media, 640);
        if (!dimensions.width || !dimensions.height) return;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        canvas.width = dimensions.width;
        canvas.height = dimensions.height;

        try {
          ctx.drawImage(media, 0, 0, canvas.width, canvas.height);
        } catch {
          return;
        }

        let imageData;
        try {
          imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        } catch (error) {
          console.error("Camera frame cannot be analyzed:", error);
          setCameraReady(false);
          setCameraError("Camera stream blocked by browser security settings");
          if (intervalRef.current) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return;
        }

        setCameraReady(true);
        setCameraError("");

        const motionActiveNow = isFeatureActiveNow(arms, "motion");
        const highMotionActiveNow = isFeatureActiveNow(arms, "highMotion");
        const tamperActiveNow = isFeatureActiveNow(arms, "tamper");
        const movedActiveNow = isFeatureActiveNow(arms, "moved");
        const restrictedZoneActiveNow = isFeatureActiveNow(arms, "restrictedZone");
        const zoneHashingActiveNow = isFeatureActiveNow(arms, "zoneHashing");

        const motionResult = motionActiveNow
          ? motionDetector.processFrame(imageData, canvas.width, canvas.height)
          : { motionScore: 0, ema: 0, triggered: false, event: null };

        const tamperResult = tamperActiveNow
          ? tamperDetector.processFrame(imageData, canvas.width, canvas.height)
          : {
              triggered: false,
              event: null,
              suspicious: false,
              brightness: 0,
              flatness: 0,
              darkRatio: 0,
              reason: "INACTIVE",
              motionEstimate: 0,
              latched: false,
              baselineReady:
                tamperDetector.getState?.()
                  .baselineReady || false,
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
          tamperTriggered: Boolean(
            tamperResult.suspicious ||
            tamperResult.latched ||
            tamperResult.event
          ),
          brightness: tamperResult.brightness,
          flatness: tamperResult.flatness,
          darkRatio: tamperResult.darkRatio,
          tamperReason: tamperResult.reason,
          tamperMotionEstimate: tamperResult.motionEstimate,
          baselineReady: Boolean(
            movedResult.baselineReady &&
            (
              !tamperActiveNow ||
              tamperResult.baselineReady
            )
          ),
          movedDistance: movedResult.distance,
          movedTriggered: movedResult.triggered,
          zoneMotionScore: zoneResult.zoneMotionScore,
          zoneReady: zoneResult.zoneReady,
          zoneOccupied: zoneResult.zoneOccupied,
          zoneTriggered: zoneResult.triggered,
        });

        const tamperSuppressed =
          Date.now() -
            zoneSetAtRef.current <
          2500;

        const tamperConditionActive =
          tamperActiveNow &&
          !tamperSuppressed &&
          Boolean(
            tamperResult.suspicious ||
            tamperResult.latched ||
            tamperResult.event
          );

        /*
         * TAMPER MUST TAKE PRIORITY OVER MOTION.
         *
         * Covering or obstructing a camera naturally causes a
         * large visual change. Without this priority rule, that
         * same incident can be submitted as MOTION before the
         * tamper detector finishes confirming the obstruction.
         */
        if (
          tamperActiveNow &&
          !tamperSuppressed &&
          tamperResult.event
        ) {
          const now = Date.now();

          if (
            now -
              lastTamperAtRef.current >
            3500
          ) {
            lastTamperAtRef.current = now;

            const enrichedTamperEvent =
              addFrameEvidence(
                {
                  ...tamperResult.event,
                  status:
                    "Tamper Detected / Hash Pending",
                },
                canvas,
                cameraSource.kind
              );

            onNewEventRef.current?.(
              enrichedTamperEvent
            );
          }
        }

        if (
          motionActiveNow &&
          motionResult.event &&
          !tamperConditionActive
        ) {
          const highMotionBlocked =
            !highMotionActiveNow &&
            String(
              motionResult.event.severity || ""
            ).toUpperCase() === "HIGH";

          const enrichedMotionEvent =
            addFrameEvidence(
              {
                ...motionResult.event,

                severity: highMotionBlocked
                  ? "WARNING"
                  : motionResult.event.severity,

                status: highMotionBlocked
                  ? "Detected / High Motion Disarmed"
                  : "Detected",

                meta: {
                  ...motionResult.event.meta,
                  highMotionArmed:
                    highMotionActiveNow,
                  highMotionSuppressed:
                    highMotionBlocked,
                },
              },
              canvas,
              cameraSource.kind
            );

          onNewEventRef.current?.(
            enrichedMotionEvent
          );
        }

        if (movedActiveNow && movedResult.event) {
          const enrichedMovedEvent = addFrameEvidence(
            { ...movedResult.event, status: "Detected" },
            canvas,
            cameraSource.kind
          );
          onNewEventRef.current?.(enrichedMovedEvent);
        }

        if (restrictedZoneActiveNow && zoneHashingActiveNow && zoneResult.event) {
          const enrichedZoneEvent = addFrameEvidence(
            {
              ...zoneResult.event,
              status: "Detected / Hash Pending",
              meta: {
                ...zoneResult.event.meta,
                restrictedZoneArmed: restrictedZoneActiveNow,
                zoneHashingArmed: zoneHashingActiveNow,
              },
            },
            canvas,
            cameraSource.kind
          );
          onNewEventRef.current?.(enrichedZoneEvent);
        }
      }, 250);
    }

    async function startCamera() {
      try {
        if (cameraSource.kind === "offline") {
          setCameraReady(false);
          setCameraError("Camera stream not configured");
          return;
        }

        setCameraError("");

        if (cameraSource.kind === "webcam") {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });

          if (!isMounted) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }

          streamRef.current = stream;
          setWebcamStream(stream);
          setCameraReady(true);
        }

        startDetectorLoop();
      } catch (error) {
        console.error("Camera access failed:", error);
        if (isMounted) {
          setCameraReady(false);
          setCameraError(
            cameraSource.kind === "mjpeg"
              ? "Axis stream unavailable"
              : "Camera access blocked or unavailable"
          );
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
        clearInterval(
          heartbeatIntervalRef.current
        );

        heartbeatIntervalRef.current = null;
      }

      if (operatorFeedbackTimerRef.current) {
        window.clearTimeout(
          operatorFeedbackTimerRef.current
        );

        operatorFeedbackTimerRef.current =
          null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      setWebcamStream(null);
    };
  }, [cameraId, cameraSource.kind, cameraSource.url]);

  const handleSetBaseline = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    const movedDetector =
      movedDetectorRef.current;

    const tamperDetector =
      tamperDetectorRef.current;

    if (
      !video ||
      !canvas ||
      !movedDetector ||
      !tamperDetector
    ) {
      showOperatorFeedback(
        "Camera baseline could not be set"
      );

      return;
    }

    const dimensions =
      getAnalysisDimensions(video, 640);

    if (
      !dimensions.width ||
      !dimensions.height
    ) {
      showOperatorFeedback(
        "Camera frame is not ready"
      );

      return;
    }

    const ctx = canvas.getContext(
      "2d",
      { willReadFrequently: true }
    );

    if (!ctx) {
      showOperatorFeedback(
        "Camera analysis is unavailable"
      );

      return;
    }

    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    try {
      ctx.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const imageData = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      );

      movedDetector.setBaselineFromFrame(
        imageData,
        canvas.width,
        canvas.height
      );

      tamperDetector.setBaselineFromFrame(
        imageData,
        canvas.width,
        canvas.height
      );

      setDebugStats((previous) => ({
        ...previous,
        baselineReady: true,
        movedDistance: 0,
        movedTriggered: false,
        tamperTriggered: false,
        tamperReason: "BASELINE_SET",
      }));

      showOperatorFeedback(
        `Baseline set for ${cameraId}`
      );
    } catch (error) {
      console.error(
        "Baseline capture failed:",
        error
      );

      showOperatorFeedback(
        "Baseline capture failed"
      );
    }
  };

  const handleClearBaseline = () => {
    const movedDetector =
      movedDetectorRef.current;

    const tamperDetector =
      tamperDetectorRef.current;

    if (
      !movedDetector ||
      !tamperDetector
    ) {
      showOperatorFeedback(
        "Baseline could not be cleared"
      );

      return;
    }

    movedDetector.clearBaseline();
    tamperDetector.clearBaseline();

    setDebugStats((previous) => ({
      ...previous,
      baselineReady: false,
      movedDistance: 0,
      movedTriggered: false,
      tamperTriggered: false,
      tamperReason: "BASELINE_CLEARED",
    }));

    showOperatorFeedback(
      `Baseline cleared for ${cameraId}`
    );
  };

  const handleEnableZoneDraw = () => {
    if (!isFeatureActiveNow(activeArms, "restrictedZone")) return;

    setDrawingMode(true);
    setIsDrawing(false);
    setDrawRect(null);
    pendingDrawRef.current = null;

    /*
     * Keep zone editing on the true 16:9 camera frame.
     * That preserves normalized detector coordinates on mobile
     * instead of drawing against a letterboxed Focus View.
     */
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(max-width: 820px)").matches &&
      isMobileFocusMode
    ) {
      handlePtzStop();
      setShowFullscreenControls(false);
      setIsMobileFocusMode(false);
    }

    showOperatorFeedback(
      `Drag on ${cameraId} to mark the restricted zone`
    );
  };

  const handleCancelZoneDraw = () => {
    setDrawingMode(false);
    setIsDrawing(false);
    setDrawRect(null);
    pendingDrawRef.current = null;
    frameRectRef.current = null;

    showOperatorFeedback(
      "Zone drawing cancelled"
    );
  };

  const handleClearZone = () => {
    setDrawingMode(false);
    setIsDrawing(false);
    setDrawRect(null);
    pendingDrawRef.current = null;
    zoneSetAtRef.current = 0;

    if (onZoneChange) {
      onZoneChange(cameraId, null);
    }

    showOperatorFeedback(
      `Restricted zone cleared for ${cameraId}`
    );
  };

  const handleToggleBrowserFullscreen = async () => {
    const target = singleCameraFrameRef.current;
    if (!target) return;

    const useInAppFocusMode =
      typeof window !== "undefined" &&
      (
        window.matchMedia?.(
          "(pointer: coarse)"
        ).matches ||
        window.matchMedia?.(
          "(hover: none)"
        ).matches ||
        navigator.maxTouchPoints > 0 ||
        window.innerWidth <= 820
      );

    if (isMobileFocusMode) {
      handlePtzStop();
      setShowFullscreenControls(false);

      document.documentElement.classList.remove(
        "bvs-mobile-focus-active"
      );
      document.body.classList.remove(
        "bvs-mobile-focus-active"
      );
      target
        .closest(".app-shell")
        ?.classList.remove(
          "bvs-mobile-focus-active"
        );

      setIsMobileFocusMode(false);
      return;
    }

    if (useInAppFocusMode) {
      document.documentElement.classList.add(
        "bvs-mobile-focus-active"
      );
      document.body.classList.add(
        "bvs-mobile-focus-active"
      );
      target
        .closest(".app-shell")
        ?.classList.add(
          "bvs-mobile-focus-active"
        );

      setShowFullscreenControls(true);
      setIsMobileFocusMode(true);
      return;
    }

    try {
      if (document.fullscreenElement === target) {
        handlePtzStop();
        await document.exitFullscreen();
        return;
      }

      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }

      await target.requestFullscreen();
    } catch (error) {
      console.error(
        "Fullscreen toggle failed:",
        error
      );

      showOperatorFeedback(
        "Full screen could not be toggled"
      );
    }
  };

  const isExpandedCamera =
    isBrowserFullscreen ||
    isMobileFocusMode;

  const handleZonePointerDown = (event) => {
    if (!drawingMode) return;

    event.preventDefault();

    const surface = event.currentTarget;
    const pointerId = event.pointerId;
    const bounds = surface.getBoundingClientRect();

    if (!bounds.width || !bounds.height) {
      return;
    }

    surface.setPointerCapture?.(pointerId);
    frameRectRef.current = bounds;

    const startX =
      (event.clientX - bounds.left) /
      bounds.width;
    const startY =
      (event.clientY - bounds.top) /
      bounds.height;

    const clampedStartX = Math.max(
      0,
      Math.min(1, startX)
    );
    const clampedStartY = Math.max(
      0,
      Math.min(1, startY)
    );

    setIsDrawing(true);

    const initialRect = {
      x: clampedStartX,
      y: clampedStartY,
      width: 0,
      height: 0,
    };

    pendingDrawRef.current =
      initialRect;
    setDrawRect(initialRect);

    const cleanup = () => {
      window.removeEventListener(
        "pointermove",
        handlePointerMove
      );
      window.removeEventListener(
        "pointerup",
        handlePointerUp
      );
      window.removeEventListener(
        "pointercancel",
        handlePointerCancel
      );

      try {
        surface.releasePointerCapture?.(
          pointerId
        );
      } catch {
        // Capture may already have been released by the browser.
      }
    };

    const handlePointerMove = (
      moveEvent
    ) => {
      if (
        moveEvent.pointerId !==
        pointerId
      ) {
        return;
      }

      moveEvent.preventDefault();

      const liveBounds =
        frameRectRef.current;

      if (!liveBounds) return;

      const currentX =
        (moveEvent.clientX -
          liveBounds.left) /
        liveBounds.width;
      const currentY =
        (moveEvent.clientY -
          liveBounds.top) /
        liveBounds.height;

      const clampedCurrentX =
        Math.max(
          0,
          Math.min(1, currentX)
        );
      const clampedCurrentY =
        Math.max(
          0,
          Math.min(1, currentY)
        );

      const nextRect = {
        x: Math.min(
          clampedStartX,
          clampedCurrentX
        ),
        y: Math.min(
          clampedStartY,
          clampedCurrentY
        ),
        width: Math.abs(
          clampedCurrentX -
            clampedStartX
        ),
        height: Math.abs(
          clampedCurrentY -
            clampedStartY
        ),
      };

      pendingDrawRef.current =
        nextRect;
      setDrawRect(nextRect);
    };

    const commitZone = () => {
      const finalRect =
        pendingDrawRef.current;

      setIsDrawing(false);
      setDrawingMode(false);
      setDrawRect(null);
      pendingDrawRef.current = null;
      frameRectRef.current = null;

      if (!finalRect) return;

      const minimumDimension =
        0.025;

      if (
        finalRect.width <
          minimumDimension ||
        finalRect.height <
          minimumDimension
      ) {
        showOperatorFeedback(
          "Zone too small — drag a larger area"
        );
        return;
      }

      zoneSetAtRef.current =
        Date.now();

      const zonePayload = {
        id: "zone-1",
        label: "Restricted Zone",
        x: finalRect.x,
        y: finalRect.y,
        width: finalRect.width,
        height: finalRect.height,
      };

      if (onZoneChange) {
        onZoneChange(
          cameraId,
          zonePayload
        );
      }

      showOperatorFeedback(
        `Restricted zone saved for ${cameraId}`
      );
    };

    const handlePointerUp = (
      upEvent
    ) => {
      if (
        upEvent.pointerId !==
        pointerId
      ) {
        return;
      }

      upEvent.preventDefault();
      cleanup();
      commitZone();
    };

    const handlePointerCancel = (
      cancelEvent
    ) => {
      if (
        cancelEvent.pointerId !==
        pointerId
      ) {
        return;
      }

      cleanup();
      setIsDrawing(false);
      setDrawRect(null);
      pendingDrawRef.current = null;
      frameRectRef.current = null;
    };

    window.addEventListener(
      "pointermove",
      handlePointerMove,
      { passive: false }
    );
    window.addEventListener(
      "pointerup",
      handlePointerUp,
      { passive: false }
    );
    window.addEventListener(
      "pointercancel",
      handlePointerCancel
    );
  };

  return (
    <div className="single-camera-shell">
      <div
        ref={singleCameraFrameRef}
        className={`single-camera-frame ${
          isMobileFocusMode
            ? "is-mobile-focus-mode"
            : ""
        } ${
          isMobileFocusMode &&
          showFullscreenControls
            ? "has-mobile-controls-open"
            : ""
        } ${
          isMobileFocusMode &&
          drawingMode
            ? "is-mobile-zone-drawing"
            : ""
        }`}
        style={
          isBrowserFullscreen
            ? {
                width: "100vw",
                height: "100vh",
                maxWidth: "none",
                maxHeight: "none",
                aspectRatio: "auto",
                borderRadius: 0,
                border: 0,
                margin: 0,
                background: "#000",
                overflow: "hidden",
              }
            : undefined
        }
      >
        <CameraMedia
          cameraId={cameraId}
          className="single-camera-video"
          elementRef={(element) => {
            videoRef.current = element;
          }}
          webcamStream={webcamStream}
          onReady={() => {
            setCameraReady(true);
            setCameraError("");
          }}
          onError={(message) => {
            setCameraReady(false);
            setCameraError(message);
          }}
        />
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
          <button
            type="button"
            className="live-mode-btn"
            onClick={handleToggleBrowserFullscreen}
          >
            {isExpandedCamera ? (
              <Minimize2 size={15} />
            ) : (
              <Maximize2 size={15} />
            )}

            <span>
              {isExpandedCamera
                ? "Exit Focus"
                : "Focus View"}
            </span>
          </button>
        </div>

        <LiveStatusPills
          movedActive={debugStats.movedTriggered}
          tamperActive={debugStats.tamperTriggered}
          zoneActive={debugStats.zoneTriggered}
        />

        {isExpandedCamera && !showFullscreenControls && (
          <button
            type="button"
            className="fullscreen-controls-reveal"
            onClick={() => setShowFullscreenControls(true)}
            aria-label="Show camera controls"
            aria-expanded="false"
          >
            <Crosshair size={14} />
            <span>Controls</span>
          </button>
        )}

        {isExpandedCamera && showFullscreenControls && (
          <div
            className="fullscreen-control-dock-compact fullscreen-control-dock-micro"
            role="group"
            aria-label={`${cameraId} camera controls`}
          >
            <div className="fullscreen-control-header">
              <span
                className={`fullscreen-ptz-indicator ${
                  ptzCapabilities.available ? "is-ready" : ""
                }`}
              >
                <span aria-hidden="true" />
                PTZ
              </span>

              <button
                type="button"
                className="fullscreen-controls-hide"
                onClick={() => {
                  handlePtzStop();
                  setShowFullscreenControls(false);
                }}
                aria-label="Hide camera controls"
              >
                <ChevronDown size={14} />
                <span>Hide</span>
              </button>
            </div>

            <div className="fullscreen-control-body">
              <div
                className="fullscreen-ptz-pad-compact"
                aria-label="Pan and tilt"
              >
                <span />
                <button
                  type="button"
                  className={`fullscreen-ptz-key ${
                    ptzActiveCommand === "up" ? "is-active" : ""
                  }`}
                  aria-label="Tilt camera up"
                  disabled={!ptzCapabilities.panTilt}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    handlePtzMoveStart("up");
                  }}
                  onPointerUp={handlePtzStop}
                  onPointerCancel={handlePtzStop}
                  onPointerLeave={handlePtzStop}
                >
                  ↑
                </button>
                <span />

                <button
                  type="button"
                  className={`fullscreen-ptz-key ${
                    ptzActiveCommand === "left" ? "is-active" : ""
                  }`}
                  aria-label="Pan camera left"
                  disabled={!ptzCapabilities.panTilt}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    handlePtzMoveStart("left");
                  }}
                  onPointerUp={handlePtzStop}
                  onPointerCancel={handlePtzStop}
                  onPointerLeave={handlePtzStop}
                >
                  ←
                </button>

                <button
                  type="button"
                  className="fullscreen-ptz-key fullscreen-ptz-stop-key"
                  aria-label="Stop camera movement"
                  disabled={!ptzCapabilities.available}
                  onClick={handlePtzStop}
                >
                  STOP
                </button>

                <button
                  type="button"
                  className={`fullscreen-ptz-key ${
                    ptzActiveCommand === "right" ? "is-active" : ""
                  }`}
                  aria-label="Pan camera right"
                  disabled={!ptzCapabilities.panTilt}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    handlePtzMoveStart("right");
                  }}
                  onPointerUp={handlePtzStop}
                  onPointerCancel={handlePtzStop}
                  onPointerLeave={handlePtzStop}
                >
                  →
                </button>

                <span />
                <button
                  type="button"
                  className={`fullscreen-ptz-key ${
                    ptzActiveCommand === "down" ? "is-active" : ""
                  }`}
                  aria-label="Tilt camera down"
                  disabled={!ptzCapabilities.panTilt}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    handlePtzMoveStart("down");
                  }}
                  onPointerUp={handlePtzStop}
                  onPointerCancel={handlePtzStop}
                  onPointerLeave={handlePtzStop}
                >
                  ↓
                </button>
                <span />
              </div>

              <div className="fullscreen-control-strip" aria-label="Lens controls">
                <button
                  type="button"
                  className="fullscreen-control-chip"
                  disabled={!ptzCapabilities.zoom}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    handlePtzZoomStart("in");
                  }}
                  onPointerUp={handlePtzStop}
                  onPointerCancel={handlePtzStop}
                  onPointerLeave={handlePtzStop}
                  aria-label="Zoom in"
                >
                  +
                </button>

                <button
                  type="button"
                  className="fullscreen-control-chip"
                  disabled={!ptzCapabilities.zoom}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    handlePtzZoomStart("out");
                  }}
                  onPointerUp={handlePtzStop}
                  onPointerCancel={handlePtzStop}
                  onPointerLeave={handlePtzStop}
                  aria-label="Zoom out"
                >
                  −
                </button>

                <button
                  type="button"
                  className="fullscreen-control-chip fullscreen-control-home"
                  disabled={!ptzCapabilities.home}
                  onClick={handlePtzHome}
                  aria-label="Return camera home"
                >
                  <RotateCcw size={13} />
                  <span>Home</span>
                </button>
              </div>

              <div className="fullscreen-control-strip" aria-label="Zone controls">
                <button
                  type="button"
                  className={`fullscreen-control-chip fullscreen-control-zone ${
                    drawingMode ? "is-active" : ""
                  }`}
                  onClick={() => {
                    handlePtzStop();

                    if (isMobileFocusMode) {
                      setShowFullscreenControls(false);
                    }

                    handleEnableZoneDraw();
                  }}
                  disabled={!isFeatureActiveNow(activeArms, "restrictedZone")}
                  aria-label={drawingMode ? "Draw on feed" : "Draw restricted zone"}
                >
                  <PencilRuler size={14} />
                  <span>{drawingMode ? "Draw" : "Zone"}</span>
                </button>

                <button
                  type="button"
                  className="fullscreen-control-chip fullscreen-control-zone"
                  onClick={handleClearZone}
                  disabled={!zone}
                  aria-label="Clear restricted zone"
                >
                  <Trash2 size={14} />
                  <span>Clear</span>
                </button>
              </div>
            </div>
          </div>
        )}

        <ZoneOverlay
          zone={zone}
          isDrawing={isDrawing}
          drawRect={drawRect}
          drawingMode={drawingMode}
          zoneArmed={isFeatureActiveNow(activeArms, "restrictedZone")}
          onPointerDown={handleZonePointerDown}
          onCancelDrawing={handleCancelZoneDraw}
        />
      </div>


      {operatorFeedback && (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "9px",
            width: "fit-content",
            margin: "0 0 12px",
            padding: "10px 14px",
            borderRadius: "10px",
            border:
              "1px solid rgba(144, 112, 205, 0.30)",
            background:
              "rgba(35, 28, 48, 0.92)",
            color: "#e5dcf5",
            boxShadow:
              "0 10px 30px rgba(0, 0, 0, 0.24)",
            fontSize: "12px",
            fontWeight: 800,
            letterSpacing: "0.02em",
          }}
        >
          <CheckSquare size={16} />
          <span>{operatorFeedback}</span>
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
          <span>{drawingMode ? "Draw on Camera" : "Draw Restricted Zone"}</span>
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
  cameraHealth,
  onFeatureArmChange,
  onFeatureScheduleToggle,
  onFeatureTimeChange,
}) {
  const details = cameraDetails[cameraId] || cameraDetails["CAM-01"];
  const cameraEvents = events[cameraId] || [];
  const operationalState = getCameraOperationalState(
    cameraId,
    cameraHealth
  );

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

      <MetricCard
        title="Camera State"
        value={operationalState.label}
        subtitle="Live camera-service ingest state"
      />
      <MetricCard
        title="Relay Health"
        value={operationalState.relayHealth}
        subtitle="Real ingest and frame availability"
      />
      <MetricCard
        title="Last Event"
        value={
          cameraEvents[0]
            ? formatEventTime(cameraEvents[0].ts)
            : "None"
        }
        subtitle={
          cameraEvents[0]
            ? cameraEvents[0].eventType
            : "No runtime detector events"
        }
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
              <Activity size={16} />
              <span>Ingest</span>
            </div>
            <span>{operationalState.ingestLabel}</span>
          </div>
          <div className="status-row">
            <div className="status-label-wrap">
              <Clock3 size={16} />
              <span>Frame Age</span>
            </div>
            <span>{operationalState.frameAgeLabel}</span>
          </div>
          <div className="status-row">
            <div className="status-label-wrap">
              <Server size={16} />
              <span>Relay Clients</span>
            </div>
            <span>{operationalState.connectedClientsLabel}</span>
          </div>
          <div className="status-row">
            <div className="status-label-wrap">
              <ShieldCheck size={16} />
              <span>Last Event</span>
            </div>
            <span>
              {cameraEvents[0]
                ? formatEventTime(cameraEvents[0].ts)
                : "No runtime events"}
            </span>
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
  cameraHealth,
  onBack,
  onNewEvent,
  onZoneChange,
  onFeatureArmChange,
  onFeatureScheduleToggle,
  onFeatureTimeChange,
}) {
  const currentZone = zonesByCamera[cameraId] || null;
  const currentFeatureArms = featureArmsByCamera[cameraId] || getDefaultFeatureArms();
  const operationalState = getCameraOperationalState(
    cameraId,
    cameraHealth
  );

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
          <Badge tone={operationalState.tone}>
            {operationalState.label}
          </Badge>
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
          cameraHealth={cameraHealth}
          onFeatureArmChange={onFeatureArmChange}
          onFeatureScheduleToggle={onFeatureScheduleToggle}
          onFeatureTimeChange={onFeatureTimeChange}
        />
      </div>
    </div>
  );
}

function SystemTopology({
  blockchainStatus,
  cameraHealthById,
  featureArmsByCamera,
  systemFlow,
}) {
  const configuredCameraIds = useMemo(
    () =>
      footage
        .filter(
          (camera) =>
            getCameraSource(camera.label).kind !== "offline"
        )
        .map((camera) => camera.label),
    []
  );

  const liveCameraCount = configuredCameraIds.filter((cameraId) => {
    const health = cameraHealthById?.[cameraId];
    return Boolean(
      health?.configured &&
        health?.ingestRunning &&
        health?.hasFrame
    );
  }).length;

  const activeDetectorCount = useMemo(() => {
    const detectorKeys = featureArmLabels
      .map((feature) => feature.key)
      .filter((featureKey) => featureKey !== "zoneHashing");

    return configuredCameraIds.reduce((total, cameraId) => {
      const arms = featureArmsByCamera?.[cameraId];
      return (
        total +
        detectorKeys.filter((featureKey) =>
          getFeatureRuntimeState(arms, featureKey).activeNow
        ).length
      );
    }, 0);
  }, [configuredCameraIds, featureArmsByCamera]);

  const cameraHealthy =
    configuredCameraIds.length > 0 &&
    liveCameraCount === configuredCameraIds.length;
  const cameraPartial =
    liveCameraCount > 0 && !cameraHealthy;
  const detectionReady = activeDetectorCount > 0;
  const evidenceActive = Boolean(systemFlow?.eventId);
  const evidenceCaptured = Boolean(systemFlow?.hasEvidence);
  const hashReady = Boolean(systemFlow?.hashReady);
  const fabricConnected = Boolean(blockchainStatus?.connected);

  const stages = [
    {
      key: "camera",
      label: "CAMERA",
      icon: Camera,
      state: cameraHealthy
        ? "healthy"
        : cameraPartial
          ? "degraded"
          : "offline",
      status: cameraHealthy
        ? "LIVE"
        : cameraPartial
          ? "PARTIAL"
          : "CHECKING",
      detail: `${liveCameraCount}/${configuredCameraIds.length} feeds`,
      complete: liveCameraCount > 0,
    },
    {
      key: "detection",
      label: "DETECTION",
      icon: Activity,
      state: detectionReady ? "healthy" : "standby",
      status: detectionReady ? "ARMED" : "STANDBY",
      detail: `${activeDetectorCount} active detectors`,
      complete: detectionReady,
    },
    {
      key: "evidence",
      label: "EVIDENCE",
      icon: FolderArchive,
      state: evidenceActive ? "active" : "standby",
      status: evidenceActive
        ? evidenceCaptured
          ? "CAPTURED"
          : "RECEIVED"
        : "STANDBY",
      detail: evidenceActive
        ? `${systemFlow.cameraId} · ${systemFlow.eventType}`
        : "Awaiting detector event",
      complete: evidenceActive,
    },
    {
      key: "sha256",
      label: "SHA-256",
      icon: ShieldCheck,
      state: hashReady
        ? "verified"
        : blockchainStatus?.apiReachable
          ? "standby"
          : "offline",
      status: hashReady
        ? "SEALED"
        : blockchainStatus?.apiReachable
          ? "READY"
          : "UNAVAILABLE",
      detail: hashReady
        ? "Cryptographic digest committed"
        : "Awaiting evidence digest",
      complete: hashReady,
    },
    {
      key: "fabric",
      label: "FABRIC",
      icon: GitBranch,
      state: fabricConnected
        ? systemFlow?.anchored
          ? "verified"
          : "healthy"
        : blockchainStatus?.loading
          ? "standby"
          : "offline",
      status: fabricConnected
        ? systemFlow?.anchored
          ? "VERIFIED"
          : "CONNECTED"
        : blockchainStatus?.loading
          ? "CONNECTING"
          : "OFFLINE",
      detail: fabricConnected
        ? `Channel ${blockchainStatus.channel || "bvschannel"}`
        : blockchainStatus?.error || "Ledger unavailable",
      complete: fabricConnected && Boolean(systemFlow?.anchored),
    },
  ];

  const activeStage = systemFlow?.anchored
    ? "fabric"
    : systemFlow?.hashReady
      ? "sha256"
      : systemFlow?.eventId
        ? systemFlow?.hasEvidence
          ? "evidence"
          : "detection"
        : "";

  return (
    <section
      className="system-topology"
      data-flow-state={systemFlow?.anchored ? "anchored" : systemFlow?.eventId ? "active" : "idle"}
      data-active-stage={activeStage || "none"}
      aria-label="BlockVault evidence lifecycle"
    >
      <div className="system-topology-header">
        <div>
          <div className="system-topology-kicker">SYSTEM TOPOLOGY</div>
          <h2>Evidence Integrity Pipeline</h2>
          <p>
            Live operational state from camera ingest through ledger verification.
          </p>
        </div>

        <div className="system-topology-event" aria-live="polite">
          <span className="system-topology-event-label">
            {systemFlow?.eventId ? "LATEST LIFECYCLE" : "SYSTEM STATE"}
          </span>
          <strong>
            {systemFlow?.eventId
              ? `${systemFlow.cameraId} · ${systemFlow.eventType}`
              : "Awaiting detector event"}
          </strong>
          <span>
            {systemFlow?.anchored
              ? "Evidence anchored and verified"
              : systemFlow?.eventId
                ? "Evidence lifecycle in progress"
                : "All stages report live readiness"}
          </span>
        </div>
      </div>

      <div className="system-topology-rail" role="list">
        {stages.map((stage, index) => {
          const Icon = stage.icon;
          const isActive = activeStage === stage.key;

          return (
            <div
              className={`topology-stage${isActive ? " is-active" : ""}${stage.complete ? " is-complete" : ""}`}
              data-stage={stage.key}
              data-state={stage.state}
              role="listitem"
              key={stage.key}
            >
              {index > 0 ? (
                <div className="topology-connector" aria-hidden="true">
                  <span />
                </div>
              ) : null}

              <div className="topology-stage-core">
                <div className="topology-icon-wrap" aria-hidden="true">
                  <Icon size={17} strokeWidth={1.8} />
                </div>

                <div className="topology-stage-copy">
                  <span className="topology-stage-label">{stage.label}</span>
                  <strong>{stage.status}</strong>
                  <span className="topology-stage-detail">{stage.detail}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HomePage({
  blockchainStatus,
  blockchainEvents,
  cameraEvents,
  cameraHealthById,
  featureArmsByCamera,
  feedFreshnessMs,
  systemFlow,
  onCameraClick,
}) {
  const configuredCameraCount = useMemo(
    () =>
      footage.filter(
        (camera) =>
          getCameraSource(camera.label).kind !== "offline"
      ).length,
    []
  );

  const ledgerRecords = useMemo(
    () =>
      Object.values(blockchainEvents || {}).reduce(
        (total, records) =>
          total + (Array.isArray(records) ? records.length : 0),
        0
      ),
    [blockchainEvents]
  );

  const recentEvents = useMemo(
    () =>
      Object.values(cameraEvents || {})
        .flat()
        .sort(
          (a, b) =>
            new Date(b.ts).getTime() -
            new Date(a.ts).getTime()
        )
        .slice(0, 6),
    [cameraEvents]
  );

  return (
    <div className="page-content">
      <div className="metrics-grid">
        <MetricCard
          title="Fabric Ledger"
          value={
            blockchainStatus.connected
              ? "Connected"
              : blockchainStatus.loading
                ? "Connecting"
                : "Offline"
          }
          subtitle={
            blockchainStatus.connected
              ? `Channel ${blockchainStatus.channel || "bvschannel"}`
              : blockchainStatus.error || "Awaiting ledger connection"
          }
        />

        <MetricCard
          title="Evidence Records"
          value={String(ledgerRecords)}
          subtitle="Records loaded from the Fabric-backed ledger"
        />

        <MetricCard
          title="Configured Feeds"
          value={String(configuredCameraCount)}
          subtitle="Camera sources currently configured"
        />

        <MetricCard
          title="Live Feed Freshness"
          value={
            Number.isFinite(feedFreshnessMs)
              ? `${Math.round(feedFreshnessMs)}ms`
              : "—"
          }
          subtitle="Rolling average frame age"
        />
      </div>

      <SystemTopology
        key={systemFlow?.sequence || "topology-idle"}
        blockchainStatus={blockchainStatus}
        cameraHealthById={cameraHealthById}
        featureArmsByCamera={featureArmsByCamera}
        systemFlow={systemFlow}
      />

      <div className="grid-two">
        <Card title="Live Camera Operations">
          <CameraWall onCameraClick={onCameraClick} />
        </Card>

        <Card title="Platform Status">
          <div className="status-stack">
            <div className="status-row">
              <div className="status-label-wrap">
                <Server size={16} />
                <span>BlockVault API</span>
              </div>

              <Badge
                tone={
                  blockchainStatus.apiReachable
                    ? "green"
                    : "amber"
                }
              >
                {blockchainStatus.apiReachable
                  ? "ONLINE"
                  : blockchainStatus.loading
                    ? "CHECKING"
                    : "OFFLINE"}
              </Badge>
            </div>

            <div className="status-row">
              <div className="status-label-wrap">
                <GitBranch size={16} />
                <span>Fabric Channel</span>
              </div>

              <span>
                {blockchainStatus.channel || "bvschannel"}
              </span>
            </div>

            <div className="status-row">
              <div className="status-label-wrap">
                <ShieldCheck size={16} />
                <span>Chaincode</span>
              </div>

              <span>
                {blockchainStatus.chaincode || "hashledger"}
              </span>
            </div>

            <div className="status-row">
              <div className="status-label-wrap">
                <Clock3 size={16} />
                <span>Last Ledger Sync</span>
              </div>

              <span>
                {blockchainStatus.lastSync
                  ? formatEventTime(blockchainStatus.lastSync)
                  : "Awaiting sync"}
              </span>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Recent Detector Activity">
        {recentEvents.length ? (
          <div className="stack-sm">
            {recentEvents.map((event) => (
              <button
                type="button"
                key={event.eventId}
                className="activity-item activity-button"
                onClick={() =>
                  onCameraClick(event.cameraId)
                }
              >
                <div className="activity-top">
                  <span className="activity-id">
                    {event.eventType}
                  </span>

                  <Badge
                    tone={severityTone(event.severity)}
                  >
                    {event.severity}
                  </Badge>
                </div>

                <div className="overview-row">
                  <span>{event.cameraId}</span>
                  <span className="muted">
                    {formatEventTime(event.ts)}
                  </span>
                </div>

                <div className="overview-row">
                  <span className="muted">
                    {event.status || "Detected"}
                  </span>

                  <span className="hash-snippet">
                    {event.eventId}
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="muted">
            No detector events have been generated in this session yet.
          </div>
        )}
      </Card>
    </div>
  );
}

function EventsPage({ events, onCameraClick }) {
  const allEvents = useMemo(
    () =>
      Object.values(events || {})
        .flat()
        .sort(
          (a, b) =>
            new Date(b.ts).getTime() -
            new Date(a.ts).getTime()
        ),
    [events]
  );

  const criticalCount = allEvents.filter(
    (event) =>
      String(event.severity).toUpperCase() === "CRITICAL"
  ).length;

  const warningCount = allEvents.filter(
    (event) =>
      String(event.severity).toUpperCase() === "WARNING"
  ).length;

  const anchoredCount = allEvents.filter(
    (event) =>
      String(event.status || "")
        .toUpperCase()
        .includes("ANCHOR")
  ).length;

  return (
    <div className="page-content">
      <div className="metrics-grid">
        <MetricCard
          title="Session Events"
          value={String(allEvents.length)}
          subtitle="Detector events generated during this operator session"
        />

        <MetricCard
          title="Critical"
          value={String(criticalCount)}
          subtitle="Critical detector events"
        />

        <MetricCard
          title="Warnings"
          value={String(warningCount)}
          subtitle="Warning-level detector events"
        />

        <MetricCard
          title="Anchored"
          value={String(anchoredCount)}
          subtitle="Events confirmed as anchored"
        />
      </div>

      <Card title="Event Stream">
        {allEvents.length ? (
          <div className="stack-sm">
            {allEvents.map((event) => (
              <button
                type="button"
                key={event.eventId}
                className="activity-item activity-button"
                onClick={() =>
                  onCameraClick(event.cameraId)
                }
              >
                <div className="activity-top">
                  <span className="activity-id">
                    {event.eventType}
                  </span>

                  <Badge
                    tone={severityTone(event.severity)}
                  >
                    {event.severity}
                  </Badge>
                </div>

                <div className="overview-row">
                  <span>{event.cameraId}</span>
                  <span className="muted">
                    {formatEventTime(event.ts)}
                  </span>
                </div>

                <div className="overview-row">
                  <span className="muted">
                    {event.status || "Detected"}
                  </span>

                  <span className="hash-snippet">
                    {event.eventId}
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="muted">
            No detector events have been generated in this session yet.
          </div>
        )}
      </Card>
    </div>
  );
}

function CamerasPage({ onCameraClick }) {
  return (
    <div className="page-content">
      <div className="camera-detail-top">
        <div>
          <h2 className="hero-title">
            Camera Operations
          </h2>

          <div className="hero-subtitle">
            Select a live camera to open detector controls,
            evidence activity, restricted-zone tools, PTZ, and
            native full screen.
          </div>
        </div>
      </div>

      <Card title="Live Feeds">
        <CameraWall onCameraClick={onCameraClick} />
      </Card>
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
          value={blockchainStatus.connected ? "Connected" : blockchainStatus.loading ? "Connecting" : "Offline"}
          subtitle={blockchainStatus.lastSync ? `Last sync ${formatEventTime(blockchainStatus.lastSync)}` : "Awaiting first sync"}
        />
      </div>

      <div className={`hash-ledger-status-banner ${blockchainStatus.connected ? "hash-ledger-status-online" : "hash-ledger-status-offline"}`}>
        <div className="hash-ledger-status-title">
          {blockchainStatus.connected ? "Blockchain ledger live" : blockchainStatus.loading ? "Connecting to blockchain ledger..." : "Blockchain ledger unavailable"}
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

function LoginPage({
  onLogin,
  blockchainStatus,
  authChecking,
}) {
  const [username, setUsername] =
    useState("");
  const [password, setPassword] =
    useState("");
  const [showPassword, setShowPassword] =
    useState(false);
  const [submitting, setSubmitting] =
    useState(false);
  const [authError, setAuthError] =
    useState("");

  const configuredCameraCount = [
    "CAM-01",
    "CAM-02",
  ]
    .map((cameraId) =>
      getCameraSource(cameraId)
    )
    .filter(
      (source) =>
        source.kind === "mjpeg"
    ).length;

  const fabricConnected = Boolean(
    blockchainStatus?.connected
  );

  const apiConnected = Boolean(
    blockchainStatus?.apiReachable
  );

  const statusItems = [
    {
      label: "Axis cameras",
      value: configuredCameraCount
        ? `${configuredCameraCount} configured`
        : "Awaiting feeds",
      active: configuredCameraCount > 0,
      icon: Camera,
    },
    {
      label: "BlockVault API",
      value: apiConnected
        ? "Reachable"
        : blockchainStatus?.loading
          ? "Checking"
          : "Offline",
      active: apiConnected,
      icon: Server,
    },
    {
      label: "Fabric ledger",
      value: fabricConnected
        ? `${
            blockchainStatus.channel ||
            "bvschannel"
          } active`
        : blockchainStatus?.loading
          ? "Checking ledger"
          : "Offline",
      active: fabricConnected,
      icon: GitBranch,
    },
  ];

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!username.trim() || !password) {
      setAuthError(
        "Enter your username and password."
      );
      return;
    }

    setSubmitting(true);
    setAuthError("");

    try {
      await onLogin({
        username: username.trim(),
        password,
      });

      setPassword("");
    } catch (error) {
      setAuthError(
        error.message ||
          "Unable to sign in."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const locked =
    submitting || authChecking;

  return (
    <div className="login-page">
      <div
        className="login-ambient login-ambient-one"
        aria-hidden="true"
      />

      <div
        className="login-ambient login-ambient-two"
        aria-hidden="true"
      />

      <div
        className="login-grid"
        aria-hidden="true"
      />

      <section
        className="login-left"
        aria-label="BlockVault platform overview"
      >
        <div className="login-brand-lockup">
          <div
            className="login-brand-orb"
            aria-hidden="true"
          />

          <div>
            <div className="login-brand-wordmark">
              BLOCKVAULT
            </div>

            <div className="login-brand-company">
              BLOCK VAULT SYSTEMS
            </div>
          </div>
        </div>

        <div className="login-hero">
          <div className="login-eyebrow">
            <ShieldCheck size={15} />
            Security Operations Platform
          </div>

          <h1 className="login-hero-title">
            Security events,
            <span>
              verified at the source.
            </span>
          </h1>

          <p className="login-hero-copy">
            Live Axis monitoring, edge
            security detection, and
            blockchain-anchored evidence in
            one audit-ready operator
            environment.
          </p>

          <div
            className="login-core-visual"
            aria-hidden="true"
          >
            <div className="login-core-orbit login-core-orbit-outer" />
            <div className="login-core-orbit login-core-orbit-inner" />

            <div className="login-core-node login-core-node-camera">
              <Camera size={16} />
            </div>

            <div className="login-core-node login-core-node-ledger">
              <GitBranch size={16} />
            </div>

            <div className="login-core-node login-core-node-api">
              <Server size={16} />
            </div>

            <div className="login-core-light">
              <div className="login-core-light-center" />
            </div>
          </div>

          <div
            className="login-status-strip"
            aria-label="Live platform status"
          >
            {statusItems.map((item) => {
              const Icon = item.icon;

              return (
                <div
                  className="login-status-item"
                  key={item.label}
                >
                  <div
                    className={`login-status-icon ${
                      item.active
                        ? "is-online"
                        : "is-pending"
                    }`}
                  >
                    <Icon size={16} />
                  </div>

                  <div>
                    <div className="login-status-label">
                      {item.label}
                    </div>

                    <div className="login-status-value">
                      <span
                        className={`login-status-dot ${
                          item.active
                            ? "is-online"
                            : "is-pending"
                        }`}
                      />

                      {item.value}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="login-trust-row">
          <span>Immutable audit trail</span>
          <span>Evidence integrity</span>
          <span>V5 security environment</span>
        </div>
      </section>

      <section
        className="login-right"
        aria-label="Secure operator sign in"
      >
        <div
          className="login-mobile-brand"
          aria-label="BlockVault"
        >
          <div
            className="login-brand-orb"
            aria-hidden="true"
          />

          <div>
            <div className="login-brand-wordmark">
              BLOCKVAULT
            </div>

            <div className="login-brand-company">
              BLOCK VAULT SYSTEMS
            </div>
          </div>
        </div>

        <div
          className="login-mobile-brief"
          aria-label="BlockVault platform status"
        >
          <div className="login-mobile-brief-eyebrow">
            <ShieldCheck size={13} />
            <span>Security Operations Platform</span>
          </div>

          <h1 className="login-mobile-brief-title">
            Security events,
            <span> verified at the source.</span>
          </h1>

          <p className="login-mobile-brief-copy">
            Live Axis monitoring, edge security
            detection, and blockchain-anchored
            evidence.
          </p>

          <div className="login-mobile-status-panel">
            {statusItems.map((item) => {
              const Icon = item.icon;

              return (
                <div
                  className="login-mobile-status-row"
                  key={`mobile-${item.label}`}
                >
                  <div
                    className={`login-mobile-status-icon ${
                      item.active
                        ? "is-online"
                        : "is-pending"
                    }`}
                  >
                    <Icon size={14} />
                  </div>

                  <div className="login-mobile-status-copy">
                    <span className="login-mobile-status-label">
                      {item.label}
                    </span>

                    <span className="login-mobile-status-value">
                      <span
                        className={`login-status-dot ${
                          item.active
                            ? "is-online"
                            : "is-pending"
                        }`}
                      />
                      {item.value}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="login-card-shell">
          <div
            className="login-card-glow"
            aria-hidden="true"
          />

          <div className="login-card">
            <div className="login-card-header">
              <div className="login-access-mark">
                <ShieldCheck size={20} />
              </div>

              <div className="login-card-kicker">
                Authorized Access
              </div>

              <h2 className="login-title">
                Operator Sign In
              </h2>

              <p className="login-card-copy">
                Authenticate to access live
                camera operations, detector
                activity, and Fabric-backed
                evidence.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              autoComplete="on"
            >
              <div className="login-field-group">
                <label
                  className="login-field-label"
                  htmlFor="blockvault-username"
                >
                  Username
                </label>

                <input
                  id="blockvault-username"
                  className="login-input"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  enterKeyHint="next"
                  spellCheck="false"
                  value={username}
                  onChange={(event) => {
                    setUsername(
                      event.target.value
                    );
                    setAuthError("");
                  }}
                  disabled={locked}
                />
              </div>

              <div className="login-field-group">
                <label
                  className="login-field-label"
                  htmlFor="blockvault-password"
                >
                  Password
                </label>

                <div className="password-wrap">
                  <input
                    id="blockvault-password"
                    className="login-input"
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    autoComplete="current-password"
                    enterKeyHint="go"
                    value={password}
                    onChange={(event) => {
                      setPassword(
                        event.target.value
                      );
                      setAuthError("");
                    }}
                    disabled={locked}
                  />

                  <button
                    className="password-toggle"
                    type="button"
                    aria-label={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                    onClick={() =>
                      setShowPassword(
                        (previous) =>
                          !previous
                      )
                    }
                    disabled={locked}
                  >
                    {showPassword ? (
                      <EyeOff size={17} />
                    ) : (
                      <Eye size={17} />
                    )}
                  </button>
                </div>
              </div>

              {authError ? (
                <div
                  className="login-auth-error"
                  role="alert"
                >
                  {authError}
                </div>
              ) : null}

              <button
                className="signin-btn"
                type="submit"
                disabled={locked}
              >
                <span>
                  {authChecking
                    ? "Validating Session"
                    : submitting
                      ? "Signing In"
                      : "Sign In"}
                </span>

                <ShieldCheck size={17} />
              </button>
            </form>

            <div className="login-card-divider">
              <span>
                Protected operator access
              </span>
            </div>

            <div className="login-assurance-grid">
              <div className="login-assurance-item">
                <Camera size={16} />
                <span>
                  Live Axis monitoring
                </span>
              </div>

              <div className="login-assurance-item">
                <GitBranch size={16} />
                <span>
                  Fabric-backed evidence
                </span>
              </div>
            </div>

            <div className="login-security-notice">
              <div className="login-security-notice-icon">
                <Shield size={16} />
              </div>

              <p>
                Secure operator access.
                Authentication is required
                to enter the BlockVault
                environment.
              </p>
            </div>
          </div>

          <div className="login-card-footer">
            <span>
              BLOCKVAULT SECURITY OPERATIONS
            </span>

            <span>BLOCKVAULT V5</span>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [current, setCurrent] = useState("login");
  const [authToken, setAuthToken] =
    useState("");
  const [authUser, setAuthUser] =
    useState("");
  const [authChecking, setAuthChecking] =
    useState(false);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [cameraEvents, setCameraEvents] = useState(initialCameraEvents);
  const [blockchainHashesByCamera, setBlockchainHashesByCamera] = useState(() => createEmptyLedgerByCamera());
  const [blockchainStatus, setBlockchainStatus] = useState({
    loading: false,
    apiReachable: false,
    connected: false,
    error: "",
    channel: "",
    chaincode: "",
    lastSync: "",
  });
  const [zonesByCamera, setZonesByCamera] = useState(initialZonesByCamera);
  const [featureArmsByCamera, setFeatureArmsByCamera] = useState(initialFeatureArmsByCamera);
  const [feedFreshnessMs, setFeedFreshnessMs] = useState(null);
  const [cameraHealthById, setCameraHealthById] = useState({});
  const [systemFlow, setSystemFlow] = useState({
    eventId: "",
    cameraId: "",
    eventType: "",
    ts: "",
    hasEvidence: false,
    hashReady: false,
    anchored: false,
    state: "idle",
    sequence: 0,
  });
  const feedFreshnessSamplesRef = useRef([]);

  const clearAuthSession = useCallback(() => {
    setAuthToken("");
    setAuthUser("");
    setAuthChecking(false);
    setCurrent("login");
    setSelectedCamera(null);
    setBlockchainHashesByCamera(
      createEmptyLedgerByCamera()
    );
    setSystemFlow({
      eventId: "",
      cameraId: "",
      eventType: "",
      ts: "",
      hasEvidence: false,
      hashReady: false,
      anchored: false,
      state: "idle",
      sequence: 0,
    });
  }, []);

  const handleLogin = useCallback(
    async ({ username, password }) => {
      const response = await fetch(
        `${API_BASE_URL}/api/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            username,
            password,
          }),
        }
      );

      const payload = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload.error ||
            "Unable to sign in."
        );
      }

      if (!payload.token) {
        throw new Error(
          "Authentication response did not include a session token."
        );
      }

      setAuthToken(payload.token);
      setAuthUser(
        payload.user?.username ||
          username
      );
      setAuthChecking(false);
      setCurrent("home");
    },
    []
  );

  useEffect(() => {
    if (!authToken) {
      setAuthChecking(false);
      return undefined;
    }

    let cancelled = false;

    const validateSession = async () => {
      setAuthChecking(true);

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/auth/session`,
          {
            headers: {
              Authorization:
                `Bearer ${authToken}`,
            },
            cache: "no-store",
          }
        );

        const payload = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            payload.error ||
              "Session expired."
          );
        }

        if (cancelled) {
          return;
        }

        setAuthUser(
          payload.user?.username ||
            "admin"
        );

        setCurrent((previous) =>
          previous === "login"
            ? "home"
            : previous
        );
      } catch {
        if (!cancelled) {
          clearAuthSession();
        }
      } finally {
        if (!cancelled) {
          setAuthChecking(false);
        }
      }
    };

    validateSession();

    return () => {
      cancelled = true;
    };
  }, [
    authToken,
    clearAuthSession,
  ]);

  const handleLogout = useCallback(async () => {
    const token = authToken;

    try {
      if (token) {
        await fetch(
          `${API_BASE_URL}/api/auth/logout`,
          {
            method: "POST",
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
            cache: "no-store",
          }
        );
      }
    } catch (error) {
      console.warn(
        "Logout request failed:",
        error
      );
    } finally {
      clearAuthSession();
    }
  }, [
    authToken,
    clearAuthSession,
  ]);


  const fetchFeedFreshness = useCallback(async () => {
    try {
      const response = await fetch(
        `${CAMERA_SERVICE_BASE_URL}/health`,
        {
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error(
          `Camera service health returned ${response.status}`
        );
      }

      const health = await response.json();

      const nextCameraHealthById = Array.isArray(
        health?.cameras
      )
        ? health.cameras.reduce(
            (acc, camera) => {
              const cameraId = String(
                camera?.id || ""
              ).trim();

              if (cameraId) {
                acc[cameraId] = {
                  configured: Boolean(
                    camera?.configured
                  ),
                  ingestRunning: Boolean(
                    camera?.ingestRunning
                  ),
                  connectedClients: Number(
                    camera?.connectedClients || 0
                  ),
                  hasFrame: Boolean(
                    camera?.hasFrame
                  ),
                  lastFrameAgeMs:
                    Number.isFinite(
                      camera?.lastFrameAgeMs
                    )
                      ? Number(
                          camera.lastFrameAgeMs
                        )
                      : null,
                };
              }

              return acc;
            },
            {}
          )
        : {};

      setCameraHealthById(
        nextCameraHealthById
      );

      const ages = Object.values(
        nextCameraHealthById
      )
        .filter(
          (camera) =>
            camera.configured &&
            camera.hasFrame &&
            Number.isFinite(
              camera.lastFrameAgeMs
            )
        )
        .map((camera) =>
          Number(camera.lastFrameAgeMs)
        );

      if (!ages.length) {
        setFeedFreshnessMs(null);
        return;
      }

      const currentAverage =
        ages.reduce(
          (total, age) => total + age,
          0
        ) / ages.length;

      const nextSamples = [
        ...feedFreshnessSamplesRef.current,
        currentAverage,
      ].slice(-30);

      feedFreshnessSamplesRef.current =
        nextSamples;

      const rollingAverage =
        nextSamples.reduce(
          (total, sample) => total + sample,
          0
        ) / nextSamples.length;

      setFeedFreshnessMs(rollingAverage);
    } catch (error) {
      console.error(
        "Failed to read camera freshness:",
        error
      );
      setFeedFreshnessMs(null);
      setCameraHealthById({});
    }
  }, []);

  useEffect(() => {
    fetchFeedFreshness();

    const intervalId = window.setInterval(
      fetchFeedFreshness,
      137
    );

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchFeedFreshness]);

  const fetchBlockchainHashes = useCallback(async () => {
    setBlockchainStatus((previous) => ({
      ...previous,
      loading: true,
      error: "",
    }));

    try {
      const healthResponse = await fetch(
        `${API_BASE_URL}/api/health`,
        {
          cache: "no-store",
        }
      );

      const health =
        await healthResponse
          .json()
          .catch(() => ({}));

      const fabricConnected =
        healthResponse.ok &&
        health?.ok === true &&
        health?.fabric === "connected";

      if (!authToken) {
        setBlockchainStatus(
          (previous) => ({
            ...previous,
            loading: false,
            apiReachable: true,
            connected:
              fabricConnected,
            error:
              fabricConnected
                ? ""
                : health.error ||
                  "Fabric ledger offline",
            channel:
              health.channel ||
              previous.channel ||
              "bvschannel",
            chaincode:
              health.chaincode ||
              previous.chaincode ||
              "hashledger",
          })
        );

        return;
      }

      const groupedResponse =
        await fetch(
          `${API_BASE_URL}/api/hashes/grouped`,
          {
            headers: {
              Authorization:
                `Bearer ${authToken}`,
            },
            cache: "no-store",
          }
        );

      if (
        groupedResponse.status === 401
      ) {
        clearAuthSession();
        return;
      }

      if (!groupedResponse.ok) {
        throw new Error(
          `Grouped hash request failed with status ${groupedResponse.status}`
        );
      }

      const grouped =
        await groupedResponse.json();

      setBlockchainHashesByCamera(
        buildLedgerState(grouped)
      );

      setBlockchainStatus({
        loading: false,
        apiReachable: true,
        connected:
          fabricConnected,
        error:
          fabricConnected
            ? ""
            : health.error ||
              "Fabric ledger offline",
        channel:
          health.channel ||
          "bvschannel",
        chaincode:
          health.chaincode ||
          "hashledger",
        lastSync:
          new Date().toISOString(),
      });
    } catch (error) {
      console.error(
        "Blockchain sync failed:",
        error
      );

      setBlockchainStatus(
        (previous) => ({
          ...previous,
          loading: false,
          apiReachable:
            error instanceof TypeError
              ? false
              : previous.apiReachable,
          connected: false,
          error:
            error.message ||
            `Unable to reach BlockVault API at ${API_BASE_URL}`,
        })
      );
    }
  }, [
    authToken,
    clearAuthSession,
  ]);

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
        status: "Anchored",
        source: event.meta?.source || "ui",
        snapshotRef: event.snapshotRef || null,
        evidence: event.evidence || null,
        meta: {
          ...(event.meta || {}),
          detectorStatus: event.status || "Detected",
        },
      };

      const response = await fetch(`${API_BASE_URL}/api/hashes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 401) {
        clearAuthSession();
        throw new Error("Session expired");
      }

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

      if (!event.meta?.heartbeat) {
        const hashReady = [
          savedRecord.primaryHash,
          savedRecord.evidenceHash,
          savedRecord.metadataHash,
        ].some(
          (value) =>
            Boolean(value) &&
            String(value).toLowerCase() !== "pending"
        );

        setSystemFlow((previous) => {
          if (previous.eventId !== savedRecord.eventId) {
            return previous;
          }

          return {
            ...previous,
            cameraId: savedRecord.cameraId || previous.cameraId,
            eventType: savedRecord.eventType || previous.eventType,
            ts: savedRecord.ts || previous.ts,
            hashReady,
            anchored: true,
            state: "anchored",
            sequence: previous.sequence + 1,
          };
        });
      }

      setBlockchainStatus((prev) => ({
        ...prev,
        connected: true,
        error: "",
        lastSync: new Date().toISOString(),
      }));
    } catch (error) {
      console.error("Blockchain write failed:", error);

      if (!event.meta?.heartbeat) {
        setSystemFlow((previous) =>
          previous.eventId === event.eventId
            ? {
                ...previous,
                anchored: false,
                state: "error",
                sequence: previous.sequence + 1,
              }
            : previous
        );
      }

      setBlockchainStatus((prev) => ({
        ...prev,
        connected: false,
        error: error.message || "Unable to write hash event to Fabric",
      }));
    }
  }, [authToken, clearAuthSession]);

  const openCameraDetail = (cameraId) => {
    setSelectedCamera(cameraId);
  };

  const closeCameraDetail = () => {
    setSelectedCamera(null);
  };

  const handleNewCameraEvent = useCallback((event) => {
    const { evidence, snapshotRef, ...displayEvent } = event;
    const normalizedEvent = {
      ...displayEvent,
      eventId:
        event.eventId ||
        `evt_${String(event.cameraId || "cam").toLowerCase().replace(/[^a-z0-9]/g, "")}_${Date.now()}`,
    };
    const blockchainEvent = {
      ...normalizedEvent,
      evidence: evidence || null,
      snapshotRef: snapshotRef || null,
    };

    if (!event.meta?.heartbeat) {
      setSystemFlow((previous) => ({
        eventId: normalizedEvent.eventId,
        cameraId: normalizedEvent.cameraId,
        eventType: normalizedEvent.eventType,
        ts: normalizedEvent.ts,
        hasEvidence: Boolean(evidence || snapshotRef),
        hashReady: false,
        anchored: false,
        state: "processing",
        sequence: previous.sequence + 1,
      }));
    }

    setCameraEvents((prev) => {
      const existing = prev[normalizedEvent.cameraId] || [];
      return {
        ...prev,
        [normalizedEvent.cameraId]: sortEventsNewestFirst([normalizedEvent, ...existing]).slice(0, 20),
      };
    });

    void syncHashEventToBlockchain(blockchainEvent);
  }, [syncHashEventToBlockchain]);

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
            cameraHealth={
              cameraHealthById[selectedCamera] ||
              null
            }
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
        return {
          title: "Overview",
          node: (
            <HomePage
              blockchainStatus={blockchainStatus}
              blockchainEvents={blockchainHashesByCamera}
              cameraEvents={cameraEvents}
              cameraHealthById={cameraHealthById}
              featureArmsByCamera={featureArmsByCamera}
              feedFreshnessMs={feedFreshnessMs}
              systemFlow={systemFlow}
              onCameraClick={openCameraDetail}
            />
          ),
        };

      case "groups":
        return {
          title: "Cameras",
          node: (
            <CamerasPage
              onCameraClick={openCameraDetail}
            />
          ),
        };

      case "access":
        return {
          title: "Events",
          node: (
            <EventsPage
              events={cameraEvents}
              onCameraClick={openCameraDetail}
            />
          ),
        };

      case "hashes":
        return {
          title: "Evidence Ledger",
          node: (
            <HashLedgerPage
              blockchainEvents={blockchainHashesByCamera}
              blockchainStatus={blockchainStatus}
              onCameraClick={openCameraDetail}
            />
          ),
        };

      default:
        return {
          title: "Overview",
          node: (
            <HomePage
              blockchainStatus={blockchainStatus}
              blockchainEvents={blockchainHashesByCamera}
              cameraEvents={cameraEvents}
              cameraHealthById={cameraHealthById}
              featureArmsByCamera={featureArmsByCamera}
              feedFreshnessMs={feedFreshnessMs}
              systemFlow={systemFlow}
              onCameraClick={openCameraDetail}
            />
          ),
        };
    }
  }, [
    blockchainHashesByCamera,
    blockchainStatus,
    cameraEvents,
    cameraHealthById,
    current,
    featureArmsByCamera,
    handleNewCameraEvent,
    feedFreshnessMs,
    selectedCamera,
    systemFlow,
    zonesByCamera,
  ]);

  const feedHealth = Number.isFinite(
    feedFreshnessMs
  )
    ? clampUnit(
        (250 - feedFreshnessMs) / 250
      )
    : 0;

  const cameraHealthRecords =
    Object.values(cameraHealthById);

  const liveCameraHealthCount =
    cameraHealthRecords.filter(
      (health) =>
        health?.configured &&
        health?.ingestRunning &&
        health?.hasFrame
    ).length;

  const cameraHealthRatio =
    cameraHealthRecords.length > 0
      ? clampUnit(
          liveCameraHealthCount /
            cameraHealthRecords.length
        )
      : 0;

  const appTelemetryStyle = {
    "--feed-freshness-ms":
      Number.isFinite(feedFreshnessMs)
        ? Math.round(feedFreshnessMs)
        : 0,
    "--feed-health": feedHealth,
    "--fabric-health":
      blockchainStatus.connected ? 1 : 0,
    "--api-health":
      blockchainStatus.apiReachable ? 1 : 0,
    "--camera-health":
      cameraHealthRatio,
  };

  if (current === "login") {
    return (
      <LoginPage
        onLogin={handleLogin}
        blockchainStatus={blockchainStatus}
        authChecking={authChecking}
      />
    );
  }

  return (
    <div
      className="app-shell"
      style={appTelemetryStyle}
      data-fabric-state={
        blockchainStatus.connected
          ? "connected"
          : blockchainStatus.loading
            ? "connecting"
            : "offline"
      }
      data-api-state={
        blockchainStatus.apiReachable
          ? "online"
          : blockchainStatus.loading
            ? "checking"
            : "offline"
      }
      data-feed-state={getFeedFreshnessState(
        feedFreshnessMs
      )}
    >
      <div className="app-layout">
        <Sidebar current={current} setCurrent={setCurrent} onCloseCameraDetail={closeCameraDetail} />
        <main className="main-area">
          <TopBar
            title={page.title}
            blockchainStatus={blockchainStatus}
            authUser={authUser}
            onLogout={handleLogout}
          />
          {page.node}
        </main>
      </div>
    </div>
  );
}
