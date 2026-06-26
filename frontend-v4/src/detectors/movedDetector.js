export function createMovedDetector({
    cameraId = "CAM-01",
    threshold = 14,
    cooldownMs = 5000,
  } = {}) {
    let baselineHash = null;
    let baselineReady = false;
    let lastTriggerAt = 0;
  
    function toGrayscaleDownsample(imageData, width, height, targetWidth = 17, targetHeight = 16) {
      const src = imageData.data;
      const result = new Float32Array(targetWidth * targetHeight);
  
      const stepX = width / targetWidth;
      const stepY = height / targetHeight;
  
      for (let ty = 0; ty < targetHeight; ty++) {
        for (let tx = 0; tx < targetWidth; tx++) {
          const sx = Math.floor(tx * stepX);
          const sy = Math.floor(ty * stepY);
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
  
    function computeDHash(frame) {
      const { data, width, height } = frame;
      const bits = [];
  
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width - 1; x++) {
          const left = data[y * width + x];
          const right = data[y * width + x + 1];
          bits.push(left > right ? 1 : 0);
        }
      }
  
      return bits.slice(0, 64);
    }
  
    function hammingDistance(a, b) {
      if (!a || !b || a.length !== b.length) return 0;
  
      let diff = 0;
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) diff++;
      }
      return diff;
    }
  
    function setBaselineFromFrame(imageData, width, height) {
      const frame = toGrayscaleDownsample(imageData, width, height);
      baselineHash = computeDHash(frame);
      baselineReady = true;
  
      return {
        baselineReady,
        baselineHash,
      };
    }
  
    function clearBaseline() {
      baselineHash = null;
      baselineReady = false;
    }
  
    function buildEvent({ distance }) {
      const now = Date.now();
  
      return {
        eventId: `evt_${cameraId.toLowerCase().replace(/[^a-z0-9]/g, "")}_${now}`,
        cameraId,
        ts: new Date(now).toISOString(),
        eventType: "MOVED",
        severity: distance >= threshold + 10 ? "HIGH" : "WARNING",
        evidenceHash: "pending",
        metadataHash: "pending",
        meta: {
          motionScore: 0,
          ema: 0,
          burst: 0,
          tamperDetected: false,
          movedDetected: true,
          baselineReady,
          source: "webcam",
          movedDistance: distance,
          movedThreshold: threshold,
        },
      };
    }
  
    function processFrame(imageData, width, height) {
      if (!baselineReady || !baselineHash) {
        return {
          baselineReady: false,
          distance: 0,
          movedDetected: false,
          triggered: false,
          event: null,
        };
      }
  
      const frame = toGrayscaleDownsample(imageData, width, height);
      const currentHash = computeDHash(frame);
      const distance = hammingDistance(currentHash, baselineHash);
  
      const now = Date.now();
      const cooldownPassed = now - lastTriggerAt > cooldownMs;
  
      let event = null;
  
      if (distance >= threshold && cooldownPassed) {
        lastTriggerAt = now;
        event = buildEvent({ distance });
      }
  
      return {
        baselineReady: true,
        distance,
        movedDetected: distance >= threshold,
        triggered: Boolean(event),
        event,
      };
    }
  
    function getState() {
      return {
        baselineReady,
        threshold,
      };
    }
  
    return {
      processFrame,
      setBaselineFromFrame,
      clearBaseline,
      getState,
    };
  }