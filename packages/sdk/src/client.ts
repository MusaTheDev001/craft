/**
 * CRAFT API Client SDK
 *
 * Wraps the CRAFT platform REST API with typed methods for auth, templates,
 * deployments, and payments.
 */

export type { DeploymentStatusType } from '@craft/types';

export type SubscriptionTier = 'free' | 'pro' | 'enterprise';

/**
 * Known Stripe subscription statuses.
 * @see https://stripe.com/docs/api/subscriptions/object#subscription_object-status
 */
export type SubscriptionStatusType =
  | 'active'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'past_due'
  | 'paused'
  | 'trialing'
  | 'unpaid';

/**
 * Configuration options for CraftClient.
 * @property baseUrl - The base URL of the CRAFT API (e.g., https://craft.app)
 * @property accessToken - Optional JWT access token for authenticated requests
 */
export interface CraftClientOptions {
  baseUrl: string;
  accessToken?: string;
  /** How many times a 429 response is retried after waiting for Retry-After. Defaults to 2. */
  maxRetries?: number;
  /** Upper bound (ms) on a single Retry-After wait; longer waits fail fast instead. Defaults to 60000. */
  maxRetryDelayMs?: number;
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
  /**
   * Account creation timestamp as an ISO 8601 string (e.g. `2024-01-15T10:30:00.000Z`).
   * This is the raw value from the parsed JSON response — not a `Date` instance.
   * Use `new Date(profile.createdAt)` if you need a `Date`.
   */
  createdAt: string;
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

/**
 * Response shape of GET /api/templates.
 *
 * The route returns a plain array from `templateService.listTemplates`; it does
 * not paginate, so there is no `total`/`limit`/`offset` envelope.
 */
export type TemplateListResponse = Template[];

export interface TemplateListOptions {
  category?: string;
  search?: string;
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
  status: SubscriptionStatusType;
  tier: SubscriptionTier;
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
/** Wait used when a 429 carries neither a Retry-After header nor a retryAfterMs body field. */
const FALLBACK_RETRY_DELAY_MS = 1_000;

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
   *
   * On a 2xx response the body is parsed as JSON. A 204 No Content (or any empty
   * body) resolves to `undefined`. If the body is not valid JSON (e.g. an HTML page
   * served by a proxy), a CraftApiError carrying the response status is thrown
   * instead of a raw SyntaxError, so every failure surfaces as CraftApiError.
   */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: this.headers(),
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch (error) {
        throw new CraftApiError(0, `Network request failed: ${error instanceof Error ? error.message : String(error)}`, undefined);
      }

      if (res.ok) {
        if (res.status === 204) return undefined as T;
        const text = await res.text();
        if (text.trim() === '') return undefined as T;
        try {
          return JSON.parse(text) as T;
        } catch {
          throw new CraftApiError(
            res.status,
            `Expected JSON response but received non-JSON body (status ${res.status})`,
            'INVALID_RESPONSE_BODY',
          );
        }
      }

      const text = await res.text().catch(() => res.statusText);
      let message = text;
      let code: string | undefined;
      let errorBody: Record<string, unknown> | null = null;
      try {
        errorBody = JSON.parse(text) as Record<string, unknown>;
        if (errorBody.message && typeof errorBody.message === 'string') {
          message = errorBody.message;
        } else if (errorBody.error && typeof errorBody.error === 'string') {
          message = errorBody.error;
        }
        if (errorBody.code && typeof errorBody.code === 'string') {
          code = errorBody.code;
        }
      } catch {
        // Non-JSON error body; fall back to raw text.
      }

      if (res.status === 429 && attempt < this.maxRetries) {
        const retryAfterMs = resolveRetryAfterMs(res, errorBody);
        if (retryAfterMs <= this.maxRetryDelayMs) {
          await sleep(retryAfterMs);
          continue;
        }
      }

      if (res.status === 429) {
        throw new CraftApiError(
          res.status,
          message || 'Rate limit exceeded',
          code ?? 'RATE_LIMITED',
          resolveRetryAfterMs(res, errorBody),
        );
      }

      throw new CraftApiError(res.status, message || `Request failed with status ${res.status}`, code);
    }
  }

  /**
   * Signs up a new user.
   * @param data - Sign-up credentials and profile info
   * @returns Auth response with user and session tokens
   */
  async signUp(data: SignUpRequest): Promise<AuthResponse> {
    return this.request<AuthResponse>('POST', '/api/auth/signup', data);
  }

  /**
   * Signs in an existing user.
   * @param data - Sign-in credentials
   * @returns Auth response with user and session tokens
   */
  async signIn(data: SignInRequest): Promise<AuthResponse> {
    return this.request<AuthResponse>('POST', '/api/auth/signin', data);
  }

  /**
   * Signs out the current user.
   */
  async signOut(): Promise<void> {
    return this.request<void>('POST', '/api/auth/signout');
  }

  /**
   * Fetches the current user's profile.
   * @returns User profile
   */
  async getProfile(): Promise<UserProfile> {
    return this.request<UserProfile>('GET', '/api/auth/profile');
  }

  /**
   * Lists available templates.
   * @param options - Optional category/search filters
   * @returns Array of templates
   */
  async listTemplates(options?: TemplateListOptions): Promise<TemplateListResponse> {
    const params = new URLSearchParams();
    if (options?.category) params.set('category', options.category);
    if (options?.search) params.set('search', options.search);
    const query = params.toString();
    return this.request<TemplateListResponse>('GET', `/api/templates${query ? `?${query}` : ''}`);
  }

  /**
   * Fetches a single template by ID.
   * @param id - Template ID
   * @returns Template
   */
  async getTemplate(id: string): Promise<Template> {
    return this.request<Template>('GET', `/api/templates/${encodeURIComponent(id)}`);
  }

  /**
   * Creates a Stripe checkout session for a subscription.
   * @param data - Checkout request details
   * @returns Checkout session ID and URL
   */
  async createCheckoutSession(data: CheckoutRequest): Promise<CheckoutResponse> {
    return this.request<CheckoutResponse>('POST', '/api/payments/checkout', data);
  }

  /**
   * Fetches the current subscription status.
   * @returns Subscription status
   */
  async getSubscriptionStatus(): Promise<SubscriptionStatus> {
    return this.request<SubscriptionStatus>('GET', '/api/payments/subscription');
  }

  /**
   * Fetches deployment analytics.
   * @param deploymentId - Deployment ID
   * @returns Analytics data and summary
   */
  async getDeploymentAnalytics(deploymentId: string): Promise<DeploymentAnalytics> {
    return this.request<DeploymentAnalytics>('GET', `/api/deployments/${encodeURIComponent(deploymentId)}/analytics`);
  }

  /**
   * Fetches deployment health.
   * @param deploymentId - Deployment ID
   * @returns Health status
   */
  async getDeploymentHealth(deploymentId: string): Promise<DeploymentHealth> {
    return this.request<DeploymentHealth>('GET', `/api/deployments/${encodeURIComponent(deploymentId)}/health`);
  }
}
