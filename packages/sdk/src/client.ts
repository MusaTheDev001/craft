/**
 * CRAFT API Client SDK
 *
 * Wraps the CRAFT platform REST API with typed methods for auth, templates,
 * deployments, and payments.
 */

export type { DeploymentStatusType } from '@craft/types';

export type SubscriptionTier = 'free' | 'pro' | 'enterprise';

/**
 * Configuration options for CraftClient.
 * @property baseUrl - The base URL of the CRAFT API (e.g., https://craft.app)
 * @property accessToken - Optional JWT access token for authenticated requests
 * @property timeoutMs - Per-request timeout in milliseconds. Defaults to 30000.
 */
export interface CraftClientOptions {
  baseUrl: string;
  accessToken?: string;
  /** How many times a 429 response is retried after waiting for Retry-After. Defaults to 2. */
  maxRetries?: number;
  /** Upper bound (ms) on a single Retry-After wait; longer waits fail fast instead. Defaults to 60000. */
  maxRetryDelayMs?: number;
  /** Per-request timeout (ms); a stalled request is aborted and rejects with CraftApiError. Defaults to 30000. */
  timeoutMs?: number;
}

export interface SignUpRequest {
  email: string;
  password: string;
  fullName: string;
}

export interface SignInRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: { id: string; email: string; fullName?: string };
  session: { access_token: string; refresh_token: string };
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  subscriptionTier: SubscriptionTier;
  createdAt: Date;
  githubConnected: boolean;
  githubUsername: string | null;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  features: string[];
  previewUrl?: string;
  thumbnailUrl?: string;
}

export interface TemplateListResponse {
  templates: Template[];
  total: number;
  limit: number;
  offset: number;
}

export interface TemplateListOptions {
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CheckoutRequest {
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResponse {
  sessionId: string;
  url: string;
}

export interface SubscriptionStatus {
  subscriptionId: string;
  status: string;
  tier: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

export interface DeploymentAnalytics {
  analytics: Array<{ id: string; metricType: string; metricValue: number; recordedAt: string }>;
  summary: { totalPageViews: number; uptimePercentage: number; totalTransactions: number; lastChecked: string };
}

export interface DeploymentHealth {
  isHealthy: boolean;
  responseTime: number;
  statusCode: number;
  error: string | null;
  lastChecked: string;
}

/**
 * Error thrown by CraftClient when an API request fails.
 * @property status - HTTP status code from the API response
 * @property message - Error message (from API response body or error description)
 */
export class CraftApiError extends Error {
  /**
   * Creates a new CraftApiError.
   * @param status - HTTP status code
   * @param message - Error message
   * @param code - Optional machine-readable error code
   * @param retryAfterMs - Optional wait (ms) requested by a 429 response
   */
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    /** For 429 responses: how long (ms) the server asked the client to wait. */
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'CraftApiError';
  }
}

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_RETRY_DELAY_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 30_000;
/** Wait used when a 429 carries neither a Retry-After header nor a retryAfterMs body field. */
const FALLBACK_RETRY_DELAY_MS = 1_000;

/**
 * Percent-encodes a user-supplied identifier for safe use as a single URL path
 * segment. Prevents ids containing `/` or `?` from altering the request target.
 */
function encodePathId(id: string): string {
  return encodeURIComponent(id);
}

/**
 * Resolves how long to wait before retrying a 429.
 * Prefers the standard Retry-After header (delta-seconds or HTTP-date), then the
 * `retryAfterMs` field the backend's tier rate limiter includes in its JSON body.
 */
function resolveRetryAfterMs(res: Response, body: Record<string, unknown> | null): number {
  const header = res.headers?.get?.('Retry-After');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(header);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  }
  if (body && typeof body.retryAfterMs === 'number' && body.retryAfterMs >= 0) {
    return body.retryAfterMs;
  }
  return FALLBACK_RETRY_DELAY_MS;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class CraftClient {
  private baseUrl: string;
  private accessToken?: string;
  private maxRetries: number;
  private maxRetryDelayMs: number;
  private timeoutMs: number;

  /**
   * Creates a new CRAFT API client.
   * @param options - Client configuration
   * @throws Error if baseUrl is not provided
   */
  constructor(options: CraftClientOptions) {
    const baseUrl = options.baseUrl?.replace(/\/+$/, '');
    if (!baseUrl) throw new Error('baseUrl is required');
    this.baseUrl = baseUrl;
    this.accessToken = options.accessToken;
    this.maxRetries = Math.max(0, options.maxRetries ?? DEFAULT_MAX_RETRIES);
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Sets the access token for subsequent authenticated requests.
   * @param token - JWT access token
   */
  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'API-Version': 'v1',
    };
    if (this.accessToken) h['Authorization'] = `Bearer ${this.accessToken}`;
    return h;
  }

  /**
   * Makes an HTTP request to the CRAFT API.
   * All failures — network-level and HTTP error responses — surface as CraftApiError.
   * When the error body is JSON matching ApiErrorResponse, the parsed message is used.
   * 429 responses are retried up to `maxRetries` times, waiting for the duration the
   * server advertises via Retry-After; once retries are exhausted a CraftApiError
   * with code 'RATE_LIMITED' is thrown.
   * Each attempt is bounded by `timeoutMs`; a stalled request is aborted and rejects
   * with a CraftApiError (status 0, code 'TIMEOUT').
   */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, this.timeoutMs);

