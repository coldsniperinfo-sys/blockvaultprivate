"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncidentContract = void 0;
const fabric_contract_api_1 = require("fabric-contract-api");
function keyFor(id) {
    return `INCIDENT_${id}`;
}
function asObject(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value;
    }
    return {};
}
function parseFaceAnalysis(faceAnalysisJson) {
    const parsed = JSON.parse(faceAnalysisJson);
    if (parsed === null)
        return null;
    return asObject(parsed);
}
class IncidentContract extends fabric_contract_api_1.Contract {
    async readIncident(ctx, incidentId) {
        const data = await ctx.stub.getState(keyFor(incidentId));
        if (!data || data.length === 0) {
            throw new Error(`Incident not found: ${incidentId}`);
        }
        return JSON.parse(Buffer.from(data).toString("utf8"));
    }
    async Ping(_ctx) {
        return "ok";
    }
    async CreateIncident(ctx, incidentJson) {
        const incident = JSON.parse(incidentJson);
        if (!incident?.incidentId)
            throw new Error("incidentId is required");
        const k = keyFor(incident.incidentId);
        const exists = await this.IncidentExists(ctx, incident.incidentId);
        if (exists)
            throw new Error(`Incident already exists: ${incident.incidentId}`);
        if (!incident.ts)
            incident.ts = new Date().toISOString();
        if (typeof incident.severity !== "number")
            incident.severity = 0;
        incident.meta = asObject(incident.meta);
        await ctx.stub.putState(k, Buffer.from(JSON.stringify(incident)));
        ctx.stub.setEvent("IncidentCreated", Buffer.from(JSON.stringify({
            incidentId: incident.incidentId,
            ts: incident.ts,
            type: incident.type,
            severity: incident.severity,
        })));
        return JSON.stringify({ ok: true, incidentId: incident.incidentId });
    }
    async FinalizeIncidentAnalysis(ctx, incidentId, analysisStatus, faceAnalysisJson, metadataHash, analysisUpdatedAt) {
        const incident = await this.readIncident(ctx, incidentId);
        const faceAnalysis = parseFaceAnalysis(faceAnalysisJson);
        const meta = asObject(incident.meta);
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
        const bestMatchId = typeof bestMatch.id === "string" && bestMatch.id.trim() ? bestMatch.id : null;
        const frDecision = typeof faceAnalysisObj.frDecision === "string" ? faceAnalysisObj.frDecision : null;
        ctx.stub.setEvent("IncidentAnalysisUpdated", Buffer.from(JSON.stringify({
            incidentId,
            analysisStatus,
            frDecision,
            bestMatchId,
        })));
        return JSON.stringify({ ok: true, incidentId, analysisStatus });
    }
    async GetIncident(ctx, incidentId) {
        const incident = await this.readIncident(ctx, incidentId);
        return JSON.stringify(incident);
    }
    async IncidentExists(ctx, incidentId) {
        const data = await ctx.stub.getState(keyFor(incidentId));
        return !!data && data.length > 0;
    }
    async GetAllIncidents(ctx) {
        const out = [];
        const iterator = await ctx.stub.getStateByRange("", "");
        while (true) {
            const result = await iterator.next();
            if (result.value) {
                const key = result.value.key;
                if (key.startsWith("INCIDENT_")) {
                    out.push(JSON.parse(Buffer.from(result.value.value).toString("utf8")));
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
exports.IncidentContract = IncidentContract;
