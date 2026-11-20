export interface CraftClientOptions {
  /**
   * Base URL of the Craft API.
   */
  baseUrl?: string;
  /**
   * API key used to authenticate requests.
   */
  apiKey?: string;
  /**
   * Maximum time in milliseconds to wait for a request before aborting it.
   * Defaults to 30000 (30 seconds). A timed-out request rejects with a
   * `CraftApiError` whose `status` is 0.
   */
  timeoutMs?: number;
}
