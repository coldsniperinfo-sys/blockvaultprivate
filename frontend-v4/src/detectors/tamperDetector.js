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
  const targetWidth = 64;
  const targetHeight = 36;
  const pixelCount = targetWidth * targetHeight;

  let frameCount = 0;
  let lastTriggerAt = 0;
  let tamperStreak = 0;
  let clearStreak = 0;
  let tamperLatched = false;

  let previousGray = null;
  let baselineGray = null;
  let baselineReady = false;
  let baselineLocked = false;

  let referenceBrightness = 0;
  let referenceFlatness = 0;
  let referenceDetail = 0;

  function downsample(imageData, width, height) {
    const source = imageData.data;
    const gray = new Float32Array(pixelCount);

    const stepX = width / targetWidth;
    const stepY = height / targetHeight;

    for (let targetY = 0; targetY < targetHeight; targetY += 1) {
      for (let targetX = 0; targetX < targetWidth; targetX += 1) {
        const sourceX = Math.min(
          width - 1,
          Math.floor((targetX + 0.5) * stepX)
        );

        const sourceY = Math.min(
          height - 1,
          Math.floor((targetY + 0.5) * stepY)
        );

        const sourceIndex = (sourceY * width + sourceX) * 4;

        const red = source[sourceIndex];
        const green = source[sourceIndex + 1];
        const blue = source[sourceIndex + 2];

        gray[targetY * targetWidth + targetX] =
          0.299 * red +
          0.587 * green +
          0.114 * blue;
      }
    }

    return gray;
  }

  function computeBasicStats(gray) {
    let sum = 0;
    let darkPixels = 0;
    let brightPixels = 0;

    for (let index = 0; index < pixelCount; index += 1) {
      const value = gray[index];

      sum += value;

      if (value < 52) {
        darkPixels += 1;
      }

      if (value > 220) {
        brightPixels += 1;
      }
    }

    const brightness = sum / pixelCount;

    let varianceSum = 0;
    let gradientSum = 0;
    let gradientSamples = 0;

    for (let y = 0; y < targetHeight; y += 1) {
      for (let x = 0; x < targetWidth; x += 1) {
        const index = y * targetWidth + x;
        const difference = gray[index] - brightness;

        varianceSum += difference * difference;

        if (x < targetWidth - 1) {
          gradientSum += Math.abs(
            gray[index + 1] - gray[index]
          );

          gradientSamples += 1;
        }

        if (y < targetHeight - 1) {
          gradientSum += Math.abs(
            gray[index + targetWidth] - gray[index]
          );

          gradientSamples += 1;
        }
      }
    }

    return {
      brightness,

      flatness: Math.sqrt(
        varianceSum / pixelCount
      ),

      detail: gradientSamples
        ? gradientSum / gradientSamples
        : 0,

      darkRatio: darkPixels / pixelCount,
      brightRatio: brightPixels / pixelCount,
    };
  }

  function compareFrames(current, reference) {
    if (
      !reference ||
      reference.length !== current.length
    ) {
      return {
        meanDifference: 0,
        changedPixelRatio: 0,
      };
    }

    let differenceSum = 0;
    let changedPixels = 0;

    for (let index = 0; index < pixelCount; index += 1) {
      const difference = Math.abs(
        current[index] - reference[index]
      );

      differenceSum += difference;

      if (difference >= 34) {
        changedPixels += 1;
      }
    }

    return {
      meanDifference:
        differenceSum / pixelCount / 255,

      changedPixelRatio:
        changedPixels / pixelCount,
    };
  }

  function setReference(
    gray,
    { lock = false } = {}
  ) {
    baselineGray = new Float32Array(gray);

    const stats = computeBasicStats(
      baselineGray
    );

    referenceBrightness =
      stats.brightness;

    referenceFlatness =
      stats.flatness;

    referenceDetail =
      stats.detail;

    baselineReady = true;
    baselineLocked = lock;

    tamperStreak = 0;
    clearStreak = 0;
    tamperLatched = false;
  }

  function blendReference(gray, alpha) {
    if (!baselineGray) {
      setReference(gray);
      return;
    }

    for (let index = 0; index < pixelCount; index += 1) {
      baselineGray[index] =
        baselineGray[index] * (1 - alpha) +
        gray[index] * alpha;
    }

    const stats = computeBasicStats(
      baselineGray
    );

    referenceBrightness =
      stats.brightness;

    referenceFlatness =
      stats.flatness;

    referenceDetail =
      stats.detail;
  }

  function classifyTamper(stats) {
    const stableThreshold = Math.max(
      lowMotionThreshold,
      0.04
    );

    const stableFrame =
      stats.motionEstimate <= stableThreshold;

    const blackedOut =
      stats.brightness <=
        Math.max(darknessThreshold, 52) &&
      stats.darkRatio >=
        Math.min(
          occlusionRatioThreshold,
          0.76
        );

    const blinded =
      stats.brightness >= 222 &&
      stats.brightRatio >= 0.72;

    const brightnessRatio =
      referenceBrightness > 1
        ? stats.brightness /
          referenceBrightness
        : 1;

    const detailRatio =
      referenceDetail > 1
        ? stats.detail /
          referenceDetail
        : 1;

    const majorSceneReplacement =
      baselineReady &&
      stableFrame &&
      stats.meanDifference >= 0.2 &&
      stats.changedPixelRatio >= 0.76;

    const blurredObstruction =
      majorSceneReplacement &&
      detailRatio <= 0.72;

    const exposureCollapse =
      majorSceneReplacement &&
      (
        brightnessRatio <= 0.62 ||
        brightnessRatio >= 1.55
      );

    const nearTotalReplacement =
      baselineReady &&
      stableFrame &&
      stats.meanDifference >= 0.29 &&
      stats.changedPixelRatio >= 0.9;

    const unusuallyFlat =
      stats.flatness <=
      Math.max(flatnessThreshold, 8);

    if (blackedOut) {
      return {
        suspicious: true,
        reason: "CAMERA_BLACKED_OUT",
      };
    }

    if (blinded) {
      return {
        suspicious: true,
        reason: "CAMERA_BLINDED",
      };
    }

    if (blurredObstruction) {
      return {
        suspicious: true,
        reason: "LENS_OBSTRUCTED",
      };
    }

    if (exposureCollapse) {
      return {
        suspicious: true,
        reason: "VISIBILITY_COLLAPSED",
      };
    }

    if (nearTotalReplacement) {
      return {
        suspicious: true,
        reason: "VIEW_OBSTRUCTED",
      };
    }

    if (
      majorSceneReplacement &&
      unusuallyFlat &&
      detailRatio <= 0.86
    ) {
      return {
        suspicious: true,
        reason: "LENS_COVERED",
      };
    }

    return {
      suspicious: false,
      reason: "CLEAR",
    };
  }

  function createEvent(stats, reason) {
    const now = Date.now();

    return {
      eventId: `evt_${cameraId
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")}_${now}`,

      cameraId,
      ts: new Date(now).toISOString(),

      eventType: "TAMPER",
      severity: "HIGH",

      evidenceHash: "pending",
      metadataHash: "pending",

      meta: {
        source: "camera",

        tamperDetected: true,
        movedDetected: false,

        baselineReady,
        baselineLocked,

        tamperReason: reason,

        brightness: Number(
          stats.brightness.toFixed(2)
        ),

        flatness: Number(
          stats.flatness.toFixed(2)
        ),

        detail: Number(
          stats.detail.toFixed(2)
        ),

        darkRatio: Number(
          stats.darkRatio.toFixed(4)
        ),

        brightRatio: Number(
          stats.brightRatio.toFixed(4)
        ),

        temporalMotion: Number(
          stats.motionEstimate.toFixed(4)
        ),

        baselineDifference: Number(
          stats.meanDifference.toFixed(4)
        ),

        changedPixelRatio: Number(
          stats.changedPixelRatio.toFixed(4)
        ),

        referenceBrightness: Number(
          referenceBrightness.toFixed(2)
        ),

        referenceFlatness: Number(
          referenceFlatness.toFixed(2)
        ),

        referenceDetail: Number(
          referenceDetail.toFixed(2)
        ),
      },
    };
  }

  function processFrame(
    imageData,
    width,
    height
  ) {
    frameCount += 1;

    const gray = downsample(
      imageData,
      width,
      height
    );

    const basicStats =
      computeBasicStats(gray);

    const temporal =
      compareFrames(
        gray,
        previousGray
      );

    const baselineComparison =
      compareFrames(
        gray,
        baselineGray
      );

    const stats = {
      ...basicStats,

      motionEstimate:
        temporal.meanDifference,

      meanDifference:
        baselineComparison.meanDifference,

      changedPixelRatio:
        baselineComparison.changedPixelRatio,
    };

    previousGray =
      new Float32Array(gray);

    if (!baselineReady) {
      if (!baselineGray) {
        baselineGray =
          new Float32Array(gray);
      } else {
        blendReference(gray, 0.18);
      }

      if (frameCount >= warmupFrames) {
        setReference(baselineGray);
      }

      return {
        triggered: false,
        event: null,

        suspicious: false,
        reason: "WARMING_UP",

        latched: false,
        baselineReady,

        ...stats,
      };
    }

    const classification =
      classifyTamper(stats);

    if (classification.suspicious) {
      tamperStreak += 1;
      clearStreak = 0;
    } else {
      tamperStreak = 0;
      clearStreak += 1;

      if (
        clearStreak >=
        clearFramesRequired
      ) {
        tamperLatched = false;
      }

      const safeToAdapt =
        !baselineLocked &&
        !tamperLatched &&
        stats.motionEstimate <= 0.018 &&
        stats.meanDifference <= 0.1;

      if (safeToAdapt) {
        blendReference(gray, 0.008);
      }
    }

    const cooldownPassed =
      Date.now() - lastTriggerAt >=
      cooldownMs;

    let event = null;

    if (
      classification.suspicious &&
      !tamperLatched &&
      cooldownPassed &&
      tamperStreak >=
        tamperFramesRequired
    ) {
      tamperLatched = true;
      lastTriggerAt = Date.now();

      event = createEvent(
        stats,
        classification.reason
      );
    }

    return {
      triggered: Boolean(event),
      event,

      suspicious:
        classification.suspicious,

      reason:
        classification.reason,

      latched:
        tamperLatched,

      baselineReady,
      baselineLocked,

      ...stats,
    };
  }

  function setBaselineFromFrame(
    imageData,
    width,
    height
  ) {
    const gray = downsample(
      imageData,
      width,
      height
    );

    setReference(
      gray,
      { lock: true }
    );

    previousGray =
      new Float32Array(gray);

    frameCount = Math.max(
      frameCount,
      warmupFrames
    );

    return getState();
  }

  function clearBaseline() {
    baselineGray = null;
    baselineReady = false;
    baselineLocked = false;

    referenceBrightness = 0;
    referenceFlatness = 0;
    referenceDetail = 0;

    previousGray = null;

    frameCount = 0;
    tamperStreak = 0;
    clearStreak = 0;
    tamperLatched = false;
  }

  function reset() {
    lastTriggerAt = 0;
    clearBaseline();
  }

  function getState() {
    return {
      frameCount,
      tamperStreak,
      clearStreak,
      tamperLatched,

      baselineReady,
      baselineLocked,

      referenceBrightness,
      referenceFlatness,
      referenceDetail,
    };
  }

  return {
    processFrame,
    setBaselineFromFrame,
    clearBaseline,
    reset,
    getState,
  };
}