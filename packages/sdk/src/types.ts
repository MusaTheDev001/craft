export interface Template {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export type TemplateListResponse = Template[];

export interface UserProfile {
  id: string;
  name?: string;
  email?: string;
  /**
   * ISO 8601 timestamp string (e.g. `"2024-01-15T12:34:56.789Z"`).
   * This is the raw parsed JSON value returned by `CraftClient`, not a `Date`.
   */
  createdAt: string;
  updatedAt?: string;
  [key: string]: unknown;
}

/**
 * Known subscription tiers exposed by the SDK.
 */
export type SubscriptionTier = 'free' | 'pro' | 'team' | 'enterprise';

/**
 * Known Stripe subscription statuses.
 * @see https://stripe.com/docs/api/subscriptions/object#subscription_object-status
 */
export type SubscriptionStatusValue =
  | 'active'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'past_due'
  | 'paused'
  | 'trialing'
  | 'unpaid';

export interface SubscriptionStatus {
  tier: SubscriptionTier;
  status: SubscriptionStatusValue;
  [key: string]: unknown;
}

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
