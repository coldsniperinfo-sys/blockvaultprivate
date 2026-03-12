import "dotenv/config";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { newFabricClient, sha256Hex } from "./fabric";
import { computeThreat, isAfterHoursNow } from "./threat";

type AnalysisStatus = "PENDING" | "COMPLETED" | "FAILED";

type FaceAnalysisResult = {
  ok: boolean;
  facesDetected: number;
  frDecision: string;
  bestMatch: {
    id: string | null;
    score: number | null;
  };
  model?: string;
  threshold?: number | null;
  execution?: Record<string, unknown>;
  timingsMs?: Record<string, unknown>;
  faces: Array<{
    bbox?: number[];
    matchId?: string | null;
    matchScore?: number | null;
  }>;
  error?: string;
};

type IncidentMeta = Record<string, unknown> & {
  faceAnalysis?: FaceAnalysisResult | null;
};

type IncidentRecord = {
  incidentId: string;
  ts: string;
  cameraId: string;
  type: string;
  severity: number;
  evidenceUri: string;
  evidenceHash: string;
  metadataHash: string;
  threatScore?: number;
  threatLevel?: string;
  reasons?: string[];
  signals?: Record<string, unknown>;
  meta?: IncidentMeta;
  analysisStatus?: AnalysisStatus;
  analysisRequestedAt?: string;
  analysisUpdatedAt?: string;
};

type AnalysisJob = {
  incidentId: string;
  cameraId: string;
  evidencePath: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "15mb" }));
app.use(morgan("dev"));

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use((req: any, res: any, next: () => void) => {
  const p = req.path.toLowerCase();
  if (p === "/" || p.endsWith(".html") || p.endsWith(".js") || p.endsWith(".css")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
  }
  next();
});

const publicDir = path.join(__dirname, "..", "public");
const evidenceDir = path.join(__dirname, "..", "evidence");
if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });

app.use("/evidence", express.static(evidenceDir));
app.use(express.static(publicDir));

const faceAnalysisEnabled = parseBoolean(process.env.FACE_ANALYSIS_ENABLED, true);
const faceServiceUrl = (process.env.FACE_SERVICE_URL || "http://localhost:8001").replace(/\/+$/, "");
const faceVerifyTimeoutMs = Math.max(1000, parseNumber(process.env.FACE_VERIFY_TIMEOUT_MS, 10000));
const faceAnalysisConcurrency = Math.max(1, parseNumber(process.env.FACE_ANALYSIS_CONCURRENCY, 2));

const recentIncidentTimestamps: number[] = [];
const analysisQueue: AnalysisJob[] = [];
const queuedIncidentIds = new Set<string>();
const activeIncidentIds = new Set<string>();

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function stableJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const normalize = (v: unknown): unknown => {
    if (v === null || v === undefined) return v;
    if (typeof v !== "object") return v;
    if (seen.has(v as object)) return "[Circular]";
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(normalize);
    const keys = Object.keys(v as Record<string, unknown>).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = normalize((v as Record<string, unknown>)[k]);
    return out;
  };
  return JSON.stringify(normalize(value));
}

function getRepeatCount60s(now: number) {
  const cutoff = now - 60_000;
  while (recentIncidentTimestamps.length && recentIncidentTimestamps[0] < cutoff) {
    recentIncidentTimestamps.shift();
  }
  return recentIncidentTimestamps.length;
}

function recordIncident(now: number) {
  recentIncidentTimestamps.push(now);
}

