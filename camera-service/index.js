"use strict";

require("dotenv").config();

const express = require("express");
const { spawn } = require("child_process");

const app = express();

const PORT = Number(process.env.HTTP_PORT || 5600);
const BOUNDARY = "blockvaultframe";
const MAX_PARSE_BUFFER_BYTES = 12 * 1024 * 1024;
const RECONNECT_DELAY_MS = 1000;
const PTZ_CAMERA_CHANNEL = Number(
  process.env.AXIS_PTZ_CAMERA_CHANNEL || 1
);

app.disable("x-powered-by");

app.use(
  express.json({
    limit: "64kb",
  })
);

function loadCameras() {
  const cameras = [];
  let index = 1;

  while (process.env[`CAM_${index}_ID`]) {
    const id = String(
      process.env[`CAM_${index}_ID`] || ""
    ).trim();

    const url = String(
      process.env[`CAM_${index}_URL`] || ""
    ).trim();

    if (id && url) {
      cameras.push({
        id,
        url,
        user: String(
          process.env[`CAM_${index}_USER`] || "root"
        ),
        pass: String(
          process.env[`CAM_${index}_PASS`] || ""
        ),
      });
    }

    index += 1;
  }

  if (
    cameras.length === 0 &&
    process.env.CAM_URL
  ) {
    cameras.push({
      id: String(
        process.env.CAM_ID || "CAM-01"
      ),

      url: String(
        process.env.CAM_URL
      ),

      user: String(
        process.env.CAM_USER || "root"
      ),

      pass: String(
        process.env.CAM_PASS || ""
      ),
    });
  }

  return cameras;
}

const CAMERAS = loadCameras();

app.use((_req, res, next) => {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  next();
});

function getCameraBaseUrl(camera) {
  try {
    const parsed = new URL(camera.url);

    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}

function clampNumber(
  value,
  min,
  max,
  fallback = 0
) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(
    min,
    Math.min(max, number)
  );
}

function runAxisRequest(
  camera,
  pathAndQuery
) {
  return new Promise(
    (resolve, reject) => {
      const baseUrl =
        getCameraBaseUrl(camera);

      if (!baseUrl) {
        reject(
          new Error(
            "Camera URL is invalid"
          )
        );

        return;
      }

      const targetUrl =
        `${baseUrl}${
          pathAndQuery.startsWith("/")
            ? ""
            : "/"
        }${pathAndQuery}`;

      const curl = spawn(
        "curl",
        [
          "--digest",

          "-u",
          `${camera.user}:${camera.pass}`,

          "-sS",

          "--http1.1",

          "--connect-timeout",
          "6",

          "--max-time",
          "6",

          "-w",
          "\n__BVS_HTTP_STATUS__:%{http_code}",

          targetUrl,
        ]
      );

      let stdout = "";
      let stderr = "";

      curl.stdout.on(
        "data",
        (chunk) => {
          stdout +=
            chunk.toString();
        }
      );

      curl.stderr.on(
        "data",
        (chunk) => {
          stderr +=
            chunk.toString();
        }
      );

      curl.on(
        "error",
        reject
      );

      curl.on(
        "close",
        (code) => {
          const marker =
            "\n__BVS_HTTP_STATUS__:";

          const markerIndex =
            stdout.lastIndexOf(
              marker
            );

          let body = stdout;
          let statusCode = 0;

          if (
            markerIndex !== -1
          ) {
            body =
              stdout.slice(
                0,
                markerIndex
              );

            statusCode =
              Number(
                stdout
                  .slice(
                    markerIndex +
                      marker.length
                  )
                  .trim()
              ) || 0;
          }

          if (code !== 0) {
            reject(
              new Error(
                stderr.trim() ||
                  `Axis request failed with curl code ${code}`
              )
            );

            return;
          }

          resolve({
            statusCode,
            body: body.trim(),
          });
        }
      );
    }
  );
}

async function getPtzCapabilities(
  camera
) {
  try {
    const response =
      await runAxisRequest(
        camera,
        `/axis-cgi/com/ptz.cgi?camera=${PTZ_CAMERA_CHANNEL}&query=position`
      );

    const body = String(
      response.body || ""
    );

    const pan =
      /(^|\n)pan=/i.test(
        body
      );

    const tilt =
      /(^|\n)tilt=/i.test(
        body
      );

    const zoom =
      /(^|\n)zoom=/i.test(
        body
      );

    const supported =
      response.statusCode >=
        200 &&
      response.statusCode <
        300 &&
      (
        pan ||
        tilt ||
        zoom
      );

    const panTilt =
      supported &&
      pan &&
      tilt;

    return {
      supported,

      available:
        supported,

      pan,

      tilt,

      panTilt,

      zoom:
        supported &&
        zoom,

      home:
        supported &&
        (
          pan ||
          tilt
        ),

      stop:
        supported,

      channel:
        PTZ_CAMERA_CHANNEL,
    };
  } catch {
    return {
      supported: false,

      available: false,

      pan: false,

      tilt: false,

      panTilt: false,

      zoom: false,

      home: false,

      stop: false,

      channel:
        PTZ_CAMERA_CHANNEL,
    };
  }
}

