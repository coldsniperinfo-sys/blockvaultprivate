export function createAfterHoursDetector({
    cameraId = "CAM-01",
    startTime = "22:00",
    endTime = "06:00",
  } = {}) {
    function parseTimeToMinutes(value) {
      if (!value || typeof value !== "string") return 0;
  
      const [hoursRaw, minutesRaw] = value.split(":");
      const hours = Number(hoursRaw);
      const minutes = Number(minutesRaw);
  
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  
      return Math.max(0, Math.min(1439, hours * 60 + minutes));
    }
  
    function getCurrentMinutes(date = new Date()) {
      return date.getHours() * 60 + date.getMinutes();
    }
  
    function isWithinAfterHoursWindow(date = new Date()) {
      const start = parseTimeToMinutes(startTime);
      const end = parseTimeToMinutes(endTime);
      const now = getCurrentMinutes(date);
  
      if (start === end) {
        return true;
      }
  
      if (start < end) {
        return now >= start && now < end;
      }
  
      return now >= start || now < end;
    }
  
    function normalizeEventType(eventType) {
      const raw = String(eventType || "EVENT").toUpperCase();
      return raw.replace(/[^A-Z0-9_]/g, "_");
    }
  
    function buildEvent(sourceEvent, observedAt = new Date()) {
      const now = observedAt.getTime();
      const originalEventType = normalizeEventType(sourceEvent?.eventType);
  
      return {
        eventId: `evt_${cameraId.toLowerCase().replace(/[^a-z0-9]/g, "")}_afterhours_${now}`,
        cameraId,
        ts: observedAt.toISOString(),
        eventType: `AFTER_HOURS_${originalEventType}`,
        severity: "HIGH",
        evidenceHash: "pending",
        metadataHash: "pending",
        status: "Detected / After Hours",
        meta: {
          motionScore: sourceEvent?.meta?.motionScore ?? 0,
          ema: sourceEvent?.meta?.ema ?? 0,
          burst: sourceEvent?.meta?.burst ?? 0,
          tamperDetected: Boolean(sourceEvent?.meta?.tamperDetected),
          movedDetected: Boolean(sourceEvent?.meta?.movedDetected),
          baselineReady: Boolean(sourceEvent?.meta?.baselineReady),
          source: "after-hours-detector",
          afterHoursDetected: true,
          afterHoursStart: startTime,
          afterHoursEnd: endTime,
          originalEventId: sourceEvent?.eventId || null,
          originalEventType,
          originalSeverity: sourceEvent?.severity || "UNKNOWN",
          originalStatus: sourceEvent?.status || "Detected",
          observedLocalTime: observedAt.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        },
      };
    }
  
    function processEvent(sourceEvent, date = new Date()) {
      const active = isWithinAfterHoursWindow(date);
  
      if (!sourceEvent || !active) {
        return {
          active,
          triggered: false,
          event: null,
        };
      }
  
      return {
        active,
        triggered: true,
        event: buildEvent(sourceEvent, date),
      };
    }
  
    function getState(date = new Date()) {
      return {
        cameraId,
        startTime,
        endTime,
        active: isWithinAfterHoursWindow(date),
      };
    }
  
    return {
      processEvent,
      getState,
    };
  }