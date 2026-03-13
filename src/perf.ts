export interface PerfMetricSample {
  name: string;
  durationMs: number;
  detail?: string;
  at: number;
}

export interface PerfMetricSummary {
  count: number;
  totalMs: number;
  maxMs: number;
  lastMs: number;
  lastDetail?: string;
  samples: PerfMetricSample[];
}

declare global {
  interface Window {
    __openclawPerfMetrics?: Record<string, PerfMetricSummary>;
  }
}

const PERF_SAMPLE_LIMIT = 24;

function getPerfStore(): Record<string, PerfMetricSummary> | null {
  if (typeof window === "undefined") return null;
  if (!window.__openclawPerfMetrics) {
    window.__openclawPerfMetrics = {};
  }
  return window.__openclawPerfMetrics;
}

export function recordPerfMetric(name: string, durationMs: number, detail?: string): void {
  const rounded = Math.round(durationMs * 10) / 10;
  const store = getPerfStore();
  if (store) {
    const entry = store[name] || {
      count: 0,
      totalMs: 0,
      maxMs: 0,
      lastMs: 0,
      lastDetail: undefined,
      samples: [],
    };
    entry.count += 1;
    entry.totalMs += rounded;
    entry.maxMs = Math.max(entry.maxMs, rounded);
    entry.lastMs = rounded;
    entry.lastDetail = detail;
    entry.samples.push({
      name,
      durationMs: rounded,
      detail,
      at: Date.now(),
    });
    if (entry.samples.length > PERF_SAMPLE_LIMIT) {
      entry.samples.splice(0, entry.samples.length - PERF_SAMPLE_LIMIT);
    }
    store[name] = entry;
  }
  if (rounded >= 40) {
    const suffix = detail ? ` (${detail})` : "";
    console.info(`[perf] ${name}: ${rounded}ms${suffix}`);
  }
}

export async function measureAsync<T>(name: string, task: () => Promise<T>, detail?: string): Promise<T> {
  const startedAt = performance.now();
  try {
    return await task();
  } finally {
    recordPerfMetric(name, performance.now() - startedAt, detail);
  }
}

export function measureSync<T>(name: string, task: () => T, detail?: string): T {
  const startedAt = performance.now();
  try {
    return task();
  } finally {
    recordPerfMetric(name, performance.now() - startedAt, detail);
  }
}

export function scheduleIdleTask(task: () => void, timeout = 1200): number {
  if (typeof window === "undefined") return 0;
  const maybeWindow = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  if (typeof maybeWindow.requestIdleCallback === "function") {
    return maybeWindow.requestIdleCallback(task, { timeout });
  }
  return window.setTimeout(task, Math.min(200, timeout));
}

export function cancelIdleTask(handle: number | null | undefined): void {
  if (typeof window === "undefined" || handle == null) return;
  const maybeWindow = window as Window & {
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof maybeWindow.cancelIdleCallback === "function") {
    maybeWindow.cancelIdleCallback(handle);
    return;
  }
  window.clearTimeout(handle);
}

export async function waitForNextPaint(): Promise<void> {
  if (typeof window === "undefined") return;
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}
