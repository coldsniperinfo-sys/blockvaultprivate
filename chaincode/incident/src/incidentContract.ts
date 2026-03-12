import { Context, Contract } from "fabric-contract-api";

type AnalysisStatus = "PENDING" | "COMPLETED" | "FAILED";

type FaceAnalysis = Record<string, unknown> | null;

type IncidentMeta = Record<string, unknown> & {
  faceAnalysis?: FaceAnalysis;
};

type Incident = {
  incidentId: string;
  ts: string;
  cameraId: string;
  type: string;
  severity: number;
  evidenceUri: string;
  evidenceHash: string;
  metadataHash: string;
  meta?: IncidentMeta;
  analysisStatus?: AnalysisStatus;
  analysisRequestedAt?: string;
  analysisUpdatedAt?: string;
};

function keyFor(id: string) {
  return `INCIDENT_${id}`;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseFaceAnalysis(faceAnalysisJson: string): FaceAnalysis {
  const parsed = JSON.parse(faceAnalysisJson) as unknown;
  if (parsed === null) return null;
  return asObject(parsed);
}

export class IncidentContract extends Contract {
  private async readIncident(ctx: Context, incidentId: string): Promise<Incident> {
    const data = await ctx.stub.getState(keyFor(incidentId));
    if (!data || data.length === 0) {
      throw new Error(`Incident not found: ${incidentId}`);
    }
    return JSON.parse(Buffer.from(data).toString("utf8")) as Incident;
  }

  async Ping(_ctx: Context): Promise<string> {
    return "ok";
  }

  async CreateIncident(ctx: Context, incidentJson: string): Promise<string> {
    const incident = JSON.parse(incidentJson) as Incident;

    if (!incident?.incidentId) throw new Error("incidentId is required");
    const k = keyFor(incident.incidentId);

    const exists = await this.IncidentExists(ctx, incident.incidentId);
    if (exists) throw new Error(`Incident already exists: ${incident.incidentId}`);

    if (!incident.ts) incident.ts = new Date().toISOString();
    if (typeof incident.severity !== "number") incident.severity = 0;
    incident.meta = asObject(incident.meta) as IncidentMeta;

    await ctx.stub.putState(k, Buffer.from(JSON.stringify(incident)));

    ctx.stub.setEvent(
      "IncidentCreated",
      Buffer.from(
        JSON.stringify({
          incidentId: incident.incidentId,
          ts: incident.ts,
          type: incident.type,
          severity: incident.severity,
        })
      )
    );

    return JSON.stringify({ ok: true, incidentId: incident.incidentId });
  }

  async FinalizeIncidentAnalysis(
    ctx: Context,
    incidentId: string,
    analysisStatus: AnalysisStatus,
    faceAnalysisJson: string,
    metadataHash: string,
    analysisUpdatedAt: string
  ): Promise<string> {
    const incident = await this.readIncident(ctx, incidentId);
    const faceAnalysis = parseFaceAnalysis(faceAnalysisJson);
    const meta = asObject(incident.meta) as IncidentMeta;

    incident.meta = {
      ...meta,
      faceAnalysis,
    };
    incident.analysisStatus = analysisStatus;
    incident.analysisUpdatedAt = analysisUpdatedAt;
    incident.metadataHash = metadataHash;

    await ctx.stub.putState(keyFor(incidentId), Buffer.from(JSON.stringify(incident)));

    const faceAnalysisObj = asObject(faceAnalysis);
    const bestMatch = asObject(faceAnalysisObj.bestMatch);
    const bestMatchId =
      typeof bestMatch.id === "string" && bestMatch.id.trim() ? bestMatch.id : null;
    const frDecision =
      typeof faceAnalysisObj.frDecision === "string" ? faceAnalysisObj.frDecision : null;

    ctx.stub.setEvent(
      "IncidentAnalysisUpdated",
      Buffer.from(
        JSON.stringify({
          incidentId,
          analysisStatus,
          frDecision,
          bestMatchId,
        })
      )
    );

    return JSON.stringify({ ok: true, incidentId, analysisStatus });
  }

  async GetIncident(ctx: Context, incidentId: string): Promise<string> {
    const incident = await this.readIncident(ctx, incidentId);
    return JSON.stringify(incident);
  }

  async IncidentExists(ctx: Context, incidentId: string): Promise<boolean> {
    const data = await ctx.stub.getState(keyFor(incidentId));
    return !!data && data.length > 0;
  }

  async GetAllIncidents(ctx: Context): Promise<string> {
    const out: Incident[] = [];
    const iterator = await ctx.stub.getStateByRange("", "");

    while (true) {
      const result = await iterator.next();
      if (result.value) {
        const key = result.value.key as string;
        if (key.startsWith("INCIDENT_")) {
          out.push(JSON.parse(Buffer.from(result.value.value).toString("utf8")) as Incident);
        }
      }

      if (result.done) {
        await iterator.close();
        break;
      }
    }

    out.sort((a, b) => (a.ts || "").localeCompare(b.ts || ""));
    return JSON.stringify(out);
  }
}
