export interface Config {
  producerUrls: string[];
  port: number;
  slowIntervalMs: number;
  mediumIntervalMs: number;
  fastThreshold: number;
  fastWindowMs: number;
  idleTimeoutMs: number;
  cooldownMs: number;
  blockWaitTimeoutMs: number;
  healthCheckIntervalMs: number;
  burstBlockCount: number;
}

export function loadConfig(): Config {
  // Support PRODUCER_URLS (comma-separated) with PRODUCER_URL fallback
  const urlsEnv = process.env.PRODUCER_URLS;
  const urlEnv = process.env.PRODUCER_URL;

  let producerUrls: string[];
  if (urlsEnv) {
    producerUrls = urlsEnv.split(",").map((u) => u.trim()).filter(Boolean);
  } else if (urlEnv) {
    producerUrls = [urlEnv];
  } else {
    throw new Error("PRODUCER_URLS or PRODUCER_URL environment variable is required");
  }

  if (producerUrls.length === 0) {
    throw new Error("At least one producer URL must be provided");
  }

  return {
    producerUrls,
    port: parseInt(process.env.PORT || "3100", 10),
    slowIntervalMs: parseInt(process.env.SLOW_INTERVAL_MS || "60000", 10),
    mediumIntervalMs: parseInt(process.env.MEDIUM_INTERVAL_MS || "5000", 10),
    fastThreshold: parseInt(process.env.FAST_THRESHOLD || "5", 10),
    fastWindowMs: parseInt(process.env.FAST_WINDOW_MS || "5000", 10),
    idleTimeoutMs: parseInt(process.env.IDLE_TIMEOUT_MS || "60000", 10),
    cooldownMs: parseInt(process.env.COOLDOWN_MS || "10000", 10),
    blockWaitTimeoutMs: parseInt(process.env.BLOCK_WAIT_TIMEOUT_MS || "3000", 10),
    healthCheckIntervalMs: parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || "5000", 10),
    burstBlockCount: parseInt(process.env.BURST_BLOCK_COUNT || "4", 10),
  };
}
