import type { Config } from "./config.js";

export interface ChainInfo {
  head_block_num: number;
  head_block_time: string;
  last_irreversible_block_num: number;
  chain_id: string;
  server_version_string: string;
  head_block_producer: string;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = 2000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export class ProducerApi {
  private urls: string[];
  private currentProducerIndex = 0;

  constructor(config: Config) {
    this.urls = config.producerUrls;
  }

  async getInfo(): Promise<ChainInfo> {
    let lastError: Error | undefined;
    for (const url of this.urls) {
      try {
        const res = await fetchWithTimeout(`${url}/v1/chain/get_info`);
        if (!res.ok) {
          throw new Error(`get_info failed: ${res.status} ${res.statusText}`);
        }
        return res.json() as Promise<ChainInfo>;
      } catch (err) {
        lastError = err as Error;
      }
    }
    throw lastError ?? new Error("No producer URLs configured");
  }

  async pause(): Promise<void> {
    await this.broadcastCommand("pause");
  }

  async resume(): Promise<void> {
    await this.broadcastCommand("resume");
  }

  async resumeOne(): Promise<void> {
    const idx = this.currentProducerIndex;
    this.currentProducerIndex = (idx + 1) % this.urls.length;
    const target = this.urls[idx];
    console.log(`[producer-api] Resuming single producer: ${target} (index ${idx})`);
    await this.sendCommand(target, "resume");
  }

  private async broadcastCommand(action: "pause" | "resume"): Promise<void> {
    const results = await Promise.allSettled(
      this.urls.map((url) => this.sendCommand(url, action))
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    if (failed > 0) {
      const errors = results
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map((r) => r.reason?.message ?? String(r.reason));
      console.warn(`[producer-api] ${action}: ${succeeded}/${this.urls.length} succeeded. Failures: ${errors.join("; ")}`);
    }

    if (succeeded === 0) {
      throw new Error(`${action} failed on all ${this.urls.length} producers`);
    }
  }

  private async sendCommand(url: string, action: "pause" | "resume"): Promise<void> {
    const maxRetries = 3;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await fetchWithTimeout(
          `${url}/v1/producer/${action}`,
          { method: "POST" }
        );
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`${action} failed on ${url}: ${res.status} ${body}`);
        }
        return;
      } catch (err) {
        lastError = err as Error;
        if (attempt < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }
    throw lastError!;
  }

  async waitForNewBlock(
    previousBlockNum: number,
    timeoutMs: number
  ): Promise<number> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const info = await this.getInfo();
        if (info.head_block_num > previousBlockNum) {
          return info.head_block_num;
        }
      } catch {
        // ignore polling errors
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    console.warn(
      `[producer-api] No new block after ${timeoutMs}ms (last: ${previousBlockNum})`
    );
    return previousBlockNum;
  }
}
