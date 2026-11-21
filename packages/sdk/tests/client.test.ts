/**
 * API Client SDK Tests
 *
 * Tests the CraftClient SDK for:
 *   - Initialization and configuration
 *   - Auth methods (signUp, signIn, signOut, getUser, updateProfile)
 *   - Template methods (listTemplates, getTemplate, getTemplateMetadata)
 *   - Payment methods (createCheckout, getSubscription, cancelSubscription)
 *   - Deployment methods (getDeploymentAnalytics, getDeploymentHealth)
 *   - Error handling (4xx/5xx responses → CraftApiError)
 *   - TypeScript type correctness
 */

import { describe, it, expect, expectTypeOf, vi, beforeEach, afterEach } from 'vitest';
import type { DeploymentStatusType as CanonicalDeploymentStatusType } from '@craft/types';
import {
  CraftClient,
  CraftApiError,
  type CraftClientOptions,
  type AuthResponse,
  type UserProfile,
  type TemplateListResponse,
  type Template,
  type CheckoutResponse,
  type SubscriptionStatus,
  type DeploymentAnalytics,
  type DeploymentHealth,
  type DeploymentStatusType,
} from '../src/client';

describe('Deployment status type parity', () => {
  it('accepts every canonical backend deployment status', () => {
    expectTypeOf<CanonicalDeploymentStatusType>().toMatchTypeOf<DeploymentStatusType>();
  });
});

// ── Fetch mock helpers ────────────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    statusText: String(status),
  });
}

function mockFetchReject(error: Error) {
  return vi.fn().mockRejectedValue(error);
}

const BASE_URL = 'https://craft.app';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const AUTH_RESPONSE: AuthResponse = {
  user: { id: 'user-1', email: 'test@example.com', fullName: 'Test User' },
  session: { access_token: 'tok_abc', refresh_token: 'ref_abc' },
};

const USER_PROFILE: UserProfile = {
  id: 'user-1',
  email: 'test@example.com',
  fullName: 'Test User',
  subscriptionTier: 'pro',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  githubConnected: true,
  githubUsername: 'testuser',
};

const TEMPLATE: Template = {
  id: 'tmpl-1',
  name: 'Stellar DEX',
  description: 'Decentralized exchange',
  category: 'dex',
  version: '1.0.0',
  features: ['swapping', 'charts'],
};

const TEMPLATE_LIST: TemplateListResponse = {
  templates: [TEMPLATE],
  total: 1,
  limit: 10,
  offset: 0,
};

const CHECKOUT: CheckoutResponse = {
  sessionId: 'cs_test_123',
  url: 'https://checkout.stripe.com/pay/cs_test_123',
};

const SUBSCRIPTION: SubscriptionStatus = {
  subscriptionId: 'sub_123',
  status: 'active',
  tier: 'pro',
  currentPeriodEnd: '2024-02-01T00:00:00Z',
  cancelAtPeriodEnd: false,
};

const ANALYTICS: DeploymentAnalytics = {
  analytics: [{ id: 'a1', metricType: 'page_view', metricValue: 100, recordedAt: '2024-01-15T10:00:00Z' }],
  summary: { totalPageViews: 100, uptimePercentage: 99.9, totalTransactions: 10, lastChecked: '2024-01-15T12:00:00Z' },
};

