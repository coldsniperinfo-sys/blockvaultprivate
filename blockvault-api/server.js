"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs/promises");
const fsSync = require("fs");
const os = require("os");
const path = require("path");
const grpc = require("@grpc/grpc-js");
const { connect, signers } = require("@hyperledger/fabric-gateway");

const app = express();

app.use(cors());
app.use(express.json({ limit: "3mb" }));

const PORT = Number(process.env.PORT || 8081);

const ADMIN_USERNAME = String(
  process.env.BLOCKVAULT_ADMIN_USERNAME || ""
).trim();

const ADMIN_PASSWORD_SALT = String(
  process.env.BLOCKVAULT_ADMIN_PASSWORD_SALT || ""
).trim();

const ADMIN_PASSWORD_HASH = String(
  process.env.BLOCKVAULT_ADMIN_PASSWORD_HASH || ""
).trim();

const AUTH_SESSION_TTL_MS = Math.max(
  15 * 60 * 1000,
  Number(
    process.env.BLOCKVAULT_AUTH_SESSION_TTL_MS ||
      12 * 60 * 60 * 1000
  )
);

const authSessions = new Map();

function resolveFabricTestNetwork() {
  const candidates = [
    process.env.FABRIC_TEST_NETWORK,

    path.join(
      os.homedir(),
      "dev",
      "fabric-samples",
      "test-network"
    ),

    path.resolve(
      __dirname,
      "..",
      "fabric-samples",
      "test-network"
    ),

    path.resolve(
      process.cwd(),
      "fabric-samples",
      "test-network"
    ),
  ].filter(Boolean);

  const match = candidates.find((candidate) =>
    fsSync.existsSync(
      path.join(
        candidate,
        "organizations",
        "peerOrganizations",
        "org1.example.com"
      )
    )
  );

  return match || candidates[0];
}

const FABRIC_TEST_NETWORK = resolveFabricTestNetwork();

const CONFIGURED_CHANNEL_NAME = String(
  process.env.FABRIC_CHANNEL_NAME || ""
).trim();

const CHANNEL_CANDIDATES = Array.from(
  new Set(
    [CONFIGURED_CHANNEL_NAME, "bvschannel", "mychannel"].filter(Boolean)
  )
);

let resolvedChannelName = CONFIGURED_CHANNEL_NAME || "";

const CHAINCODE_NAME =
  process.env.FABRIC_CHAINCODE_NAME || "hashledger";

const MSP_ID =
  process.env.FABRIC_MSP_ID || "Org1MSP";

const PEER_ENDPOINT =
  process.env.FABRIC_PEER_ENDPOINT || "localhost:7051";

const PEER_HOST_ALIAS =
  process.env.FABRIC_PEER_HOST_ALIAS ||
  "peer0.org1.example.com";

const ORG1_CRYPTO_PATH = path.join(
  FABRIC_TEST_NETWORK,
  "organizations",
  "peerOrganizations",
  "org1.example.com"
);

const TLS_CERT_PATH = path.join(
  ORG1_CRYPTO_PATH,
  "peers",
  "peer0.org1.example.com",
  "tls",
  "ca.crt"
);

const ADMIN_MSP_PATH = path.join(
  ORG1_CRYPTO_PATH,
  "users",
  "Admin@org1.example.com",
  "msp"
);

const SIGNCERTS_DIRECTORY_PATH = path.join(
  ADMIN_MSP_PATH,
  "signcerts"
);

const KEY_DIRECTORY_PATH = path.join(
  ADMIN_MSP_PATH,
  "keystore"
);

function resolveIdentityFile(directoryPath, preferredNames = []) {
  if (!fsSync.existsSync(directoryPath)) {
    throw new Error(
      `Fabric identity directory not found: ${directoryPath}`
    );
  }

  const files = fsSync
    .readdirSync(directoryPath)
    .filter((fileName) => !fileName.startsWith("."))
    .filter((fileName) =>
      fsSync
        .statSync(path.join(directoryPath, fileName))
        .isFile()
    );

  if (!files.length) {
    throw new Error(
      `No identity file found in ${directoryPath}`
    );
  }

  const preferred = preferredNames.find((fileName) =>
    files.includes(fileName)
  );

  return path.join(
    directoryPath,
    preferred || files[0]
  );
}

const CERT_PATH = resolveIdentityFile(
  SIGNCERTS_DIRECTORY_PATH,
  [
    "cert.pem",
    "Admin@org1.example.com-cert.pem",
  ]
);

