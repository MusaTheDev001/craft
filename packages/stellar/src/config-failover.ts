export interface HorizonFailoverOptions {
  endpoints: string[];
  recoveryMs: number;
}

export interface HorizonFailoverConfig {
  endpoints: string[];
  recoveryMs: number;
}

function isValidHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Builds a validated Horizon failover configuration.
 *
 * Endpoints are trimmed, deduplicated and filtered down to valid https URLs.
 * Blank entries and non-https URLs are dropped; if nothing valid remains an
 * error is thrown. A negative recovery window is rejected with a RangeError.
 */
export function createHorizonFailover(
  options: HorizonFailoverOptions,
): HorizonFailoverConfig {
  const { endpoints, recoveryMs } = options;

  if (!Array.isArray(endpoints)) {
    throw new TypeError('Horizon failover endpoints must be an array');
  }

  const normalized = Array.from(
    new Set(
      endpoints
        .map((endpoint) => (typeof endpoint === 'string' ? endpoint.trim() : ''))
        .filter((endpoint) => endpoint.length > 0 && isValidHttpsUrl(endpoint)),
    ),
  );

  if (normalized.length === 0) {
    throw new Error(
      'Horizon failover requires at least one valid https endpoint',
    );
  }

  if (typeof recoveryMs !== 'number' || Number.isNaN(recoveryMs)) {
    throw new TypeError('Horizon failover recoveryMs must be a number');
  }

  if (recoveryMs < 0) {
    throw new RangeError('Horizon failover recoveryMs must not be negative');
  }

  return {
    endpoints: normalized,
    recoveryMs,
  };
}

/**
 * Tracks endpoint health for Horizon failover.
 *
 * The map value stores the timestamp (ms) until which an endpoint is
 * considered unhealthy; once `unhealthyUntil` has passed the endpoint is
 * eligible for use again.
 */
export class HorizonFailoverTracker {
  private readonly unhealthyUntil = new Map<string, number>();

  constructor(private readonly config: HorizonFailoverConfig) {}

  markUnhealthy(endpoint: string, now: number = Date.now()): void {
    this.unhealthyUntil.set(endpoint, now + this.config.recoveryMs);
  }

  isHealthy(endpoint: string, now: number = Date.now()): boolean {
    const until = this.unhealthyUntil.get(endpoint);
    if (until === undefined) {
      return true;
    }
    if (now >= until) {
      this.unhealthyUntil.delete(endpoint);
      return true;
    }
    return false;
  }

  getEndpoints(): string[] {
    return [...this.config.endpoints];
  }
}