const HEALTH: DeploymentHealth = {
  isHealthy: true,
  responseTime: 200,
  statusCode: 200,
  error: null,
  lastChecked: '2024-01-15T12:00:00Z',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CraftClient initialization', () => {
  it('constructs with required baseUrl', () => {
    const client = new CraftClient({ baseUrl: BASE_URL });
    expect(client).toBeInstanceOf(CraftClient);
  });

  it('throws when baseUrl is empty', () => {
    expect(() => new CraftClient({ baseUrl: '' })).toThrow('baseUrl is required');
  });

  it('strips trailing slash from baseUrl', () => {
    const client = new CraftClient({ baseUrl: `${BASE_URL}/` });
    // Verify by checking a successful request uses the correct URL
    const fetch = mockFetch(AUTH_RESPONSE);
    vi.stubGlobal('fetch', fetch);
    client.signIn({ email: 'a@b.com', password: 'pw' });
    expect(fetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/auth/signin`);
    vi.unstubAllGlobals();
  });

  it('strips every trailing slash from baseUrl', () => {
    const client = new CraftClient({ baseUrl: `${BASE_URL}///` });
    const fetch = mockFetch(AUTH_RESPONSE);
    vi.stubGlobal('fetch', fetch);
    client.signIn({ email: 'a@b.com', password: 'pw' });
    expect(fetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/auth/signin`);
    vi.unstubAllGlobals();
  });

  it('rejects a baseUrl that is empty after trimming trailing slashes', () => {
    expect(() => new CraftClient({ baseUrl: '///' })).toThrow('baseUrl is required');
  });

  it('accepts an initial accessToken', () => {
    const client = new CraftClient({ baseUrl: BASE_URL, accessToken: 'tok_init' });
    const fetch = mockFetch(USER_PROFILE);
    vi.stubGlobal('fetch', fetch);
    client.getUser();
    expect(fetch.mock.calls[0][1].headers['Authorization']).toBe('Bearer tok_init');
    vi.unstubAllGlobals();
  });

  it('setAccessToken updates the token used in subsequent requests', () => {
    const client = new CraftClient({ baseUrl: BASE_URL });
    client.setAccessToken('tok_new');
    const fetch = mockFetch(USER_PROFILE);
    vi.stubGlobal('fetch', fetch);
    client.getUser();
    expect(fetch.mock.calls[0][1].headers['Authorization']).toBe('Bearer tok_new');
    vi.unstubAllGlobals();
  });

  it('omits Authorization header when no token is set', () => {
    const client = new CraftClient({ baseUrl: BASE_URL });
    const fetch = mockFetch(TEMPLATE_LIST);
    vi.stubGlobal('fetch', fetch);
    client.listTemplates();
    expect(fetch.mock.calls[0][1].headers['Authorization']).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('sends API-Version: v1 header on all requests', () => {
    const client = new CraftClient({ baseUrl: BASE_URL, accessToken: 'tok' });
    const fetch = mockFetch(TEMPLATE_LIST);
    vi.stubGlobal('fetch', fetch);
    client.listTemplates();
    expect(fetch.mock.calls[0][1].headers['API-Version']).toBe('v1');
    vi.unstubAllGlobals();
  });
});

describe('Path identifier encoding', () => {
  let client: CraftClient;

  beforeEach(() => {
    client = new CraftClient({ baseUrl: BASE_URL });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getTemplate percent-encodes the template id', async () => {
    const fetch = mockFetch(TEMPLATE);
    vi.stubGlobal('fetch', fetch);
    await client.getTemplate('a/b?c');
    expect(fetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/templates/a%2Fb%3Fc`);
  });

  it('getTemplateMetadata percent-encodes the template id', async () => {
    const fetch = mockFetch(TEMPLATE);
    vi.stubGlobal('fetch', fetch);
    await client.getTemplateMetadata('a/b?c');
    expect(fetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/templates/a%2Fb%3Fc/metadata`);
  });

  it('getDeploymentAnalytics percent-encodes the deployment id', async () => {
    const fetch = mockFetch(ANALYTICS);
    vi.stubGlobal('fetch', fetch);
    await client.getDeploymentAnalytics('a/b?c');
    expect(fetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/deployments/a%2Fb%3Fc/analytics`);
  });

  it('getDeploymentHealth percent-encodes the deployment id', async () => {
    const fetch = mockFetch(HEALTH);
    vi.stubGlobal('fetch', fetch);
    await client.getDeploymentHealth('a/b?c');
    expect(fetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/deployments/a%2Fb%3Fc/health`);
  });
});

describe('Auth methods', () => {
  let client: CraftClient;

  beforeEach(() => {
    client = new CraftClient({ baseUrl: BASE_URL });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('signUp sends POST /api/auth/signup with body', async () => {
    vi.stubGlobal('fetch', mockFetch(AUTH_RESPONSE, 201));
    const result = await client.signUp({ email: 'u@e.com', password: 'pw', fullName: 'U' });
    expect(result.user.email).toBe('test@example.com');
    expect(result.session.access_token).toBe('tok_abc');
  });

  it('signIn sends POST /api/auth/signin', async () => {
    vi.stubGlobal('fetch', mockFetch(AUTH_RESPONSE));
    const result = await client.signIn({ email: 'u@e.com', password: 'pw' });
    expect(result.session.access_token).toBeDefined();
  });

  it('signOut sends POST /api/auth/signout', async () => {
    const fetch = mockFetch({ message: 'Signed out successfully' });
    vi.stubGlobal('fetch', fetch);
    const result = await client.signOut();
    expect(result.message).toBe('Signed out successfully');
    expect(fetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/auth/signout`);
    expect(fetch.mock.calls[0][1].method).toBe('POST');
  });

  it('getUser sends GET /api/auth/user', async () => {
    const fetch = mockFetch(USER_PROFILE);
    vi.stubGlobal('fetch', fetch);
    const result = await client.getUser();
    expect(result.id).toBe('user-1');
    expect(result.subscriptionTier).toBe('pro');
    expect(fetch.mock.calls[0][1].method).toBe('GET');
  });

  it('updateProfile sends PATCH /api/auth/profile', async () => {
    const updated = { ...USER_PROFILE, fullName: 'New Name' };
    const fetch = mockFetch(updated);
    vi.stubGlobal('fetch', fetch);
    const result = await client.updateProfile({ fullName: 'New Name' });
    expect(result.fullName).toBe('New Name');
    expect(fetch.mock.calls[0][1].method).toBe('PATCH');
  });

  it('signUp throws CraftApiError on 409 conflict', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'Email already registered' }, 409));
    await expect(
      client.signUp({ email: 'u@e.com', password: 'pw', fullName: 'U' }),
    ).rejects.toBeInstanceOf(CraftApiError);
  });

  it('signIn throws CraftApiError on 401 unauthorized', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'Invalid credentials' }, 401));
    await expect(
      client.signIn({ email: 'u@e.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(CraftApiError);
  });

  it('getUser throws CraftApiError on 401', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'Unauthorized' }, 401));
    await expect(client.getUser()).rejects.toBeInstanceOf(CraftApiError);
  });

  it('updateProfile throws CraftApiError on 400', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'Invalid payload' }, 400));
    await expect(client.updateProfile({ fullName: '' })).rejects.toBeInstanceOf(CraftApiError);
  });

  it('signOut throws CraftApiError on 500', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'Internal server error' }, 500));
    await expect(client.signOut()).rejects.toBeInstanceOf(CraftApiError);
  });

  it('throws CraftApiError with status and message on error response', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'Not found' }, 404));
    try {
      await client.getUser();
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CraftApiError);
      const apiErr = err as CraftApiError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.message).toBe('Not found');
    }
  });

  it('throws CraftApiError on network failure', async () => {
    vi.stubGlobal('fetch', mockFetchReject(new Error('Network down')));
    await expect(client.getUser()).rejects.toBeInstanceOf(CraftApiError);
  });
});

