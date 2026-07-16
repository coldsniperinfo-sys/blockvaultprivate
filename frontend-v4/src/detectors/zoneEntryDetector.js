export function createZoneEntryDetector({
    cameraId = "CAM-01",
    threshold = 0.12,
    clearThreshold = 0.035,
    cooldownMs = 2200,
    settleFrames = 10,
    clearFramesRequired = 2,
    entryFramesRequired = 1,
  } = {}) {
    let zone = null;
    let previousRegion = null;
    let occupied = false;
    let lastTriggerAt = 0;

    let framesSinceZoneSet = 0;
    let clearStreak = 0;
    let entryStreak = 0;
    let armed = false;

    function resetState() {
      previousRegion = null;
      occupied = false;
      framesSinceZoneSet = 0;
      clearStreak = 0;
      entryStreak = 0;
      armed = false;
    }

    function setZone(nextZone) {
      zone = nextZone;
      resetState();
    }

    function clearZone() {
      zone = null;
      resetState();
    }

    function getZone() {
      return zone;
    }

    function cropRegionToGrayscale(imageData, width, height, region, targetWidth = 56, targetHeight = 56) {
      const src = imageData.data;

      const x0 = Math.max(0, Math.floor(region.x * width));
      const y0 = Math.max(0, Math.floor(region.y * height));
      const x1 = Math.min(width, Math.floor((region.x + region.width) * width));
      const y1 = Math.min(height, Math.floor((region.y + region.height) * height));

      const cropWidth = Math.max(1, x1 - x0);
      const cropHeight = Math.max(1, y1 - y0);

      const result = new Float32Array(targetWidth * targetHeight);

      const stepX = cropWidth / targetWidth;
      const stepY = cropHeight / targetHeight;

      for (let ty = 0; ty < targetHeight; ty++) {
        for (let tx = 0; tx < targetWidth; tx++) {
          const sx = Math.min(width - 1, x0 + Math.floor(tx * stepX));
          const sy = Math.min(height - 1, y0 + Math.floor(ty * stepY));
          const idx = (sy * width + sx) * 4;

          const r = src[idx];
          const g = src[idx + 1];
          const b = src[idx + 2];

          result[ty * targetWidth + tx] = 0.299 * r + 0.587 * g + 0.114 * b;
        }
      }

      return {
        data: result,
        width: targetWidth,
        height: targetHeight,
      };
    }

    function computeMotionScore(current, previous) {
      if (!previous || current.data.length !== previous.data.length) {
        return 0;
      }

      let changed = 0;
      const len = current.data.length;

      for (let i = 0; i < len; i++) {
        const diff = Math.abs(current.data[i] - previous.data[i]);
        if (diff > 16) changed++;
      }

      return changed / len;
    }

    function buildEvent({ zoneMotionScore }) {
      const now = Date.now();

      return {
        eventId: `evt_${cameraId.toLowerCase().replace(/[^a-z0-9]/g, "")}_${now}`,
        cameraId,
        ts: new Date(now).toISOString(),
        eventType: "ZONE_ENTRY",
        severity: zoneMotionScore >= 0.22 ? "HIGH" : "WARNING",
        evidenceHash: "pending",
        metadataHash: "pending",
        meta: {
          motionScore: Number(zoneMotionScore.toFixed(4)),
          ema: Number(zoneMotionScore.toFixed(4)),
          burst: Number(zoneMotionScore.toFixed(4)),
          tamperDetected: false,
          movedDetected: false,
          baselineReady: false,
          source: "webcam",
          zoneEntryDetected: true,
          zoneId: zone?.id || "zone-1",
          zoneLabel: zone?.label || "Restricted Zone",
          zoneMotionScore: Number(zoneMotionScore.toFixed(4)),
          zoneThreshold: threshold,
          zoneClearThreshold: clearThreshold,
          zone: zone
            ? {
                x: Number(zone.x.toFixed(4)),
                y: Number(zone.y.toFixed(4)),
                width: Number(zone.width.toFixed(4)),
                height: Number(zone.height.toFixed(4)),
              }
            : null,
        },
      };
    }

    function processFrame(imageData, width, height) {
      if (!zone) {
        return {
          zoneReady: false,
          zoneMotionScore: 0,
          zoneOccupied: false,
          entryDetected: false,
          triggered: false,
          event: null,
        };
      }

      const currentRegion = cropRegionToGrayscale(imageData, width, height, zone);
      const zoneMotionScore = computeMotionScore(currentRegion, previousRegion);
      previousRegion = currentRegion;
      framesSinceZoneSet += 1;

      if (framesSinceZoneSet <= settleFrames) {
        return {
          zoneReady: false,
          zoneMotionScore,
          zoneOccupied: false,
          entryDetected: false,
          triggered: false,
          event: null,
        };
      }

      if (!armed) {
        if (zoneMotionScore <= clearThreshold) {
          clearStreak += 1;
        } else {
          clearStreak = 0;
        }

        if (clearStreak >= clearFramesRequired) {
          armed = true;
          clearStreak = 0;
        }

        return {
          zoneReady: armed,
          zoneMotionScore,
          zoneOccupied: false,
          entryDetected: false,
          triggered: false,
          event: null,
        };
      }

      const now = Date.now();
      const cooldownPassed = now - lastTriggerAt > cooldownMs;

      let entryDetected = false;
      let event = null;

      if (!occupied) {
        if (zoneMotionScore >= threshold) {
          entryStreak += 1;
        } else {
          entryStreak = 0;
        }

        if (entryStreak >= entryFramesRequired) {
          occupied = true;
          entryDetected = true;
          entryStreak = 0;

          if (cooldownPassed) {
            lastTriggerAt = now;
            event = buildEvent({ zoneMotionScore });
          }
        }
      } else {
        if (zoneMotionScore <= clearThreshold) {
          clearStreak += 1;
        } else {
          clearStreak = 0;
        }

        if (clearStreak >= clearFramesRequired) {
          occupied = false;
          clearStreak = 0;
        }
      }

      return {
        zoneReady: true,
        zoneMotionScore,
        zoneOccupied: occupied,
        entryDetected,
        triggered: Boolean(event),
        event,
      };
    }

    return {
      processFrame,
      setZone,
      clearZone,
      getZone,
    };
  }
