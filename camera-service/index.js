"use strict";

require("dotenv").config();

const express = require("express");
const { spawn } = require("child_process");

const app = express();

const PORT = Number(process.env.HTTP_PORT || 5600);
const BOUNDARY = "blockvaultframe";
const MAX_PARSE_BUFFER_BYTES = 12 * 1024 * 1024;
const RECONNECT_DELAY_MS = 1000;

app.disable("x-powered-by");

function loadCameras() {
  const cameras = [];
  let index = 1;

  while (process.env[`CAM_${index}_ID`]) {
    const id = String(process.env[`CAM_${index}_ID`] || "").trim();
    const url = String(process.env[`CAM_${index}_URL`] || "").trim();

    if (id && url) {
      cameras.push({
        id,
        url,
        user: String(process.env[`CAM_${index}_USER`] || "root"),
        pass: String(process.env[`CAM_${index}_PASS`] || ""),
      });
    }

    index += 1;
  }

  if (cameras.length === 0 && process.env.CAM_URL) {
    cameras.push({
      id: String(process.env.CAM_ID || "CAM-01"),
      url: String(process.env.CAM_URL),
      user: String(process.env.CAM_USER || "root"),
      pass: String(process.env.CAM_PASS || ""),
    });
  }

  return cameras;
}

const CAMERAS = loadCameras();

app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

function createRelay(camera) {
  const clients = new Set();

  let processHandle = null;
  let reconnectTimer = null;
  let parserBuffer = Buffer.alloc(0);
  let latestFrame = null;
  let lastFrameAt = 0;
  let lastError = "";
  let shuttingDown = false;

  function clientChunk(frame) {
    return Buffer.concat([
      Buffer.from(
        `--${BOUNDARY}\r\n` +
          "Content-Type: image/jpeg\r\n" +
          `Content-Length: ${frame.length}\r\n` +
          `X-BlockVault-Frame-Time: ${Date.now()}\r\n\r\n`
      ),
      frame,
      Buffer.from("\r\n"),
    ]);
  }

  function publishFrame(frame) {
    latestFrame = frame;
    lastFrameAt = Date.now();

    const payload = clientChunk(frame);

    for (const client of clients) {
      if (client.closed || client.blocked) {
        continue;
      }

      try {
        const writable = client.res.write(payload);

        if (!writable) {
          client.blocked = true;

          client.res.once("drain", () => {
            client.blocked = false;
          });
        }
      } catch {
        client.closed = true;
        clients.delete(client);
      }
    }
  }

  function parseFrames(chunk) {
    parserBuffer = Buffer.concat([parserBuffer, chunk]);

    while (parserBuffer.length > 0) {
      const start = parserBuffer.indexOf(Buffer.from([0xff, 0xd8]));

      if (start === -1) {
        parserBuffer = parserBuffer.slice(
          Math.max(0, parserBuffer.length - 1)
        );
        return;
      }

      if (start > 0) {
        parserBuffer = parserBuffer.slice(start);
      }

      const end = parserBuffer.indexOf(
        Buffer.from([0xff, 0xd9]),
        2
      );

      if (end === -1) {
        break;
      }

      const frame = parserBuffer.slice(0, end + 2);

      parserBuffer = parserBuffer.slice(end + 2);

      publishFrame(frame);
    }

    if (parserBuffer.length > MAX_PARSE_BUFFER_BYTES) {
      lastError =
        "MJPEG parser buffer exceeded safety limit; resetting";

      console.error(`[${camera.id}] ${lastError}`);

      parserBuffer = Buffer.alloc(0);
    }
  }

  function scheduleReconnect() {
    if (shuttingDown || reconnectTimer) {
      return;
    }

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      start();
    }, RECONNECT_DELAY_MS);
  }

  function start() {
    if (shuttingDown || processHandle) {
      return;
    }

    console.log(
      `[${camera.id}] Starting single low-latency Axis ingest`
    );

    const curl = spawn("curl", [
      "--digest",
      "-u",
      `${camera.user}:${camera.pass}`,
      "-sS",
      "--no-buffer",
      "--http1.1",
      "--connect-timeout",
      "6",
      "--keepalive-time",
      "10",
      camera.url,
    ]);

    processHandle = curl;
    parserBuffer = Buffer.alloc(0);
    lastError = "";

    curl.stdout.on("data", parseFrames);

    curl.stderr.on("data", (data) => {
      const message = data.toString().trim();

      if (!message) {
        return;
      }

      lastError = message;

      console.error(
        `[${camera.id}] Axis ingest error: ${message}`
      );
    });

    curl.on("error", (error) => {
      lastError = error.message;

      console.error(
        `[${camera.id}] Unable to start curl: ${error.message}`
      );
    });

    curl.on("close", (code, signal) => {
      if (processHandle === curl) {
        processHandle = null;
      }

      parserBuffer = Buffer.alloc(0);

      if (!shuttingDown) {
        console.error(
          `[${camera.id}] Axis ingest stopped ` +
            `(code=${code}, signal=${signal || "none"}); reconnecting`
        );

        scheduleReconnect();
      }
    });
  }

  function addClient(req, res) {
    res.status(200);

    res.setHeader(
      "Content-Type",
      `multipart/x-mixed-replace; boundary=${BOUNDARY}`
    );

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, " +
        "proxy-revalidate, max-age=0, no-transform"
    );

    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-BlockVault-Camera", camera.id);

    req.socket?.setNoDelay?.(true);
    res.socket?.setNoDelay?.(true);

    res.flushHeaders();

    const client = {
      res,
      blocked: false,
      closed: false,
    };

    clients.add(client);

    start();

    if (latestFrame) {
      try {
        const writable = res.write(
          clientChunk(latestFrame)
        );

        if (!writable) {
          client.blocked = true;

          res.once("drain", () => {
            client.blocked = false;
          });
        }
      } catch {
        client.closed = true;
        clients.delete(client);
      }
    }

    const removeClient = () => {
      if (client.closed) {
        return;
      }

      client.closed = true;
      clients.delete(client);
    };

    req.on("close", removeClient);
    res.on("close", removeClient);
    res.on("error", removeClient);
  }

  function status() {
    return {
      id: camera.id,
      configured: Boolean(camera.url),
      ingestRunning: Boolean(processHandle),
      connectedClients: clients.size,
      hasFrame: Boolean(latestFrame),
      lastFrameAgeMs: lastFrameAt
        ? Date.now() - lastFrameAt
        : null,
      lastError: lastError || undefined,
    };
  }

  function stop() {
    shuttingDown = true;

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (processHandle && !processHandle.killed) {
      processHandle.kill("SIGTERM");
    }

    processHandle = null;

    for (const client of clients) {
      client.closed = true;
      client.res.end();
    }

    clients.clear();
  }

  return {
    addClient,
    start,
    status,
    stop,
  };
}