      let res: Response;
      try {
        res = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: this.headers(),
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
      } catch (error) {
        if (timedOut) {
          throw new CraftApiError(0, `Request timed out after ${this.timeoutMs}ms`, 'TIMEOUT');
        }
        throw new CraftApiError(0, `Network request failed: ${error instanceof Error ? error.message : String(error)}`, undefined);
      } finally {
        clearTimeout(timer);
      }

      if (res.ok) return res.json() as Promise<T>;

      const text = await res.text().catch(() => res.statusText);
      let message = text;
      let code: string | undefined;
      let errorBody: Record<string, unknown> | null = null;
      try {
        errorBody = JSON.parse(text) as Record<string, unknown>;
        if (errorBody.message && typeof errorBody.message === 'string') {
          message = errorBody.message;
        } else if (errorBody.error && typeof errorBody.error === 'string') {
          // Rate-limit middleware responses use `error` rather than `message`.
          message = errorBody.error;
        }
        if (errorBody.code && typeof errorBody.code === 'string') {
          code = errorBody.code;
        }
      } catch {
        // text is not JSON; use raw text as message
      }

      if (res.status !== 429) {
        throw new CraftApiError(res.status, message, code);
      }

      const retryAfterMs = resolveRetryAfterMs(res, errorBody);
      if (attempt >= this.maxRetries) {
        throw new CraftApiError(
          429,
          `Rate limit exceeded; gave up after ${attempt} ${attempt === 1 ? 'retry' : 'retries'} (server asked to retry after ${retryAfterMs}ms): ${message}`,
          code ?? 'RATE_LIMITED',
          retryAfterMs,
        );
      }
      if (retryAfterMs > this.maxRetryDelayMs) {
        throw new CraftApiError(
          429,
          `Rate limit exceeded; server asked to retry after ${retryAfterMs}ms which exceeds the ${this.maxRetryDelayMs}ms limit: ${message}`,
          code ?? 'RATE_LIMITED',
          retryAfterMs,
        );
      }
      await sleep(retryAfterMs);
    }
  }

  /**
   * Registers a new user account.
   * @param data - Sign-up details
   * @returns The created user and session tokens
   */
  async signUp(data: SignUpRequest): Promise<AuthResponse> {
    return this.request<AuthResponse>('POST', '/api/auth/signup', data);
  }

  /**
   * Authenticates an existing user.
   * @param data - Sign-in credentials
   * @returns The user and session tokens
   */
  async signIn(data: SignInRequest): Promise<AuthResponse> {
    return this.request<AuthResponse>('POST', '/api/auth/signin', data);
  }

  /**
   * Fetches the current user's profile.
   * @returns The authenticated user's profile
   */
  async getProfile(): Promise<UserProfile> {
    return this.request<UserProfile>('GET', '/api/auth/profile');
  }

  /**
   * Lists available templates.
   * @param options - Optional filtering and pagination
   * @returns A page of templates
   */
  async listTemplates(options: TemplateListOptions = {}): Promise<TemplateListResponse> {
    const params = new URLSearchParams();
    if (options.category) params.set('category', options.category);
    if (options.search) params.set('search', options.search);
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    const query = params.toString();
    return this.request<TemplateListResponse>('GET', `/api/templates${query ? `?${query}` : ''}`);
  }

  /**
   * Fetches a single template by id.
   * @param id - Template id
   * @returns The template
   */
  async getTemplate(id: string): Promise<Template> {
    return this.request<Template>('GET', `/api/templates/${encodePathId(id)}`);
  }

  /**
   * Creates a Stripe checkout session for a subscription.
   * @param data - Checkout details
   * @returns The checkout session id and redirect URL
   */
  async createCheckout(data: CheckoutRequest): Promise<CheckoutResponse> {
    return this.request<CheckoutResponse>('POST', '/api/payments/checkout', data);
  }

  /**
   * Fetches the current subscription status.
   * @returns The subscription status
   */
  async getSubscriptionStatus(): Promise<SubscriptionStatus> {
    return this.request<SubscriptionStatus>('GET', '/api/payments/subscription');
  }

  /**
   * Fetches analytics for a deployment.
   * @param deploymentId - Deployment id
   * @returns Analytics records and summary
   */
  async getDeploymentAnalytics(deploymentId: string): Promise<DeploymentAnalytics> {
    return this.request<DeploymentAnalytics>('GET', `/api/deployments/${encodePathId(deploymentId)}/analytics`);
  }

  /**
   * Fetches the health of a deployment.
   * @param deploymentId - Deployment id
   * @returns The deployment health snapshot
   */
  async getDeploymentHealth(deploymentId: string): Promise<DeploymentHealth> {
    return this.request<DeploymentHealth>('GET', `/api/deployments/${encodePathId(deploymentId)}/health`);
  }
}
