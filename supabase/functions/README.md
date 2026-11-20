# Supabase Edge Functions

This directory contains Supabase Edge Functions for the CRAFT platform, including cross-region authentication services, health checks, and intelligent routing.

## Dependency Pinning

Edge functions import `@supabase/supabase-js` from esm.sh. To avoid supply-chain surprises from floating major tags, the import is pinned to an exact version that matches `apps/backend/package.json`:

```
https://esm.sh/@supabase/supabase-js@2.49.4
```

This pinned URL is recorded in `import_map.json` (as the `@supabase/supabase-js` specifier) so all functions resolve the same exact version. When bumping `@supabase/supabase-js` in `apps/backend/package.json`, update both `import_map.json` and the import in `regional-auth/auth-utils.ts` to the same exact version.

## Directory Structure

```
functions/
├── import_map.json                          # Deno import mappings
├── regional-auth/                           # Regional authentication services
│   ├── auth-utils.ts                       # Shared auth utilities
│   ├── sign-up.ts                          # User registration edge function
│   ├── sign-in.ts                          # User authentication edge function
│   ├── token-refresh.ts                    # Token refresh edge function
│   ├── consistency-validators.ts           # State consistency checking
│   └── regional-auth.test.ts              # Auth function tests
├── regional-health-check/                  # Regional health monitoring
│   ├── index.ts                            # Health check edge function
│   └── health-check.test.ts               # Health check tests
└── regional-router/                        # Intelligent request routing
    └── index.ts                            # Regional router edge function
```

## Edge Functions

### Regional Auth Functions

#### Sign-Up (`regional-auth/sign-up.ts`)

Creates new user accounts with cross-region state synchronization.

**Endpoint**: `POST /functions/v1/regional-auth-sign-up`

**Request**:
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123",
  "metadata": {
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "createdAt": "2026-05-28T10:30:00Z"
  },
  "metadata": {
    "region": "us-east",
    "processingTime": 145,
    "requestId": "auth-1716883800000-abc123"
  }
}
```

**Features**:
- Email validation
- Password strength validation
- Cross-region profile synchronization
- Subscription tier assignment (default: free)
- Audit logging

#### Sign-In (`regional-auth/sign-in.ts`)

Authenticates users with automatic region detection and failover.

**Endpoint**: `POST /functions/v1/regional-auth-sign-in`

**Request**:
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123",
  "region": "eu-west"  // Optional: override detected region
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "refresh_token_xyz789...",
    "expiresIn": 3600,
    "region": "us-east"
  },
  "metadata": {
    "region": "us-east",
    "processingTime": 92,
    "requestId": "auth-1716883800000-def456"
  }
}
```

**Features**:
- Automatic region detection from request headers
- Regional failover support
- JWT token validation
- Cross-region authentication
- Detailed error reporting

#### Token Refresh (`regional-auth/token-refresh.ts`)

Refreshes expired access tokens with cross-region support.

**Endpoint**: `POST /functions/v1/regional-auth-token-refresh`

**Request**:
```json
{
  "refreshToken": "refresh_token_xyz789...",
  "region": "eu-west"  // Optional
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "new_refresh_token...",
    "expiresIn": 3600,
    "region": "us-east"
  },
  "metadata": {
    "region": "us-east",
    "processingTime": 78,
    "requestId": "auth-1716883800000-ghi789"
  }
}
```

**Features**:
- Token refresh with validation
- Regional failover for refresh tokens
- New JWT token generation
- Token consistency verification

### Health Check (`regional-health-check/index.ts`)

Monitors regional Supabase instance health and availability.

**Endpoint**: `GET /functions/v1/regional-health-check`

**Query Parameters**:
- `region`: Check specific region (us-east, eu-west, ap-southeast)
- `detailed`: Include detailed health information (true/false)

**Response** (all regions healthy):
```json
{
  "timestamp": "2026-05-28T10:30:00Z",
  "regions": [
    {
      "region": "us-east",
      "healthy": true,
      "responseTime": 45,
      "details": {
        "database": true,
        "auth": true
      }
    },
    {
      "region": "eu-west",
      "healthy": true,
      "responseTime": 73,
      "details": {
        "database": true,
        "auth": true
      }
    },
    {
      "region": "ap-southeast",
      "healthy": true,
      "responseTime": 82,
      "details": {
        "database": true,
        "auth": true
      }
    }
  ],
  "healthyRegions": ["us-east", "eu-west", "ap-southeast"],
  "allHealthy": true
}
```

**Features**:
- Database connectivity monitoring
- Auth service health checks
- Response time metrics
- Per-region or aggregate health status
- 10-second cache for performance

### Regional Router (`regional-router/index.ts`)

Intelligently routes requests to the nearest healthy region.

**Endpoint**: `POST /router/{service}/{path}`

`handleRouting()` treats `pathSegments[1]` (the first segment after `/router`) as the **literal deployed edge function name** and forwards to `/functions/v1/{service}/{path}` — it does not split a generic `auth` service from an operation name. `{service}` must therefore equal a real deployed function such as `regional-auth-sign-in`, not `auth`.

**Worked example** — routing to the `regional-auth-sign-in` function:

Request:
```
POST /router/regional-auth-sign-in
```

`pathSegments` = `['router', 'regional-auth-sign-in']`, so `service = 'regional-auth-sign-in'` and `servicePathSegments = []`. This resolves to the forwarded URL:
```
https://<selected-region>.functions.supabase.co/functions/v1/regional-auth-sign-in/
```
(the trailing slash comes from joining an empty `servicePathSegments` array; it's harmless since the `regional-auth-*` functions don't expect additional path segments.)

**Operations** — the deployed function names to route to, since there is no generic `auth` service:
- `POST /router/regional-auth-sign-in`
- `POST /router/regional-auth-sign-up`
- `POST /router/regional-auth-token-refresh`

**Info endpoint** (get the routing decision without forwarding): triggered when `pathSegments[2] === 'info'` (i.e. a third path segment after `/router/{service}`) or when the query string includes `?info=true`, e.g.:
```
GET /router/regional-auth-sign-in/info
GET /router/regional-auth-sign-in?info=true
```

**Request Headers**:
- `cf-ipcountry`: Cloudflare country code (auto-detected)
- `x-timezone`: User timezone (fallback detection)
- `x-region-override`: Force specific region (us-east, eu-west, ap-southeast)

**Response Headers**:
- `x-served-by-region`: Region that handled the request
- `x-routing-metadata`: JSON with routing decision details

**Features**:
- Automatic region detection from IP/headers
- Health-based routing
- Latency optimization
- Failover to secondary regions
- Transparent request forwarding

## Shared Utilities

### Auth Utils (`regional-auth/auth-utils.ts`)

Provides shared utilities for all auth operations:

```typescript
// Get regional Supabase client
getRegionalSupabaseClient(region: string): SupabaseClient

// Get admin client for privileged operations
getRegionalSupabaseAdmin(region: string): SupabaseClient

// Detect region from request
detectRegionFromRequest(req: Request): string

// Create standardized response
createAuthResponse<T>(success: boolean, context: RegionalAuthContext, data?: T): AuthResponse<T>

// Verify JWT across regions
verifyRegionalJWT(token: string, region: string): Promise<TokenVerification>

// Sync profile across regions
syncUserProfileAcrossRegions(userId: string, sourceRegion: string): Promise<SyncResult>

// Log audit event
logAuthEvent(userId: string | null, eventType: string, region: string, requestId: string): Promise<void>
```

### Consistency Validators (`regional-auth/consistency-vali

/* … truncated 4498 chars — edit only what you need near the top … */