const KEY_PATH = resolveIdentityFile(
  KEY_DIRECTORY_PATH
);

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

function decodeResult(resultBytes) {
  if (!resultBytes || resultBytes.length === 0) {
    return null;
  }

  const text = Buffer.from(resultBytes).toString("utf8");

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildPrimaryHash(payload) {
  return sha256(
    JSON.stringify({
      cameraId: payload.cameraId,
      eventType: payload.eventType,
      severity: payload.severity,
      ts: payload.ts,
      source: payload.source || "ui",
      eventId: payload.id,
    })
  );
}

function buildEvidenceHash(payload) {
  return sha256(
    JSON.stringify({
      cameraId: payload.cameraId,
      eventType: payload.eventType,
      ts: payload.ts,
      evidence: payload.evidence || null,
      snapshotRef: payload.snapshotRef || null,
    })
  );
}

function buildMetadataHash(payload) {
  return sha256(
    JSON.stringify({
      cameraId: payload.cameraId,
      eventType: payload.eventType,
      severity: payload.severity,
      ts: payload.ts,
      status: payload.status,
      meta: payload.meta || {},
    })
  );
}

function normalizeHashEvent(body = {}) {
  const cameraId = String(
    body.cameraId || ""
  ).trim();

  if (!cameraId) {
    throw new Error("cameraId is required");
  }

  const eventType = String(
    body.eventType || "UNKNOWN"
  ).trim();

  const severity = String(
    body.severity || "NORMAL"
  ).trim();

  const ts = String(
    body.ts || new Date().toISOString()
  ).trim();

  const status = String(
    body.status || "Anchored"
  ).trim();

  const id = String(
    body.id ||
      body.eventId ||
      `evt_${cameraId
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")}_${Date.now()}`
  ).trim();

  const payload = {
    id,
    cameraId,
    eventType,
    severity,
    ts,
    status,
    source: body.source || "ui",
    snapshotRef: body.snapshotRef || null,
    evidence: body.evidence || null,
    meta: body.meta || {},
    primaryHash: body.primaryHash || "",
    evidenceHash: body.evidenceHash || "",
    metadataHash: body.metadataHash || "",
  };

  if (!payload.primaryHash) {
    payload.primaryHash =
      buildPrimaryHash(payload);
  }

  if (!payload.evidenceHash) {
    payload.evidenceHash =
      buildEvidenceHash(payload);
  }

  if (!payload.metadataHash) {
    payload.metadataHash =
      buildMetadataHash(payload);
  }

  return payload;
}

async function newGrpcConnection() {
  const tlsRootCert = await fs.readFile(
    TLS_CERT_PATH
  );

  const tlsCredentials =
    grpc.credentials.createSsl(tlsRootCert);

  return new grpc.Client(
    PEER_ENDPOINT,
    tlsCredentials,
    {
      "grpc.ssl_target_name_override":
        PEER_HOST_ALIAS,
    }
  );
}

async function newIdentity() {
  const credentials = await fs.readFile(
    CERT_PATH
  );

  return {
    mspId: MSP_ID,
    credentials,
  };
}

async function newSigner() {
  const privateKeyPem = await fs.readFile(
    KEY_PATH
  );

  const privateKey =
    crypto.createPrivateKey(privateKeyPem);

  return signers.newPrivateKeySigner(
    privateKey
  );
}

async function withContract(work) {
  const client = await newGrpcConnection();
  const identity = await newIdentity();
  const signer = await newSigner();

  const gateway = connect({
    client,
    identity,
    signer,

    evaluateOptions: () => ({
      deadline: Date.now() + 5000,
    }),

    endorseOptions: () => ({
      deadline: Date.now() + 15000,
    }),

    submitOptions: () => ({
      deadline: Date.now() + 15000,
    }),

    commitStatusOptions: () => ({
      deadline: Date.now() + 60000,
    }),
  });

  try {
    const channelsToTry = resolvedChannelName
      ? [resolvedChannelName]
      : CHANNEL_CANDIDATES;

    let lastError = null;

    for (const channelName of channelsToTry) {
      try {
        const network =
          gateway.getNetwork(channelName);

        const contract =
          network.getContract(CHAINCODE_NAME);

        if (!resolvedChannelName) {
          await contract.evaluateTransaction(
            "GetAllHashEvents"
          );

          resolvedChannelName = channelName;

          console.log(
            `Resolved Fabric channel: ${resolvedChannelName}`
          );
        }

        return await work(
          contract,
          channelName
        );
      } catch (error) {
        lastError = error;

        if (resolvedChannelName) {
          throw error;
        }
      }
    }

    throw (
      lastError ||
      new Error(
        "Unable to resolve an active Fabric channel"
      )
    );
  } finally {
    gateway.close();
    client.close();
  }
}

function getChannelName() {
  return (
    resolvedChannelName ||
    CONFIGURED_CHANNEL_NAME ||
    "auto"
  );
}

function groupByCamera(records) {
  return records.reduce((acc, item) => {
    const key =
      item.cameraId || "UNKNOWN";

    if (!acc[key]) {
      acc[key] = [];
    }

    acc[key].push(item);

    return acc;
  }, {});
}

function isAuthConfigured() {
  return Boolean(
    ADMIN_USERNAME &&
      ADMIN_PASSWORD_SALT &&
      ADMIN_PASSWORD_HASH
  );
}

function safeTextEqual(left, right) {
  const leftDigest = crypto
    .createHash("sha256")
    .update(String(left))
    .digest();

  const rightDigest = crypto
    .createHash("sha256")
    .update(String(right))
    .digest();

  return crypto.timingSafeEqual(
    leftDigest,
    rightDigest
  );
}

function passwordMatches(password) {
  if (!isAuthConfigured()) {
    return false;
  }

  try {
    const calculated = crypto
      .scryptSync(
        String(password),
        Buffer.from(
          ADMIN_PASSWORD_SALT,
          "hex"
        ),
        64
      )
      .toString("hex");

    const suppliedBuffer = Buffer.from(
      calculated,
      "hex"
    );

    const expectedBuffer = Buffer.from(
      ADMIN_PASSWORD_HASH,
      "hex"
    );

    if (
      suppliedBuffer.length === 0 ||
      suppliedBuffer.length !==
        expectedBuffer.length
    ) {
      return false;
    }

    return crypto.timingSafeEqual(
      suppliedBuffer,
      expectedBuffer
    );
  } catch {
    return false;
  }
}

function pruneExpiredSessions() {
  const now = Date.now();

  for (const [token, session] of authSessions) {
    if (
      !session ||
      session.expiresAt <= now
    ) {
      authSessions.delete(token);
    }
  }
}

function getBearerToken(req) {
  const header = String(
    req.headers.authorization || ""
  ).trim();

  if (
    !header.toLowerCase().startsWith(
      "bearer "
    )
  ) {
    return "";
  }

  return header.slice(7).trim();
}

function getValidSession(token) {
  if (!token) {
    return null;
  }

  pruneExpiredSessions();

  const session = authSessions.get(token);

  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    authSessions.delete(token);
    return null;
  }

  return session;
}