describe('Template methods', () => {
  let client: CraftClient;

  beforeEach(() => {
    client = new CraftClient({ baseUrl: BASE_URL });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('listTemplates sends GET /api/templates', async () => {
    const fetch = mockFetch(TEMPLATE_LIST);
    vi.stubGlobal('fetch', fetch);
    const result = await client.listTemplates();
    expect(result.templates).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(fetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/templates`);
    expect(fetch.mock.calls[0][1].method).toBe('GET');
  });

  it('listTemplates appends query params', async () => {
    const fetch = mockFetch(TEMPLATE_LIST);
    vi.stubGlobal('fetch', fetch);
    await client.listTemplates({ category: 'dex', limit: 5 });
    const url = fetch.mock.calls[0][0] as string;
    expect(url).toContain('category=dex');
    expect(url).toContain('limit=5');
  });

  it('getTemplate sends GET /api/templates/:id', async () => {
    const fetch = mockFetch(TEMPLATE);
    vi.stubGlobal('fetch', fetch);
    const result = await client.getTemplate('tmpl-1');
    expect(result.id).toBe('tmpl-1');
    expect(fetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/templates/tmpl-1`);
    expect(fetch.mock.calls[0][1].method).toBe('GET');
  });

  it('getTemplateMetadata sends GET /api/templates/:id/metadata', async () => {
    const fetch = mockFetch(TEMPLATE);
    vi.stubGlobal('fetch', fetch);
    const result = await client.getTemplateMetadata('tmpl-1');
    expect(result.id).toBe('tmpl-1');
    expect(fetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/templates/tmpl-1/metadata`);
    expect(fetch.mock.calls[0][1].method).toBe('GET');
  });

  it('getTemplate throws CraftApiError on 404', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'Template not found' }, 404));
    await expect(client.getTemplate('missing')).rejects.toBeInstanceOf(CraftApiError);
  });

  it('getTemplateMetadata throws CraftApiError on 404', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'Template not found' }, 404));
    await expect(client.getTemplateMetadata('missing')).rejects.toBeInstanceOf(CraftApiError);
  });
});

describe('Payment methods', () => {
  let client: CraftClient;

  beforeEach(() => {
    client = new CraftClient({ baseUrl: BASE_URL, accessToken: 'tok' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('createCheckout sends POST /api/payments/checkout', async () => {
    const fetch = mockFetch(CHECKOUT);
    vi.stubGlobal('fetch', fetch);
    const result = await client.createCheckout({ tier: 'pro' });
    expect(result.sessionId).toBe('cs_test_123');
    expect(fetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/payments/checkout`);
    expect(fetch.mock.calls[0][1].method).toBe('POST');
  });

  it('getSubscription sends GET /api/payments/subscription', async () => {
    const fetch = mockFetch(SUBSCRIPTION);
    vi.stubGlobal('fetch', fetch);
    const result = await client.getSubscription();
    expect(result.status).toBe('active');
    expect(fetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/payments/subscription`);
    expect(fetch.mock.calls[0][1].method).toBe('GET');
  });

  it('cancelSubscription sends POST /api/payments/subscription/cancel', async () => {
    const fetch = mockFetch({ ...SUBSCRIPTION, cancelAtPeriodEnd: true });
    vi.stubGlobal('fetch', fetch);
    const result = await client.cancelSubscription();
    expect(result.cancelAtPeriodEnd).toBe(true);
    expect(fetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/payments/subscription/cancel`);
    expect(fetch.mock.calls[0][1].method).toBe('POST');
  });

  it('createCheckout throws CraftApiError on 402', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'Payment required' }, 402));
    await expect(client.createCheckout({ tier: 'pro' })).rejects.toBeInstanceOf(CraftApiError);
  });
});

