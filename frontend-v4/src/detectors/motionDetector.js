export function createMotionDetector({
  cameraId = "CAM-01",
  threshold = 0.24,
  emaAlpha = 0.2,
  cooldownMs = 5000,
  hotFramesRequired = 3,
} = {}) {
  let previousGray = null;
  let ema = 0;
  let lastTriggerAt = 0;
  let hotFrameStreak = 0;

  function downsampleToGrayscale(imageData, width, height, targetWidth = 64, targetHeight = 36) {
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

    return {
      gray,
      width: targetWidth,
      height: targetHeight,
    };
  }

  function computeMotionScore(currentGray, previousGrayFrame) {
    if (!previousGrayFrame || currentGray.length !== previousGrayFrame.length) {
      return 0;
    }

    let changed = 0;
    const len = currentGray.length;

    for (let i = 0; i < len; i++) {
      const diff = Math.abs(currentGray[i] - previousGrayFrame[i]);
      if (diff > 22) changed += 1;
    }

    return changed / len;
  }

  function buildEvent({ motionScore, emaValue }) {
    const now = Date.now();

    return {
      eventId: `evt_${cameraId.toLowerCase().replace(/[^a-z0-9]/g, "")}_${now}`,
      cameraId,
      ts: new Date(now).toISOString(),
      eventType: "MOTION",
      severity: motionScore >= threshold * 1.35 ? "HIGH" : "WARNING",
      evidenceHash: "pending",
      metadataHash: "pending",
      meta: {
        motionScore: Number(motionScore.toFixed(4)),
        ema: Number(emaValue.toFixed(4)),
        burst: Number(motionScore.toFixed(4)),
        tamperDetected: false,
        movedDetected: false,
        baselineReady: false,
        source: "webcam",
      },
    };
  }

  function processFrame(imageData, width, height) {
    const { gray } = downsampleToGrayscale(imageData, width, height);
    const motionScore = computeMotionScore(gray, previousGray);

    previousGray = gray;
    ema = emaAlpha * motionScore + (1 - emaAlpha) * ema;

    const hotNow = motionScore >= threshold || ema >= threshold * 0.92;

    if (hotNow) {
      hotFrameStreak += 1;
    } else {
      hotFrameStreak = 0;
    }

    const cooldownPassed = Date.now() - lastTriggerAt > cooldownMs;

    let event = null;
    if (hotFrameStreak >= hotFramesRequired && cooldownPassed) {
      lastTriggerAt = Date.now();
      hotFrameStreak = 0;
      event = buildEvent({ motionScore, emaValue: ema });
    }

    return {
      motionScore,
      ema,
      triggered: Boolean(event),
      event,
    };
  }

  return {
    processFrame,
  };
}