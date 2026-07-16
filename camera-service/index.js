"use strict";

require("dotenv").config();

const express = require("express");
const { spawn } = require("child_process");

const app = express();
const PORT = Number(process.env.HTTP_PORT || 5600);

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

function findCamera(cameraId) {
  return CAMERAS.find((camera) => camera.id === cameraId);
}

function checkCamera(camera) {
  return new Promise((resolve) => {
    const curl = spawn("curl", [
      "--digest",
      "-u",
      `${camera.user}:${camera.pass}`,
      "-sS",
      "--max-time",
      "6",
      "-o",
      "/dev/null",
      "-w",
      "%{http_code}",
      camera.url,
    ]);

    let statusCode = "";
    let errorText = "";

    curl.stdout.on("data", (data) => {
      statusCode += data.toString();
    });

    curl.stderr.on("data", (data) => {
      errorText += data.toString();
    });

    curl.on("close", () => {
      resolve({
        id: camera.id,
        ok: statusCode.trim() === "200",
        statusCode: statusCode.trim() || "unreachable",
        error: errorText.trim() || undefined,
      });
    });
  });
}

app.get("/health", async (_req, res) => {
  const checks = await Promise.all(CAMERAS.map(checkCamera));
  const allOk = checks.length > 0 && checks.every((check) => check.ok);

  res.status(allOk ? 200 : 503).json({
    ok: allOk,
    configuredCameraCount: CAMERAS.length,
    cameras: checks,
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

function streamCamera(camera, req, res) {
  const curl = spawn("curl", [
    "--digest",
    "-u",
    `${camera.user}:${camera.pass}`,
    "-sS",
    "--no-buffer",
    camera.url,
  ]);

  res.status(200);
  res.setHeader(
    "Content-Type",
    "multipart/x-mixed-replace; boundary=myboundary"
  );
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-BlockVault-Camera", camera.id);

  curl.stdout.pipe(res);

  curl.stderr.on("data", (data) => {
    console.error(`[${camera.id}] Axis stream error: ${data.toString().trim()}`);
  });

  const stop = () => {
    if (!curl.killed) curl.kill("SIGTERM");
  };

  req.on("close", stop);
  res.on("close", stop);

  curl.on("error", (error) => {
    console.error(`[${camera.id}] Unable to start curl:`, error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Unable to start Axis stream" });
    } else {
      res.end();
    }
  });
}

app.get("/camera/:cameraId", (req, res) => {
  const camera = findCamera(String(req.params.cameraId || ""));

  if (!camera) {
    return res.status(404).json({
      error: "Camera not configured",
      cameraId: req.params.cameraId,
    });
  }

  streamCamera(camera, req, res);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`BlockVault camera-service running on http://localhost:${PORT}`);
  console.log(
    `Configured cameras: ${CAMERAS.length ? CAMERAS.map((camera) => camera.id).join(", ") : "none"}`
  );
});