function requireAuth(req, res, next) {
  const token = getBearerToken(req);
  const session = getValidSession(token);

  if (!session) {
    return res.status(401).json({
      ok: false,
      error: "Authentication required",
    });
  }

  req.auth = {
    token,
    username: session.username,
    expiresAt: session.expiresAt,
  };

  next();
}

app.post("/api/auth/login", (req, res) => {
  res.set("Cache-Control", "no-store");

  if (!isAuthConfigured()) {
    return res.status(503).json({
      ok: false,
      error:
        "Pilot authentication is not configured",
    });
  }

  const username = String(
    req.body?.username || ""
  ).trim();

  const password = String(
    req.body?.password || ""
  );

  const usernameValid =
    username.length > 0 &&
    safeTextEqual(
      username,
      ADMIN_USERNAME
    );

  const passwordValid =
    password.length > 0 &&
    passwordMatches(password);

  if (
    !usernameValid ||
    !passwordValid
  ) {
    return res.status(401).json({
      ok: false,
      error: "Invalid username or password",
    });
  }

  pruneExpiredSessions();

  const token = crypto
    .randomBytes(32)
    .toString("hex");

  const expiresAt =
    Date.now() + AUTH_SESSION_TTL_MS;

  authSessions.set(token, {
    username: ADMIN_USERNAME,
    expiresAt,
  });

  return res.json({
    ok: true,
    token,
    user: {
      username: ADMIN_USERNAME,
      role: "administrator",
    },
    expiresAt: new Date(
      expiresAt
    ).toISOString(),
  });
});

app.get(
  "/api/auth/session",
  requireAuth,
  (req, res) => {
    res.set("Cache-Control", "no-store");

    res.json({
      ok: true,
      user: {
        username: req.auth.username,
        role: "administrator",
      },
      expiresAt: new Date(
        req.auth.expiresAt
      ).toISOString(),
    });
  }
);