function buildFaceAnalysisFailure(error: string, partial?: unknown): FaceAnalysisResult {
  const raw = asObject(partial);
  const bestMatch = asObject(raw.bestMatch);
  return {
    ok: false,
    facesDetected: typeof raw.facesDetected === "number" ? raw.facesDetected : 0,
    frDecision: typeof raw.frDecision === "string" ? raw.frDecision : "ERROR",
    bestMatch: {
      id: typeof bestMatch.id === "string" ? bestMatch.id : null,
      score: typeof bestMatch.score === "number" ? bestMatch.score : null,
    },
    model: typeof raw.model === "string" ? raw.model : undefined,
    threshold: typeof raw.threshold === "number" ? raw.threshold : null,
    execution: isPlainRecord(raw.execution) ? raw.execution : undefined,
    timingsMs: isPlainRecord(raw.timingsMs) ? raw.timingsMs : undefined,
    faces: normalizeFaces(raw.faces),
    error,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeFaces(value: unknown): FaceAnalysisResult["faces"] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const face = asObject(item);
    const bbox = Array.isArray(face.bbox)
      ? face.bbox.filter((entry): entry is number => typeof entry === "number")
      : undefined;
    return {
      bbox,
      matchId: typeof face.matchId === "string" ? face.matchId : null,
      matchScore: typeof face.matchScore === "number" ? face.matchScore : null,
    };
  });
}

function normalizeFaceAnalysis(value: unknown): FaceAnalysisResult {
  const raw = asObject(value);
  const bestMatch = asObject(raw.bestMatch);
  return {
    ok: raw.ok === true,
    facesDetected: typeof raw.facesDetected === "number" ? raw.facesDetected : 0,
    frDecision: typeof raw.frDecision === "string" ? raw.frDecision : raw.ok === false ? "ERROR" : "UNKNOWN",
    bestMatch: {
      id: typeof bestMatch.id === "string" ? bestMatch.id : null,
      score: typeof bestMatch.score === "number" ? bestMatch.score : null,
    },
    model: typeof raw.model === "string" ? raw.model : undefined,
    threshold: typeof raw.threshold === "number" ? raw.threshold : null,
    execution: isPlainRecord(raw.execution) ? raw.execution : undefined,
    timingsMs: isPlainRecord(raw.timingsMs) ? raw.timingsMs : undefined,
    faces: normalizeFaces(raw.faces),
    error: typeof raw.error === "string" ? raw.error : undefined,
  };
}

