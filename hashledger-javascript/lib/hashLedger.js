"use strict";

const { Contract } = require("fabric-contract-api");

class HashLedgerContract extends Contract {
  async InitLedger(ctx) {
    return;
  }

  async HashEventExists(ctx, id) {
    const buffer = await ctx.stub.getState(id);
    return !!buffer && buffer.length > 0;
  }

  async CreateHashEvent(
    ctx,
    id,
    cameraId,
    eventType,
    severity,
    ts,
    primaryHash,
    evidenceHash,
    metadataHash,
    status
  ) {
    if (!id) throw new Error("id is required");
    if (!cameraId) throw new Error("cameraId is required");
    if (!eventType) throw new Error("eventType is required");
    if (!ts) throw new Error("ts is required");

    const exists = await this.HashEventExists(ctx, id);
    if (exists) {
      throw new Error(`hash event ${id} already exists`);
    }

    const record = {
      docType: "hashEvent",
      id,
      cameraId,
      eventType,
      severity,
      ts,
      primaryHash,
      evidenceHash,
      metadataHash,
      status,
    };

    await ctx.stub.putState(id, Buffer.from(JSON.stringify(record)));
    return JSON.stringify(record);
  }

  async GetHashEvent(ctx, id) {
    const buffer = await ctx.stub.getState(id);

    if (!buffer || buffer.length === 0) {
      throw new Error(`hash event ${id} does not exist`);
    }

    return buffer.toString();
  }

  async UpdateHashEventStatus(ctx, id, status) {
    const buffer = await ctx.stub.getState(id);

    if (!buffer || buffer.length === 0) {
      throw new Error(`hash event ${id} does not exist`);
    }

    const record = JSON.parse(buffer.toString());
    record.status = status;

    await ctx.stub.putState(id, Buffer.from(JSON.stringify(record)));
    return JSON.stringify(record);
  }

  async GetAllHashEvents(ctx) {
    const iterator = await ctx.stub.getStateByRange("", "");
    const results = [];

    while (true) {
      const result = await iterator.next();

      if (result.value && result.value.value) {
        const value = result.value.value.toString("utf8");

        try {
          const parsed = JSON.parse(value);
          if (parsed.docType === "hashEvent") {
            results.push(parsed);
          }
        } catch (error) {
          // ignore non-JSON state
        }
      }

      if (result.done) {
        await iterator.close();
        break;
      }
    }

    return JSON.stringify(results);
  }

  async GetHashesByCamera(ctx, cameraId) {
    const all = JSON.parse(await this.GetAllHashEvents(ctx));
    const filtered = all.filter((item) => item.cameraId === cameraId);
    return JSON.stringify(filtered);
  }
}

module.exports = HashLedgerContract;