export function createTamperDetector({
  cameraId = "CAM-01",
  darknessThreshold = 38,
  flatnessThreshold = 7,
  occlusionRatioThreshold = 0.9,
  lowMotionThreshold = 0.025,
  cooldownMs = 5000,
  warmupFrames = 12,
  tamperFramesRequired = 3,
  clearFramesRequired = 6,
} = {}) {
  let lastTriggerAt = 0;
  let frameCount = 0;
  let tamperStreak = 0;
  let clearStreak = 0;
  let tamperLatched = false;

  function downsample(imageData, width, height, targetWidth = 64, targetHeight = 36) {
    const src = imageData.data;
    const gray = new Float32Array(targetWidth * targetHeight);

    const stepX = width / targetWidth;
    const stepY = height / targetHeight;

    for (let ty = 0; ty < targetHeight; ty++) {
      for (let tx = 0; tx < targetWidth; tx++) {
        const sx = Math.min(width - 1, Math.floor(tx * stepX));
        const sy = Math.min(height - 1, Math.floor(ty * stepY));
        const idx = (sy * width + sx) * 4;

        const r = src[idx];
        const g = src[idx + 1];
        const b = src[idx + 2];

        gray[ty * targetWidth + tx] = 0.299 * r + 0.587 * g + 0.114 * b;
      }
    }

    return { gray, targetWidth, targetHeight };
  }

  function computeStats(gray) {
    const len = gray.length;
    let sum = 0;
    let darkPixels = 0;

    for (let i = 0; i < len; i++) {
      const v = gray[i];
      sum += v;
      if (v < 45) darkPixels += 1;
    }

    const brightness = sum / len;

    let varianceSum = 0;
    for (let i = 0; i < len; i++) {
      const diff = gray[i] - brightness;
      varianceSum += diff * diff;
    }

    const flatness = Math.sqrt(varianceSum / len);
    const darkRatio = darkPixels / len;

    let motionAccum = 0;
    let motionCount = 0;
    const width = 64;
    const height = 36;

    for (let y = 1; y < height; y += 2) {
      for (let x = 1; x < width; x += 2) {
        const idx = y * width + x;
        const left = idx - 1;
        const up = idx - width;
        motionAccum += Math.abs(gray[idx] - gray[left]);
        motionAccum += Math.abs(gray[idx] - gray[up]);
        motionCount += 2;
      }
    }

    const motionEstimate = motionCount > 0 ? motionAccum / motionCount / 255 : 0;

    return {
      brightness,
      flatness,
      darkRatio,
      motionEstimate,
    };
  }

  function buildEvent({ brightness, flatness, darkRatio, reason }) {
    const now = Date.now();

    return {
      eventId: `evt_${cameraId.toLowerCase().replace(/[^a-z0-9]/g, "")}_${now}`,
      cameraId,
      ts: new Date(now).toISOString(),
      eventType: "TAMPER",
      severity: "WARNING",
      evidenceHash: "pending",
      metadataHash: "pending",
      meta: {
        motionScore: 0,
        ema: 0,
        burst: 0,
        tamperDetected: true,
        movedDetected: false,
        baselineReady: false,
        source: "webcam",
        brightness: Number(brightness.toFixed(2)),
        flatness: Number(flatness.toFixed(2)),
        darkRatio: Number(darkRatio.toFixed(4)),
        tamperReason: reason,
      },
    };
  }

  function processFrame(imageData, width, height) {
    frameCount += 1;

    const { gray } = downsample(imageData, width, height);
    const { brightness, flatness, darkRatio, motionEstimate } = computeStats(gray);

    let reason = "CLEAR";

    const isDark = brightness <= darknessThreshold;
    const isFlat = flatness <= flatnessThreshold;
    const isOccluded = darkRatio >= occlusionRatioThreshold;
    const isLowMotion = motionEstimate <= lowMotionThreshold;

    const suspicious = isLowMotion && (
      (isDark && isOccluded) ||
      (isDark && isFlat && darkRatio >= 0.82) ||
      (isFlat && isOccluded)
    );

    if (suspicious) {
      if (isDark && isOccluded) reason = "OCCLUDED";
      else if (isDark && isFlat) reason = "LOW_VISIBILITY";
      else if (isFlat && isOccluded) reason = "COVERED";
      tamperStreak += 1;
      clearStreak = 0;
    } else {
      clearStreak += 1;
      tamperStreak = 0;

      if (clearStreak >= clearFramesRequired) {
        tamperLatched = false;
      }
    }

    const warm = frameCount > warmupFrames;
    const cooldownPassed = Date.now() - lastTriggerAt > cooldownMs;

    let event = null;

    if (!tamperLatched && warm && cooldownPassed && tamperStreak >= tamperFramesRequired) {
      tamperLatched = true;
      lastTriggerAt = Date.now();
      event = buildEvent({ brightness, flatness, darkRatio, reason });
    }

    return {
      triggered: Boolean(event),
      event,
      brightness,
      flatness,
      darkRatio,
      reason,
      motionEstimate,
      latched: tamperLatched,
    };
  }

  return {
    processFrame,
  };
}