function readEvidenceAsDataUrl(evidencePath: string): string {
  const buf = fs.readFileSync(evidencePath);
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

function resolveEvidencePath(evidenceUri: string | undefined): string | null {
  if (!evidenceUri || typeof evidenceUri !== "string") return null;
  const prefix = "/evidence/";
  if (!evidenceUri.startsWith(prefix)) return null;
  const fileName = path.basename(evidenceUri.slice(prefix.length));
  if (!fileName) return null;
  return path.join(evidenceDir, fileName);
}

async function withFabricClient<T>(fn: (client: Awaited<ReturnType<typeof newFabricClient>>) => Promise<T>): Promise<T> {
  const client = await newFabricClient(process.env);
  try {
    return await fn(client);
  } finally {
    try {
      client.close();
    } catch {
      // no-op
    }
  }
}

async function loadIncident(incidentId: string): Promise<IncidentRecord> {
  return withFabricClient(async (client) => {
    const bytes = await client.evaluate("GetIncident", [incidentId]);
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as IncidentRecord;
  });
}

async function loadAllIncidents(): Promise<IncidentRecord[]> {
  return withFabricClient(async (client) => {
    const bytes = await client.evaluate("GetAllIncidents", []);
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as IncidentRecord[];
  });
}

async function finalizeIncidentAnalysis(
  incidentId: string,
  analysisStatus: AnalysisStatus,
  faceAnalysis: FaceAnalysisResult,
  analysisUpdatedAt: string
): Promise<void> {
  const incident = await loadIncident(incidentId);
  const updatedMeta: IncidentMeta = {
    ...asObject(incident.meta),
    faceAnalysis,
  };
  const metadataHash = sha256Hex(Buffer.from(stableJsonStringify(updatedMeta), "utf8"));

  await withFabricClient(async (client) => {
    await client.submit("FinalizeIncidentAnalysis", [
      incidentId,
      analysisStatus,
      JSON.stringify(faceAnalysis),
      metadataHash,
      analysisUpdatedAt,
    ]);
  });
}

async function requestFaceAnalysis(job: AnalysisJob): Promise<FaceAnalysisResult> {
  const imageBase64 = readEvidenceAsDataUrl(job.evidencePath);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), faceVerifyTimeoutMs);

  try {
    const response = await fetch(`${faceServiceUrl}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64, cameraId: job.cameraId }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => undefined);
    if (!response.ok) {
      return buildFaceAnalysisFailure(`Face service HTTP ${response.status}`, payload);
    }
    if (!payload) {
      return buildFaceAnalysisFailure("Face service returned an empty response");
    }
    return normalizeFaceAnalysis(payload);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return buildFaceAnalysisFailure(`Face service timed out after ${faceVerifyTimeoutMs}ms`);
    }
    return buildFaceAnalysisFailure(errorMessage(error));
  } finally {
    clearTimeout(timeout);
  }
}

function enqueueFaceAnalysis(job: AnalysisJob) {
  if (!faceAnalysisEnabled) return;
  if (queuedIncidentIds.has(job.incidentId) || activeIncidentIds.has(job.incidentId)) return;

  analysisQueue.push(job);
  queuedIncidentIds.add(job.incidentId);
  pumpFaceAnalysisQueue();
}

function pumpFaceAnalysisQueue() {
  while (activeIncidentIds.size < faceAnalysisConcurrency && analysisQueue.length > 0) {
    const job = analysisQueue.shift();
    if (!job) return;

    queuedIncidentIds.delete(job.incidentId);
    activeIncidentIds.add(job.incidentId);

    void runFaceAnalysisJob(job).finally(() => {
      activeIncidentIds.delete(job.incidentId);
      pumpFaceAnalysisQueue();
    });
  }
}

async function runFaceAnalysisJob(job: AnalysisJob): Promise<void> {
  const analysisUpdatedAt = new Date().toISOString();

  try {
    const faceAnalysis = await requestFaceAnalysis(job);
    const analysisStatus: AnalysisStatus = faceAnalysis.ok ? "COMPLETED" : "FAILED";
    await finalizeIncidentAnalysis(job.incidentId, analysisStatus, faceAnalysis, analysisUpdatedAt);
  } catch (error) {
    const fallback = buildFaceAnalysisFailure(errorMessage(error));
    try {
      await finalizeIncidentAnalysis(job.incidentId, "FAILED", fallback, analysisUpdatedAt);
    } catch (finalizeError) {
      console.error(`Face analysis finalize failed for ${job.incidentId}:`, finalizeError);
    }
  }
}

async function markIncidentAnalysisFailed(incidentId: string, error: string): Promise<void> {
  try {
    await finalizeIncidentAnalysis(
      incidentId,
      "FAILED",
      buildFaceAnalysisFailure(error),
      new Date().toISOString()
    );
  } catch (finalizeError) {
    console.error(`Unable to mark incident ${incidentId} as failed:`, finalizeError);
  }
}

async function sweepPendingIncidentAnalyses(): Promise<void> {
  if (!faceAnalysisEnabled) return;

  try {
    const incidents = await loadAllIncidents();
    for (const incident of incidents) {
      if (incident.analysisStatus !== "PENDING") continue;

      const evidencePath = resolveEvidencePath(incident.evidenceUri);
      if (!evidencePath) {
        await markIncidentAnalysisFailed(incident.incidentId, "Unable to resolve evidence path for pending incident");
        continue;
      }

      if (!fs.existsSync(evidencePath)) {
        await markIncidentAnalysisFailed(incident.incidentId, "Evidence file missing for pending incident");
        continue;
      }

      enqueueFaceAnalysis({
        incidentId: incident.incidentId,
        cameraId: incident.cameraId,
        evidencePath,
      });
    }
  } catch (error) {
    console.error("Pending incident face-analysis sweep failed:", error);
  }
}

app.get("/api/health", (_req: any, res: any) =>
  res.json({ ok: true, faceAnalysisEnabled, faceServiceUrl })
);

app.get("/api/incidents", async (_req: any, res: any) => {
  try {
    const incidents = await loadAllIncidents();
    res.json(incidents);
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: errorMessage(e) });
  }
});

app.post("/api/incidents", async (req: any, res: any) => {
  const { cameraId, type, meta, imageBase64 } = req.body || {};
  if (!cameraId || !type || typeof imageBase64 !== "string") {
    return res.status(400).json({ ok: false, error: "cameraId, type, imageBase64 required" });
  }

  const b64 = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;

  let imgBuf: Buffer;
  try {
    imgBuf = Buffer.from(b64, "base64");
    if (!imgBuf.length) throw new Error("empty image");
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid imageBase64" });
  }

  const incidentId = crypto.randomUUID();
  const ts = new Date().toISOString();

  const fileName = `${incidentId}.jpg`;
  const evidencePath = path.join(evidenceDir, fileName);
  fs.writeFileSync(evidencePath, imgBuf);

  const evidenceHash = sha256Hex(imgBuf);
  const incomingMeta = asObject(meta);

  const motionScore = Number(incomingMeta.motionScore ?? 0);
  const threshold = Number(incomingMeta.threshold ?? 18);
  const burstMs = Number(incomingMeta.burstMs ?? 0);
  const roiBreach = Boolean(incomingMeta.roiBreach ?? false);
  const tamperSuspected = Boolean(incomingMeta.tamperSuspected ?? false);

  const now = Date.now();
  const repeatCount60s = getRepeatCount60s(now);
  const afterHours = isAfterHoursNow({
    startHour: parseNumber(process.env.ALLOWED_START_HOUR, 7),
    endHour: parseNumber(process.env.ALLOWED_END_HOUR, 19),
  });

  const threat = computeThreat({
    motionScore,
    threshold,
    burstMs,
    roiBreach,
    repeatCount60s,
    afterHours,
    tamperSuspected,
  });

  recordIncident(now);

  const incidentType = threat.threatLevel === "LOW" ? "MOTION" : "THREAT";
  const analysisRequestedAt = faceAnalysisEnabled ? ts : undefined;
  const initialAnalysisStatus: AnalysisStatus = faceAnalysisEnabled ? "PENDING" : "FAILED";
  const initialFaceAnalysis = faceAnalysisEnabled
    ? null
    : buildFaceAnalysisFailure("Face analysis disabled by configuration");
  const metaObj: IncidentMeta = {
    ...incomingMeta,
    faceAnalysis: initialFaceAnalysis,
  };
  const metadataHash = sha256Hex(Buffer.from(stableJsonStringify(metaObj), "utf8"));
  const evidenceUri = `/evidence/${fileName}`;

  const incident: IncidentRecord = {
    incidentId,
    ts,
    cameraId,
    type: incidentType,
    severity: threat.threatScore,
    evidenceUri,
    evidenceHash,
    metadataHash,
    threatScore: threat.threatScore,
    threatLevel: threat.threatLevel,
    reasons: threat.reasons,
    signals: threat.signals,
    meta: metaObj,
    analysisStatus: initialAnalysisStatus,
    analysisRequestedAt,
    analysisUpdatedAt: faceAnalysisEnabled ? undefined : ts,
  };

  try {
    await withFabricClient(async (client) => {
      await client.submit("CreateIncident", [JSON.stringify(incident)]);
    });

    if (faceAnalysisEnabled) {
      enqueueFaceAnalysis({ incidentId, cameraId, evidencePath });
    }

    res.json({ ok: true, incident });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: errorMessage(e) });
  }
});

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, () => {
  console.log(`API Gateway running on http://localhost:${PORT}`);
  void sweepPendingIncidentAnalyses();
});