describe('Deployment methods', () => {
  let client: CraftClient;

  beforeEach(() => {
    client = new CraftClient({ baseUrl: BASE_URL, accessToken: 'tok' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getDeploymentAnalytics sends GET /api/deployments/:id/analytics', async () => {
    const fetch = mockFetch(ANALYTICS);
    vi.stubGlobal('fetch', fetch);
    const result = await client.getDeploymentAnalytics('dep-1');
    expect(result.summary.totalPageViews).toBe(100);
    expect(fetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/deployments/dep-1/analytics`);
    expect(fetch.mock.calls[0][1].method).toBe('GET');
  });

  it('getDeploymentHealth sends GET /api/deployments/:id/health', async () => {
    const fetch = mockFetch(HEALTH);
    vi.stubGlobal('fetch', fetch);
    const result = await client.getDeploymentHealth('dep-1');
    expect(result.isHealthy).toBe(true);
    expect(fetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/deployments/dep-1/health`);
    expect(fetch.mock.calls[0][1].method).toBe('GET');
  });

  it('getDeploymentAnalytics throws CraftApiError on 404', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'Deployment not found' }, 404));
    await expect(client.getDeploymentAnalytics('missing')).rejects.toBeInstanceOf(CraftApiError);
  });

  it('getDeploymentHealth throws CraftApiError on 503', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'Service unavailable' }, 503));
    await expect(client.getDeploymentHealth('dep-1')).rejects.toBeInstanceOf(CraftApiError);
  });
});