function resolvePanTiltCommand(
  body = {}
) {
  const direction =
    String(
      body.direction ||
      ""
    )
      .trim()
      .toLowerCase();

  if (direction) {
    const speed =
      Math.round(
        clampNumber(
          body.speed,
          1,
          100,
          55
        )
      );

    switch (direction) {
      case "up":
        return {
          pan: 0,
          tilt: speed,
          direction,
        };

      case "down":
        return {
          pan: 0,
          tilt: -speed,
          direction,
        };

      case "left":
        return {
          pan: -speed,
          tilt: 0,
          direction,
        };

      case "right":
        return {
          pan: speed,
          tilt: 0,
          direction,
        };

      default:
        throw new Error(
          `Unsupported PTZ direction: ${direction}`
        );
    }
  }

  return {
    pan:
      Math.round(
        clampNumber(
          body.pan,
          -100,
          100,
          0
        )
      ),

    tilt:
      Math.round(
        clampNumber(
          body.tilt,
          -100,
          100,
          0
        )
      ),

    direction:
      "custom",
  };
}

function resolveZoomCommand(
  body = {}
) {
  const direction =
    String(
      body.direction ||
      ""
    )
      .trim()
      .toLowerCase();

  if (direction) {
    const magnitude =
      Math.round(
        clampNumber(
          body.speed,
          1,
          100,
          55
        )
      );

    if (
      direction === "in"
    ) {
      return {
        speed:
          magnitude,

        direction,
      };
    }

    if (
      direction === "out"
    ) {
      return {
        speed:
          -magnitude,

        direction,
      };
    }

    throw new Error(
      `Unsupported zoom direction: ${direction}`
    );
  }

  return {
    speed:
      Math.round(
        clampNumber(
          body.speed,
          -100,
          100,
          0
        )
      ),

    direction:
      "custom",
  };
}