const RELAYS = new Map(
  CAMERAS.map((camera) => [
    camera.id,
    {
      camera,
      relay: createRelay(camera),
    },
  ])
);

app.options("*", (_req, res) => {
  res.sendStatus(204);
});

app.get("/health", (_req, res) => {
  const cameras = Array.from(
    RELAYS.values()
  ).map(({ relay }) => relay.status());

  const allHealthy =
    cameras.length > 0 &&
    cameras.every(
      (camera) =>
        camera.ingestRunning &&
        camera.hasFrame &&
        typeof camera.lastFrameAgeMs === "number" &&
        camera.lastFrameAgeMs < 5000
    );

  res.status(allHealthy ? 200 : 503).json({
    ok: allHealthy,
    configuredCameraCount: CAMERAS.length,
    cameras,
  });
});

app.get("/config", (_req, res) => {
  res.json({
    port: PORT,
    cameras: CAMERAS.map((camera) => ({
      id: camera.id,
      configured: Boolean(camera.url),
    })),
  });
});

app.get("/camera/:cameraId", (req, res) => {
  const cameraId = String(
    req.params.cameraId || ""
  );

  const entry = RELAYS.get(cameraId);

  if (!entry) {
    return res.status(404).json({
      error: "Camera not configured",
      cameraId,
    });
  }

  entry.relay.addClient(req, res);
});

const server = app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `BlockVault camera-service running on http://localhost:${PORT}`
    );

    console.log(
      `Configured cameras: ${
        CAMERAS.length
          ? CAMERAS.map((camera) => camera.id).join(", ")
          : "none"
      }`
    );

    for (const { relay } of RELAYS.values()) {
      relay.start();
    }
  }
);

function shutdown(signal) {
  console.log(
    `Received ${signal}; shutting down camera relays`
  );

  for (const { relay } of RELAYS.values()) {
    relay.stop();
  }

  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 5000).unref();
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});