app.post(
  "/api/auth/logout",
  requireAuth,
  (req, res) => {
    authSessions.delete(
      req.auth.token
    );

    res.status(204).end();
  }
);

app.get("/api/config", requireAuth, (_req, res) => {
  res.json({
    port: PORT,
    fabricTestNetwork:
      FABRIC_TEST_NETWORK,
    channel: getChannelName(),
    chaincode: CHAINCODE_NAME,
    peerEndpoint: PEER_ENDPOINT,
  });
});

app.get("/api/health", async (_req, res) => {
  try {
    const result = await withContract(
      async (contract) => {
        const bytes =
          await contract.evaluateTransaction(
            "GetAllHashEvents"
          );

        return decodeResult(bytes) || [];
      }
    );

    res.json({
      ok: true,
      fabric: "connected",
      channel: getChannelName(),
      chaincode: CHAINCODE_NAME,
      totalHashEvents: Array.isArray(result)
        ? result.length
        : 0,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      fabric: "disconnected",
      error: error.message,
      channel: getChannelName(),
      chaincode: CHAINCODE_NAME,
      fabricTestNetwork:
        FABRIC_TEST_NETWORK,
    });
  }
});

app.use("/api/hashes", requireAuth);

app.get("/api/hashes", async (_req, res) => {
  try {
    const result = await withContract(
      async (contract) => {
        const bytes =
          await contract.evaluateTransaction(
            "GetAllHashEvents"
          );

        return decodeResult(bytes) || [];
      }
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

app.get(
  "/api/hashes/grouped",
  async (_req, res) => {
    try {
      const result = await withContract(
        async (contract) => {
          const bytes =
            await contract.evaluateTransaction(
              "GetAllHashEvents"
            );

          return decodeResult(bytes) || [];
        }
      );

      res.json(
        groupByCamera(
          Array.isArray(result)
            ? result
            : []
        )
      );
    } catch (error) {
      res.status(500).json({
        error: error.message,
      });
    }
  }
);

app.get(
  "/api/hashes/by-camera/:cameraId",
  async (req, res) => {
    try {
      const cameraId = String(
        req.params.cameraId || ""
      ).trim();

      const result = await withContract(
        async (contract) => {
          const bytes =
            await contract.evaluateTransaction(
              "GetHashesByCamera",
              cameraId
            );

          return decodeResult(bytes) || [];
        }
      );

      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: error.message,
      });
    }
  }
);

app.get(
  "/api/hashes/event/:id",
  async (req, res) => {
    try {
      const id = String(
        req.params.id || ""
      ).trim();

      const result = await withContract(
        async (contract) => {
          const bytes =
            await contract.evaluateTransaction(
              "GetHashEvent",
              id
            );

          return decodeResult(bytes);
        }
      );

      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: error.message,
      });
    }
  }
);

app.post("/api/hashes", async (req, res) => {
  try {
    const payload =
      normalizeHashEvent(req.body);

    const result = await withContract(
      async (contract) => {
        const bytes =
          await contract.submitTransaction(
            "CreateHashEvent",
            payload.id,
            payload.cameraId,
            payload.eventType,
            payload.severity,
            payload.ts,
            payload.primaryHash,
            payload.evidenceHash,
            payload.metadataHash,
            payload.status
          );

        return decodeResult(bytes);
      }
    );

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

app.patch(
  "/api/hashes/:id/status",
  async (req, res) => {
    try {
      const id = String(
        req.params.id || ""
      ).trim();

      const status = String(
        req.body.status || ""
      ).trim();

      if (!status) {
        return res.status(400).json({
          error: "status is required",
        });
      }

      const result = await withContract(
        async (contract) => {
          const bytes =
            await contract.submitTransaction(
              "UpdateHashEventStatus",
              id,
              status
            );

          return decodeResult(bytes);
        }
      );

      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: error.message,
      });
    }
  }
);

app.listen(PORT, () => {
  console.log(
    `BlockVault API running on http://localhost:${PORT}`
  );

  console.log(
    `Fabric path: ${FABRIC_TEST_NETWORK}`
  );

  console.log(
    `Fabric channel: ${getChannelName()}`
  );

  console.log(
    `Fabric chaincode: ${CHAINCODE_NAME}`
  );

  console.log(
    `Fabric certificate: ${CERT_PATH}`
  );

  console.log(
    `Fabric private key: ${KEY_PATH}`
  );

  console.log(
    `Pilot authentication: ${
      isAuthConfigured()
        ? `configured for ${ADMIN_USERNAME}`
        : "NOT CONFIGURED"
    }`
  );
});