function createRelay(camera) {
  const clients =
    new Set();

  let processHandle =
    null;

  let reconnectTimer =
    null;

  let parserBuffer =
    Buffer.alloc(0);

  let latestFrame =
    null;

  let lastFrameAt =
    0;

  let lastError =
    "";

  let shuttingDown =
    false;

  function clientChunk(
    frame
  ) {
    return Buffer.concat([
      Buffer.from(
        `--${BOUNDARY}\r\n` +
          "Content-Type: image/jpeg\r\n" +
          `Content-Length: ${frame.length}\r\n` +
          `X-BlockVault-Frame-Time: ${Date.now()}\r\n\r\n`
      ),

      frame,

      Buffer.from(
        "\r\n"
      ),
    ]);
  }

  function publishFrame(
    frame
  ) {
    latestFrame =
      frame;

    lastFrameAt =
      Date.now();

    const payload =
      clientChunk(frame);

    for (
      const client
      of clients
    ) {
      if (
        client.closed ||
        client.blocked
      ) {
        continue;
      }

      try {
        const writable =
          client.res.write(
            payload
          );

        if (!writable) {
          client.blocked =
            true;

          client.res.once(
            "drain",
            () => {
              client.blocked =
                false;
            }
          );
        }
      } catch {
        client.closed =
          true;

        clients.delete(
          client
        );
      }
    }
  }

  function parseFrames(
    chunk
  ) {
    parserBuffer =
      Buffer.concat([
        parserBuffer,
        chunk,
      ]);

    while (
      parserBuffer.length >
      0
    ) {
      const start =
        parserBuffer.indexOf(
          Buffer.from([
            0xff,
            0xd8,
          ])
        );

      if (
        start === -1
      ) {
        parserBuffer =
          parserBuffer.slice(
            Math.max(
              0,
              parserBuffer.length -
                1
            )
          );

        return;
      }

      if (start > 0) {
        parserBuffer =
          parserBuffer.slice(
            start
          );
      }

      const end =
        parserBuffer.indexOf(
          Buffer.from([
            0xff,
            0xd9,
          ]),
          2
        );

      if (
        end === -1
      ) {
        break;
      }

      const frame =
        parserBuffer.slice(
          0,
          end + 2
        );

      parserBuffer =
        parserBuffer.slice(
          end + 2
        );

      publishFrame(
        frame
      );
    }

    if (
      parserBuffer.length >
      MAX_PARSE_BUFFER_BYTES
    ) {
      lastError =
        "MJPEG parser buffer exceeded safety limit; resetting";

      console.error(
        `[${camera.id}] ${lastError}`
      );

      parserBuffer =
        Buffer.alloc(0);
    }
  }

  function scheduleReconnect() {
    if (
      shuttingDown ||
      reconnectTimer
    ) {
      return;
    }

    reconnectTimer =
      setTimeout(
        () => {
          reconnectTimer =
            null;

          start();
        },
        RECONNECT_DELAY_MS
      );
  }

  function start() {
    if (
      shuttingDown ||
      processHandle
    ) {
      return;
    }

    console.log(
      `[${camera.id}] Starting single low-latency Axis ingest`
    );

    const curl =
      spawn(
        "curl",
        [
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
        ]
      );

    processHandle =
      curl;

    parserBuffer =
      Buffer.alloc(0);

    lastError =
      "";

    curl.stdout.on(
      "data",
      parseFrames
    );

    curl.stderr.on(
      "data",
      (data) => {
        const message =
          data
            .toString()
            .trim();

        if (!message) {
          return;
        }

        lastError =
          message;

        console.error(
          `[${camera.id}] Axis ingest error: ${message}`
        );
      }
    );

    curl.on(
      "error",
      (error) => {
        lastError =
          error.message;

        console.error(
          `[${camera.id}] Unable to start curl: ${error.message}`
        );
      }
    );

    curl.on(
      "close",
      (
        code,
        signal
      ) => {
        if (
          processHandle ===
          curl
        ) {
          processHandle =
            null;
        }

        parserBuffer =
          Buffer.alloc(0);

        if (
          !shuttingDown
        ) {
          console.error(
            `[${camera.id}] Axis ingest stopped ` +
              `(code=${code}, signal=${
                signal ||
                "none"
              }); reconnecting`
          );

          scheduleReconnect();
        }
      }
    );
  }

  function addClient(
    req,
    res
  ) {
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

    res.setHeader(
      "Pragma",
      "no-cache"
    );

    res.setHeader(
      "Expires",
      "0"
    );

    res.setHeader(
      "Connection",
      "keep-alive"
    );

    res.setHeader(
      "X-Accel-Buffering",
      "no"
    );

    res.setHeader(
      "X-Content-Type-Options",
      "nosniff"
    );

    res.setHeader(
      "X-BlockVault-Camera",
      camera.id
    );

    req.socket
      ?.setNoDelay
      ?.(
        true
      );

    res.socket
      ?.setNoDelay
      ?.(
        true
      );

    res.flushHeaders();

    const client = {
      res,
      blocked: false,
      closed: false,
    };

    clients.add(
      client
    );

    start();

    if (latestFrame) {
      try {
        const writable =
          res.write(
            clientChunk(
              latestFrame
            )
          );

        if (!writable) {
          client.blocked =
            true;

          res.once(
            "drain",
            () => {
              client.blocked =
                false;
            }
          );
        }
      } catch {
        client.closed =
          true;

        clients.delete(
          client
        );
      }
    }

    const removeClient =
      () => {
        if (
          client.closed
        ) {
          return;
        }

        client.closed =
          true;

        clients.delete(
          client
        );
      };

    req.on(
      "close",
      removeClient
    );

    res.on(
      "close",
      removeClient
    );

    res.on(
      "error",
      removeClient
    );
  }

  function status() {
    return {
      id:
        camera.id,

      configured:
        Boolean(
          camera.url
        ),

      ingestRunning:
        Boolean(
          processHandle
        ),

      connectedClients:
        clients.size,

      hasFrame:
        Boolean(
          latestFrame
        ),

      lastFrameAgeMs:
        lastFrameAt
          ? Date.now() -
            lastFrameAt
          : null,

      lastError:
        lastError ||
        undefined,
    };
  }

  function stop() {
    shuttingDown =
      true;

    if (
      reconnectTimer
    ) {
      clearTimeout(
        reconnectTimer
      );

      reconnectTimer =
        null;
    }

    if (
      processHandle &&
      !processHandle.killed
    ) {
      processHandle.kill(
        "SIGTERM"
      );
    }

    processHandle =
      null;

    for (
      const client
      of clients
    ) {
      client.closed =
        true;

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

const RELAYS =
  new Map(
    CAMERAS.map(
      (camera) => [
        camera.id,

        {
          camera,

          relay:
            createRelay(
              camera
            ),
        },
      ]
    )
  );

function getEntry(
  cameraId
) {
  return RELAYS.get(
    String(
      cameraId ||
      ""
    )
  );
}

app.options(
  "*",
  (
    _req,
    res
  ) => {
    res.sendStatus(
      204
    );
  }
);

app.get(
  "/health",
  (
    _req,
    res
  ) => {
    const cameras =
      Array.from(
        RELAYS.values()
      ).map(
        ({
          relay,
        }) =>
          relay.status()
      );

    const allHealthy =
      cameras.length >
        0 &&
      cameras.every(
        (camera) =>
          camera.ingestRunning &&
          camera.hasFrame &&
          typeof camera.lastFrameAgeMs ===
            "number" &&
          camera.lastFrameAgeMs <
            5000
      );

    res
      .status(
        allHealthy
          ? 200
          : 503
      )
      .json({
        ok:
          allHealthy,

        configuredCameraCount:
          CAMERAS.length,

        cameras,
      });
  }
);

app.get(
  "/config",
  (
    _req,
    res
  ) => {
    res.json({
      port:
        PORT,

      cameras:
        CAMERAS.map(
          (camera) => ({
            id:
              camera.id,

            configured:
              Boolean(
                camera.url
              ),
          })
        ),
    });
  }
);

app.get(
  "/camera/:cameraId",
  (
    req,
    res
  ) => {
    const cameraId =
      String(
        req.params
          .cameraId ||
          ""
      );

    const entry =
      getEntry(
        cameraId
      );

    if (!entry) {
      return res
        .status(404)
        .json({
          error:
            "Camera not configured",

          cameraId,
        });
    }

    entry.relay.addClient(
      req,
      res
    );
  }
);

app.get(
  "/camera/:cameraId/capabilities",
  async (
    req,
    res
  ) => {
    const cameraId =
      String(
        req.params
          .cameraId ||
          ""
      );

    const entry =
      getEntry(
        cameraId
      );

    if (!entry) {
      return res
        .status(404)
        .json({
          error:
            "Camera not configured",

          cameraId,
        });
    }

    const ptz =
      await getPtzCapabilities(
        entry.camera
      );

    return res.json({
      cameraId,

      ptz,
    });
  }
);

app.post(
  "/camera/:cameraId/ptz/move",
  async (
    req,
    res
  ) => {
    const cameraId =
      String(
        req.params
          .cameraId ||
          ""
      );

    const entry =
      getEntry(
        cameraId
      );

    if (!entry) {
      return res
        .status(404)
        .json({
          error:
            "Camera not configured",

          cameraId,
        });
    }

    let command;

    try {
      command =
        resolvePanTiltCommand(
          req.body ||
          {}
        );
    } catch (error) {
      return res
        .status(400)
        .json({
          error:
            error.message,

          cameraId,
        });
    }

    try {
      const response =
        await runAxisRequest(
          entry.camera,

          `/axis-cgi/com/ptz.cgi?camera=${PTZ_CAMERA_CHANNEL}&continuouspantiltmove=${command.pan},${command.tilt}`
        );

      if (
        response.statusCode <
          200 ||
        response.statusCode >=
          300
      ) {
        return res
          .status(502)
          .json({
            error:
              "Axis PTZ move request failed",

            cameraId,

            statusCode:
              response.statusCode,

            details:
              response.body ||
              undefined,
          });
      }

      return res.json({
        ok:
          true,

        cameraId,

        pan:
          command.pan,

        tilt:
          command.tilt,

        direction:
          command.direction,
      });
    } catch (error) {
      return res
        .status(502)
        .json({
          error:
            error.message ||
            "Unable to move camera",

          cameraId,
        });
    }
  }
);

app.post(
  "/camera/:cameraId/ptz/zoom",
  async (
    req,
    res
  ) => {
    const cameraId =
      String(
        req.params
          .cameraId ||
          ""
      );

    const entry =
      getEntry(
        cameraId
      );

    if (!entry) {
      return res
        .status(404)
        .json({
          error:
            "Camera not configured",

          cameraId,
        });
    }

    let command;

    try {
      command =
        resolveZoomCommand(
          req.body ||
          {}
        );
    } catch (error) {
      return res
        .status(400)
        .json({
          error:
            error.message,

          cameraId,
        });
    }

    try {
      const response =
        await runAxisRequest(
          entry.camera,

          `/axis-cgi/com/ptz.cgi?camera=${PTZ_CAMERA_CHANNEL}&continuouszoommove=${command.speed}`
        );

      if (
        response.statusCode <
          200 ||
        response.statusCode >=
          300
      ) {
        return res
          .status(502)
          .json({
            error:
              "Axis PTZ zoom request failed",

            cameraId,

            statusCode:
              response.statusCode,

            details:
              response.body ||
              undefined,
          });
      }

      return res.json({
        ok:
          true,

        cameraId,

        speed:
          command.speed,

        direction:
          command.direction,
      });
    } catch (error) {
      return res
        .status(502)
        .json({
          error:
            error.message ||
            "Unable to zoom camera",

          cameraId,
        });
    }
  }
);

app.post(
  "/camera/:cameraId/ptz/stop",
  async (
    req,
    res
  ) => {
    const cameraId =
      String(
        req.params
          .cameraId ||
          ""
      );

    const entry =
      getEntry(
        cameraId
      );

    if (!entry) {
      return res
        .status(404)
        .json({
          error:
            "Camera not configured",

          cameraId,
        });
    }

    try {
      const [
        moveResponse,
        zoomResponse,
      ] =
        await Promise.all([
          runAxisRequest(
            entry.camera,

            `/axis-cgi/com/ptz.cgi?camera=${PTZ_CAMERA_CHANNEL}&continuouspantiltmove=0,0`
          ),

          runAxisRequest(
            entry.camera,

            `/axis-cgi/com/ptz.cgi?camera=${PTZ_CAMERA_CHANNEL}&continuouszoommove=0`
          ),
        ]);

      const failed =
        [
          moveResponse,
          zoomResponse,
        ].find(
          (
            response
          ) =>
            response.statusCode <
              200 ||
            response.statusCode >=
              300
        );

      if (failed) {
        return res
          .status(502)
          .json({
            error:
              "Axis PTZ stop request failed",

            cameraId,

            statusCode:
              failed.statusCode,

            details:
              failed.body ||
              undefined,
          });
      }

      return res.json({
        ok:
          true,

        cameraId,
      });
    } catch (error) {
      return res
        .status(502)
        .json({
          error:
            error.message ||
            "Unable to stop camera movement",

          cameraId,
        });
    }
  }
);

app.post(
  "/camera/:cameraId/ptz/home",
  async (
    req,
    res
  ) => {
    const cameraId =
      String(
        req.params
          .cameraId ||
          ""
      );

    const entry =
      getEntry(
        cameraId
      );

    if (!entry) {
      return res
        .status(404)
        .json({
          error:
            "Camera not configured",

          cameraId,
        });
    }

    try {
      const response =
        await runAxisRequest(
          entry.camera,

          `/axis-cgi/com/ptz.cgi?camera=${PTZ_CAMERA_CHANNEL}&move=home`
        );

      if (
        response.statusCode <
          200 ||
        response.statusCode >=
          300
      ) {
        return res
          .status(502)
          .json({
            error:
              "Axis PTZ home request failed",

            cameraId,

            statusCode:
              response.statusCode,

            details:
              response.body ||
              undefined,
          });
      }

      return res.json({
        ok:
          true,

        cameraId,
      });
    } catch (error) {
      return res
        .status(502)
        .json({
          error:
            error.message ||
            "Unable to move camera home",

          cameraId,
        });
    }
  }
);

const server =
  app.listen(
    PORT,
    "0.0.0.0",
    () => {
      console.log(
        `BlockVault camera-service running on http://localhost:${PORT}`
      );

      console.log(
        `Configured cameras: ${
          CAMERAS.length
            ? CAMERAS
                .map(
                  (
                    camera
                  ) =>
                    camera.id
                )
                .join(
                  ", "
                )
            : "none"
        }`
      );

      console.log(
        "PTZ API ready: /camera/:cameraId/capabilities and /camera/:cameraId/ptz/*"
      );

      for (
        const {
          relay,
        }
        of RELAYS.values()
      ) {
        relay.start();
      }
    }
  );

function shutdown(
  signal
) {
  console.log(
    `Received ${signal}; shutting down camera relays`
  );

  for (
    const {
      relay,
    }
    of RELAYS.values()
  ) {
    relay.stop();
  }

  server.close(
    () => {
      process.exit(0);
    }
  );

  setTimeout(
    () => {
      process.exit(1);
    },
    5000
  ).unref();
}

process.on(
  "SIGINT",
  () => {
    shutdown(
      "SIGINT"
    );
  }
);

process.on(
  "SIGTERM",
  () => {
    shutdown(
      "SIGTERM"
    );
  }
);