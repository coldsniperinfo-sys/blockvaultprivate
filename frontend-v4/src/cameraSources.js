const trimTrailingSlash = (value = "") => String(value || "").trim().replace(/\/$/, "");

const CAMERA_SERVICE_BASE_URL = trimTrailingSlash(
  import.meta.env.VITE_CAMERA_SERVICE_URL || ""
);

const AXIS_CAMERA_IDS = new Set(
  String(import.meta.env.VITE_AXIS_CAMERA_IDS || "CAM-01,CAM-02")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

const EXPLICIT_STREAM_URLS = {
  "CAM-01": trimTrailingSlash(import.meta.env.VITE_CAM_01_STREAM_URL || ""),
  "CAM-02": trimTrailingSlash(import.meta.env.VITE_CAM_02_STREAM_URL || ""),
  "CAM-03": trimTrailingSlash(import.meta.env.VITE_CAM_03_STREAM_URL || ""),
};

const ENABLE_WEBCAM_FALLBACK =
  String(import.meta.env.VITE_ENABLE_WEBCAM_FALLBACK || "true").toLowerCase() !== "false";

const HAS_NETWORK_CAMERA_CONFIGURATION =
  Boolean(CAMERA_SERVICE_BASE_URL) || Object.values(EXPLICIT_STREAM_URLS).some(Boolean);

export function getCameraSource(cameraId) {
  const explicitUrl = EXPLICIT_STREAM_URLS[cameraId];

  if (explicitUrl) {
    return {
      kind: "mjpeg",
      url: explicitUrl,
      label: "Axis MJPEG",
    };
  }

  if (CAMERA_SERVICE_BASE_URL && AXIS_CAMERA_IDS.has(cameraId)) {
    return {
      kind: "mjpeg",
      url: `${CAMERA_SERVICE_BASE_URL}/camera/${encodeURIComponent(cameraId)}`,
      label: "Axis MJPEG",
    };
  }

  if (HAS_NETWORK_CAMERA_CONFIGURATION) {
    return {
      kind: "offline",
      url: "",
      label: "Not configured",
    };
  }

  if (ENABLE_WEBCAM_FALLBACK) {
    return {
      kind: "webcam",
      url: "",
      label: "Browser camera",
    };
  }

  return {
    kind: "offline",
    url: "",
    label: "Not configured",
  };
}

export function getMediaDimensions(mediaElement) {
  if (!mediaElement) return { width: 0, height: 0 };

  const width = Number(mediaElement.videoWidth || mediaElement.naturalWidth || 0);
  const height = Number(mediaElement.videoHeight || mediaElement.naturalHeight || 0);

  return {
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0,
  };
}

export function getAnalysisDimensions(mediaElement, maxWidth = 640) {
  const { width, height } = getMediaDimensions(mediaElement);
  if (!width || !height) return { width: 0, height: 0 };

  const scale = Math.min(1, maxWidth / width);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
