export interface ChainInfo {
  head_block_num: number;
  head_block_time: string;
  last_irreversible_block_num: number;
  chain_id: string;
  head_block_producer: string;
}

export interface BlockInfo {
  id: string;
  block_num: number;
  transactions: unknown[];
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = 2000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...fetchOptions, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export class ProducerApi {
  private urls: string[];

  constructor(urls: string[]) {
    this.urls = urls;
  }

  async getInfo(): Promise<ChainInfo> {
    let lastError: Error | undefined;
    for (const url of this.urls) {
      try {
        const res = await fetchWithTimeout(`${url}/v1/chain/get_info`);
        if (!res.ok) throw new Error(`get_info failed: ${res.status}`);
        return res.json() as Promise<ChainInfo>;
      } catch (err) {
        lastError = err as Error;
      }
    }
    throw lastError ?? new Error("No producer URLs configured");
  }

  async getBlock(num: number): Promise<BlockInfo> {
    let lastError: Error | undefined;
    for (const url of this.urls) {
      try {
        const res = await fetchWithTimeout(`${url}/v1/chain/get_block`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ block_num_or_id: num }),
        });
        if (!res.ok) throw new Error(`get_block failed: ${res.status}`);
        return res.json() as Promise<BlockInfo>;
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
      console.warn(`[producer-api] ${action}: ${succeeded}/${this.urls.length} ok. Failures: ${errors.join("; ")}`);
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
        const res = await fetchWithTimeout(`${url}/v1/producer/${action}`, { method: "POST" });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`${action} failed on ${url}: ${res.status} ${body}`);
        }
        return;
      } catch (err) {
        lastError = err as Error;
        if (attempt < maxRetries - 1) await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw lastError!;
  }
}
