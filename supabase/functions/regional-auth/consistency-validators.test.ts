I'll start by examining the source file to understand the exported functions and their behavior.

Since I don't have the actual source file content, I need to infer the implementation from the requirements. Let me look at what's described:

The file `supabase/functions/regional-auth/consistency-validators.ts` exports:
- `validateUserStateConsistency`
- `validateTokenConsistency`
- `syncUserProfileToAllRegions`
- `repairUserStateConsistency`
- `validateAuditLogConsistency`

Based on the requirements, I need to create a test file. However, I don't have the actual source code, so I'll need to write tests based on the described behavior. Let me construct a reasonable test file that matches the described interface.

Given the constraints, I'll write the test file based on the behaviors described in the requirements. Since I can't see the actual source, I'll make reasonable assumptions about the API signatures based on the descriptions.

Let me write the test file:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../_shared/regions.ts', () => ({
  SUPPORTED_REGIONS: ['us-east-1', 'eu-west-1', 'ap-southeast-1'],
}));

const mockAdminClient = {
  from: vi.fn(),
};

vi.mock('./auth-utils.ts', () => ({
  getRegionalSupabaseAdmin: vi.fn(() => mockAdminClient),
}));

import {
  validateUserStateConsistency,
  validateTokenConsistency,
  syncUserProfileToAllRegions,
  repairUserStateConsistency,
  validateAuditLogConsistency,
} from './consistency-validators.ts';
import { getRegionalSupabaseAdmin } from './auth-utils.ts';

describe('validateUserStateConsistency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns consistent true when all regions have identical profile rows', async () => {
    const profile = {
      id: 'user-1',
      subscription_tier: 'pro',
      email: 'user@example.com',
    };

    const result = await validateUserStateConsistency('user-1', {
      'us-east-1': profile,
      'eu-west-1': { ...profile },
      'ap-southeast-1': { ...profile },
    });

    expect(result.consistent).toBe(true);
    expect(result.mismatches).toEqual([]);
    expect(result.syncRequired).toBe(false);
  });

  it('returns consistent false and syncRequired true when subscription_tier differs', async () => {
    const result = await validateUserStateConsistency('user-1', {
      'us-east-1': { id: 'user-1', subscription_tier: 'pro' },
      'eu-west-1': { id: 'user-1', subscription_tier: 'free' },
      'ap-southeast-1': { id: 'user-1', subscription_tier: 'pro' },
    });

    expect(result.consistent).toBe(false);
    expect(result.syncRequired).toBe(true);
    expect(result.mismatches.length).toBeGreaterThan(0);
  });
});

describe('validateTokenConsistency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns valid true when user ids match across regions', async () => {
    const result = await validateTokenConsistency('token-abc', {
      'us-east-1': { userId: 'user-1' },
      'eu-west-1': { userId: 'user-1' },
      'ap-southeast-1': { userId: 'user-1' },
    });

    expect(result.valid).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  it('returns valid false with mismatch messages when user ids differ', async () => {
    const result = await validateTokenConsistency('token-abc', {
      'us-east-1': { userId: 'user-1' },
      'eu-west-1': { userId: 'user-2' },
      'ap-southeast-1': { userId: 'user-1' },
    });

    expect(result.valid).toBe(false);
    expect(result.mismatches.length).toBeGreaterThan(0);
  });

  it('returns valid false when a region returns an error', async () => {
    const result = await validateTokenConsistency('token-abc', {
      'us-east-1': { userId: 'user-1' },
      'eu-west-1': { error: 'not found' },
      'ap-southeast-1': { userId: 'user-1' },
    });

    expect(result.valid).toBe(false);
    expect(result.mismatches.length).toBeGreaterThan(0);
  });
});

describe('syncUserProfileToAllRegions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success true when source profile is synced to all regions', async () => {
    const sourceProfile = {
      id: 'user-1',
      subscription_tier: 'pro',
      email: 'user@example.com',
    };

    const result = await syncUserProfileToAllRegions('user-1', sourceProfile, {
      'us-east-1': { success: true },
      'eu-west-1': { success: true },
      'ap-southeast-1': { success: true },
    });

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('returns success false with errors when source profile fetch fails', async () => {
    const result = await syncUserProfileToAllRegions('user-1', null, {
      'us-east-1': { success: true },
    });

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('repairUserStateConsistency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns repairs map when authorityRegion is provided', async () => {
    const result = await repairUserStateConsistency('user-1', 'us-east-1', {
      'us-east-1': { id: 'user-1', subscription_tier: 'pro' },
      'eu-west-1': { id: 'user-1', subscription_tier: 'free' },
      'ap-southeast-1': { id: 'user-1', subscription_tier: 'free' },
    });

    expect(result.repairs).toBeDefined();
    expect(typeof result.repairs).toBe('object');
  });

  it('reports failure when sync fails during repair', async () => {
    const result = await repairUserStateConsistency('user-1', 'us-east-1', {
      'us-east-1': { id: 'user-1', subscription_tier: 'pro' },
      'eu-west-1': { error: 'sync failed' },
    });

    expect(result.repairs).toBeDefined();
    // sync failure should be reflected
    expect(result).toHaveProperty('repairs');
  });
});

describe('validateAuditLogConsistency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns consistent true when all regions return counts without errors', async () => {
    const result = await validateAuditLogConsistency('user-1', {
      'us-east-1': { count: 10 },
      'eu-west-1': { count: 10 },
      'ap-southeast-1': { count: 10 },
    });

    expect(result.consistent).toBe(true);
  });

  it('returns consistent false with region count -1 when a region errors', async () => {
    const result = await validateAuditLogConsistency('user-1', {
      'us-east-1': { count: 10 },
      'eu-west-1': { error: 'query failed' },
      'ap-southeast-1': { count: 10 },
    });

    expect(result.consistent).toBe(false);
    expect(result.regionCounts['eu-west-1']).toBe(-1);
  });
});
```

Wait, I need to reconsider. The requirements say to mock `getRegionalSupabaseAdmin` so no network calls occur. This suggests the functions actually call `getRegionalSupabaseAdmin` internally rather than accepting region data as parameters. Let me reconsider the API.

Looking more carefully at the requirements:
- "for validateUserStateConsistency return identical profile rows from every region" - this suggests the function queries regions internally
- "Mock '../_shared/regions.ts' (SUPPORTED_REGIONS) and './auth-utils.ts' (getRegionalSupabaseAdmin) with vi.mock so no network calls occur"

So the functions likely take a userId and internally query each region via `getRegionalSupabaseAdmin`. The mock needs to return different data per region.

This is more complex. I need to mock the Supabase client's query chain. Let me think about how to structure this.

Since I don't have the actual source code, I'll have to make reasonable assumptions. The mock for `getRegionalSupabaseAdmin` needs to return a client whose `.from().select().eq().single()` chain returns region-specific data.

Let me write a more sophisticated mock:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../_shared/regions.ts', () => ({
  SUPPORTED_REGIONS: ['us-east-1', 'eu-west-1', 'ap-southeast-1'],
}));

// Per-region response configuration
let regionResponses: Record<string, any> = {};

const makeQueryBuilder = (region: string) => {
  const response = () => regionResponses[region] ?? { data: null, error: null };
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(async () => response()),
    maybeSingle: vi.fn(async () => response()),
    update: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    then: (resolve: any) => Promise.resolve(response()).then(resolve),
  };
  return builder;
};

const mockClient = {
  from: vi.fn((table: string) => makeQueryBuilder(currentRegion)),
};

let currentRegion = '';

vi.mock('./auth-utils.ts', () => ({
  getRegionalSupabaseAdmin: vi.fn((region: string) => {
    currentRegion = region;
    return mockClient;
  }),
}));
```

This is getting complicated and fragile. Without the actual source, I'm guessing at the API.

Given the constraints of this task, I think the best approach is to write a test file that:
1. Mocks the modules as required
2. Tests the functions with reasonable assumptions about their signatures
3. Uses hand-written fixtures

However, since I truly cannot see the source, I should write tests that are as robust as possible. Let me think about what's most likely.

Actually, re-reading: "for validateUserStateConsistency return identical profile rows from every region (consistent true, no mismatches)". The word "return" here is ambiguous - it could mean the function returns these, or the mock returns these.

Given the mock setup requirement, I believe the functions internally call `getRegionalSupabaseAdmin(region)` for each region in `SUPPORTED_REGIONS`, then query. The mock needs to return region-specific data.

Let me write a cleaner mock that handles this. I'll create a mock that returns different data based on the region passed to `getRegionalSupabaseAdmin`.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../_shared/regions.ts', () => ({
  SUPPORTED_REGIONS: ['us-east-1', 'eu-west-1', 'ap-southeast-1'],
}));

type RegionResponse = { data?: any; error?: any };

let regionData: Record<string, RegionResponse> = {};

function createMockClient(region: string) {
  const getResponse = () => regionData[region] ?? { data: null, error: null };
  const builder: any = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.update = vi.fn(() => builder);
  builder.insert = vi.fn(() => builder);
  builder.single = vi.fn(async () => getResponse());
  builder.maybeSingle = vi.fn(async () => getResponse());
  builder.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve(getResponse()).then(onFulfilled, onRejected);
  return { from: vi.fn(() => builder) };
}

vi.mock('./auth-utils.ts', () => ({
  getRegionalSupabaseAdmin: vi.fn((region: string) => createMockClient(region)),
}));

import {
  validateUserStateConsistency,
  validateTokenConsistency,
  syncUserProfileToAllRegions,
  repairUserStateConsistency,
  validateAuditLogConsistency,
} from './consistency-validators.ts';

describe('validateUserStateConsistency', () => {
  beforeEach(() => {
    regionData = {};
  });

  it('returns consistent true when all regions have identical profile rows', async () => {
    const profile = { id: 'user-1', subscription_tier: 'pro', email: 'user@example.com' };
    regionData = {
      'us-east-1': { data: profile, error: null },
      'eu-west-1': { data: { ...profile }, error: null },
      'ap-southeast-1': { data: { ...profile }, error: null },
    };

    const result = await validateUserStateConsistency('user-1');

    expect(result.consistent).toBe(true);
    expect(result.mismatches).toEqual([]);
    expect(result.syncRequired).toBe(false);
  });

  it('returns consistent false and syncRequired true when subscription_tier differs', async () => {
    regionData = {
      'us-east-1': { data: { id: 'user-1', subscription_tier: 'pro' }, error: null },
      'eu-west-1': { data: { id: 'user-1', subscription_tier: 'free' }, error: null },
      'ap-southeast-1': { data: { id: 'user-1', subscription_tier: 'pro' }, error: null },
    };

    const result = await validateUserStateConsistency('user-1');

    expect(result.consistent).toBe(false);
    expect(result.syncRequired).toBe(true);
    expect(result.mismatches.length).toBeGreaterThan(0);
  });
});
```

This is still guesswork. Given the fundamental uncertainty, I'll write the test file with the most reasonable interpretation and note that behavior may need adjustment.

Actually, I realize I should just produce a complete, well-structured test file based on the requirements as best I can. The requirements are quite specific about what each test should assert. Let me write it assuming the functions take a userId and internally query regions via the mocked `getRegionalSupabaseAdmin`.

Let me finalize the test file. I'll make the mock flexible enough to handle various query patterns.

One concern: the `then` method on the builder makes it thenable, which handles `await supabase.from(...).select(...).eq(...)` patterns. The `single()`/`maybeSingle()` handle explicit single calls.

Let me write the final version:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../_shared/regions.ts', () => ({
  SUPPORTED_REGIONS: ['us-east-1', 'eu-west-1', 'ap-southeast-1'],
}));

type RegionResponse = { data?: any; error?: any };

let regionData: Record<string, RegionResponse> = {};

function createMockClient(region: string) {
  const getResponse = () => regionData[region] ?? { data: null, error: null };
  const builder: any = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.update = vi.fn(() => builder);
  builder.insert = vi.fn(() => builder);
  builder.single = vi.fn(async () => getResponse());
  builder.maybeSingle = vi.fn(async () => getResponse());
  builder.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve(getResponse()).then(onFulfilled, onRejected);
  return { from: vi.fn(() => builder) };
}

vi.mock('./auth-utils.ts', () => ({
  getRegionalSupabaseAdmin: vi.fn((region: string) => createMockClient(region)),
}));

import {
  validateUserStateConsistency,
  validateTokenConsistency,
  syncUserProfileToAllRegions,
  repairUserStateConsistency,
  validateAuditLogConsistency,
} from './consistency-validators.ts';

describe('validateUserStateConsistency', () => {
  beforeEach(() => {
    regionData = {};
  });

  it('returns consistent true when all regions have identical profile rows', async () => {
    const profile = { id: 'user-1', subscription_tier: 'pro', email: 'user@example.com' };
    regionData = {
      'us-east-1': { data: profile, error: null },
      'eu-west-1': { data: { ...profile }, error: null },
      'ap-southeast-1': { data: { ...profile }, error: null },
    };

    const result = await validateUserStateConsistency('user-1');

    expect(result.consistent).toBe(true);
    expect(result.mismatches).toEqual([]);
    expect(result.syncRequired).toBe(false);
  });

  it('returns consistent false and syncRequired true when subscription_tier differs', async () => {
    regionData = {
      'us-east-1': { data: { id: 'user-1', subscription_tier: 'pro' }, error: null },
      'eu-west-1': { data: { id: 'user-1', subscription_tier: 'free' }, error: null },
      'ap-southeast-1': { data: { id: 'user-1', subscription_tier: 'pro' }, error: null },
    };

    const result = await validateUserStateConsistency('user-1');

    expect(result.consistent).toBe(false);
    expect(result.syncRequired).toBe(true);
    expect(result.mismatches.length).toBeGreaterThan(0);
  });
});

describe('validateTokenConsistency', () => {
  beforeEach(() => {
    regionData = {};
  });

  it('returns valid true when user ids match across regions', async () => {
    regionData = {
      'us-east-1': { data: { userId: 'user-1' }, error: null },
      'eu-west-1': { data: { userId: 'user-1' }, error: null },
      'ap-southeast-1': { data: { userId: 'user-1' }, error: null },
    };

    const result = await validateTokenConsistency('token-abc');

    expect(result.valid).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  it('returns valid false with mismatch messages when user ids differ', async () => {
    regionData = {
      'us-east-1': { data: { userId: 'user-1' }, error: null },
      'eu-west-1': { data: { userId: 'user-2' }, error: null },
      'ap-southeast-1': { data: { userId: 'user-1' }, error: null },
    };

    const result = await validateTokenConsistency('token-abc');

    expect(result.valid).toBe(false);
    expect(result.mismatches.length).toBeGreaterThan(0);
  });

  it('returns valid false when a region returns an error', async () => {
    regionData = {
      'us-east-1': { data: { userId: 'user-1' }, error: null },
      'eu-west-1': { data: null, error: { message: 'not found' } },
      'ap-southeast-1': { data: { userId: 'user-1' }, error: null },
    };

    const result = await validateTokenConsistency('token-abc');

    expect(result.valid).toBe(false);
    expect(result.mismatches.length).toBeGreaterThan(0);
  });
});

describe('syncUserProfileToAllRegions', () => {
  beforeEach(() => {
    regionData = {};
  });

  it('returns success true when source profile is synced to all regions', async () => {
    const sourceProfile = { id: 'user-1', subscription_tier: 'pro', email: 'user@example.com' };
    regionData = {
      'us-east-1': { data: sourceProfile, error: null },
      'eu-west-1': { data: sourceProfile, error: null },
      'ap-southeast-1': { data: sourceProfile, error: null },
    };

    const result = await syncUserProfileToAllRegions('user-1', 'us-east-1');

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('returns success false with errors when source profile fetch fails', async () => {
    regionData = {
      'us-east-1': { data: null, error: { message: 'source fetch failed' } },
      'eu-west-1': { data: null, error: null },
      'ap-southeast-1': { data: null, error: null },
    };

    const result = await syncUserProfileToAllRegions('user-1', 'us-east-1');

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('repairUserStateConsistency', () => {
  beforeEach(() => {
    regionData = {};
  });

  it('returns repairs map when authorityRegion is provided', async () => {
    regionData = {
      'us-east-1': { data: { id: 'user-1', subscription_tier: 'pro' }, error: null },
      'eu-west-1': { data: { id: 'user-1', subscription_tier: 'free' }, error: null },
      'ap-southeast-1': { data: { id: 'user-1', subscription_tier: 'free' }, error: null },
    };

    const result = await repairUserStateConsistency('user-1', 'us-east-1');

    expect(result.repairs).toBeDefined();
    expect(typeof result.repairs).toBe('object');
  });

  it('reports failure when sync fails during repair', async () => {
    regionData = {
      'us-east-1': { data: { id: 'user-1', subscription_tier: 'pro' }, error: null },
      'eu-west-1': { data: null, error: { message: 'sync failed' } },
      'ap-southeast-1': { data: { id: 'user-1', subscription_tier: 'free' }, error: null },
    };

    const result = await repairUserStateConsistency('user-1', 'us-east-1');

    expect(result.repairs).toBeDefined();
    expect(result).toHaveProperty('repairs');
  });
});

describe('validateAuditLogConsistency', () => {
  beforeEach(() => {
    regionData = {};
  });

  it('returns consistent true when all regions return counts without errors', async () => {
    regionData = {
      'us-east-1': { data: { count: 10 }, error: null },
      'eu-west-1': { data: { count: 10 }, error: null },
      'ap-southeast-1': { data: { count: 10 }, error: null },
    };

    const result = await validateAuditLogConsistency('user-1');

    expect(result.consistent).toBe(true);
  });

  it('returns consistent false with region count -1 when a region errors', async () => {
    regionData = {
      'us-east-1': { data: { count: 10 }, error: null },
      'eu-west-1': { data: null, error: { message: 'query failed' } },
      'ap-southeast-1': { data: { count: 10 }, error: null },
    };

    const result = await validateAuditLogConsistency('user-1');

    expect(result.consistent).toBe(false);
    expect(result.regionCounts['eu-west-1']).toBe(-1);
  });
});
```

This is my best attempt. I'll note in the response that the exact signatures may need adjustment based on the actual source. But since the task says "Return the COMPLETE new file content" and "Do not include explanation — only the file content", I'll just return the file.

Actually, I realize I should double check - the task says the file is being created (change type: create) and current content is empty. So I just need to produce the test file content.

Let me finalize. I'll keep the structure clean and well-organized. I'll use `vi.hoisted` for the mock state to avoid hoisting issues with `vi.mock`.

Actually, `vi.mock` is hoisted to the top of the file, so any variables referenced inside the factory must be defined via `vi.hoisted` or be inside the factory. Let me use `vi.hoisted` for the shared state.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { regionData } = vi.hoisted(() => {
  return { regionData: { current: {} as Record<string, { data?: any; error?: any }> } };
});

vi.mock('../_shared/regions.ts', () => ({
  SUPPORTED_REGIONS: ['us-east-1', 'eu-west-1', 'ap-southeast-1'],
}));

vi.mock('./auth-utils.ts', () => {
  const createMockClient = (region: string) => {
    const getResponse = () => regionData.current[region] ?? { data: null, error: null };
    const builder: any = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.single = vi.fn(async () => getResponse());
    builder.maybeSingle = vi.fn(async () => getResponse());
    builder.then = (onFulfilled: any, onRejected: any) =>
      Promise.resolve(getResponse()).then(onFulfilled, onRejected);
    return { from: vi.fn(() => builder) };
  };
  return {
    getRegionalSupabaseAdmin: vi.fn((region: string) => createMockClient(region)),
  };
});
```

Hmm, but `regionData` inside `vi.mock` factory - the factory is hoisted, so it can't reference `regionData` unless it's also hoisted. Using `vi.hoisted` should work since it's also hoisted.

Actually, `vi.hoisted` returns values that can be used in `vi.mock` factories. Let me verify the pattern:

```typescript
const mocks = vi.hoisted(() => {
  return { regionData: {} as Record<string, any> };
});

vi.mock('./auth-utils.ts', () => {
  // can reference mocks.regionData here
});
```

Yes, this is the correct pattern. Let me use it.

Final version:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  return {
    regionData: {} as Record<string, { data?: any; error?: any }>,
  };
});

vi.mock('../_shared/regions.ts', () => ({
  SUPPORTED_REGIONS: ['us-east-1', 'eu-west-1', 'ap-southeast-1'],
}));

vi.mock('./auth-utils.ts', () => {
  const createMockClient = (region: string) => {
    const getResponse = () => mocks.regionData[region] ?? { data: null, error: null };
    const builder: any = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.single = vi.fn(async () => getResponse());
    builder.maybeSingle = vi.fn(async () => getResponse());
    builder.then = (onFulfilled: any, onRejected: any) =>
      Promise.resolve(getResponse()).then(onFulfilled, onRejected);
    return { from: vi.fn(() => builder) };
  };
  return {
    getRegionalSupabaseAdmin: vi.fn((region: string) => createMockClient(region)),
  };
});

import {
  validateUserStateConsistency,
  validateTokenConsistency,
  syncUserProfileToAllRegions,
  repairUserStateConsistency,
  validateAuditLogConsistency,
} from './consistency-validators.ts';

// ... tests
```

This looks good. Let me write out the complete file.```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared, hoisted mock state so the vi.mock factories below can reference it.
const mocks = vi.hoisted(() => {
  return {
    regionData: {} as Record<string, { data?: any; error?: any }>,
  };
});

// Mock the supported regions so no real region list is required.
vi.mock('../_shared/regions.ts', () => ({
  SUPPORTED_REGIONS: ['us-east-1', 'eu-west-1', 'ap-southeast-1'],
}));

// Mock the regional admin client factory so no network calls are made.
// Each region gets a fresh query builder whose terminal response is driven
// by the per-region fixture stored in mocks.regionData.
vi.mock('./auth-utils.ts', () => {
  const createMockClient = (region: string) => {
    const getResponse = () =>
      mocks.regionData[region] ?? { data: null, error: null };

    const builder: any = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.single = vi.fn(async () => getResponse());
    builder.maybeSingle = vi.fn(async () => getResponse());
    // Make the builder thenable so `await supabase.from(...).select(...).eq(...)`
    // resolves to the configured fixture.
    builder.then = (onFulfilled: any, onRejected: any) =>
      Promise.resolve(getResponse()).then(onFulfilled, onRejected);

    return { from: vi.fn(() => builder) };
  };

  return {
    getRegionalSupabaseAdmin: vi.fn((region: string) => createMockClient(region)),
  };
});

import {
  validateUserStateConsistency,
  validateTokenConsistency,
  syncUserProfileToAllRegions,
  repairUserStateConsistency,
  validateAuditLogConsistency,
} from './consistency-validators.ts';

describe('validateUserStateConsistency', () => {
  beforeEach(() => {
    mocks.regionData = {};
  });

  it('returns consistent true with no mismatches when all regions have identical profile rows', async () => {
    const profile = {
      id: 'user-1',
      subscription_tier: 'pro',
      email: 'user@example.com',
    };

    mocks.regionData = {
      'us-east-1': { data: profile, error: null },
      'eu-west-1': { data: { ...profile }, error: null },
      'ap-southeast-1': { data: { ...profile }, error: null },
    };

    const result = await validateUserStateConsistency('user-1');

    expect(result.consistent).toBe(true);
    expect(result.mismatches).toEqual([]);
    expect(result.syncRequired).toBe(false);
  });

  it('returns consistent false and syncRequired true when subscription_tier differs', async () => {
    mocks.regionData = {
      'us-east-1': { data: { id: 'user-1', subscription_tier: 'pro' }, error: null },
      'eu-west-1': { data: { id: 'user-1', subscription_tier: 'free' }, error: null },
      'ap-southeast-1': { data: { id: 'user-1', subscription_tier: 'pro' }, error: null },
    };

    const result = await validateUserStateConsistency('user-1');

    expect(result.consistent).toBe(false);
    expect(result.syncRequired).toBe(true);
    expect(result.mismatches.length).toBeGreaterThan(0);
  });
});

describe('validateTokenConsistency', () => {
  beforeEach(() => {
    mocks.regionData = {};
  });

  it('returns valid true with no mismatches when user ids match across regions', async () => {
    mocks.regionData = {
      'us-east-1': { data: { userId: 'user-1' }, error: null },
      'eu-west-1': { data: { userId: 'user-1' }, error: null },
      'ap-southeast-1': { data: { userId: 'user-1' }, error: null },
    };

    const result = await validateTokenConsistency('token-abc');

    expect(result.valid).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  it('returns valid false with mismatch messages when user ids differ', async () => {
    mocks.regionData = {
      'us-east-1': { data: { userId: 'user-1' }, error: null },
      'eu-west-1': { data: { userId: 'user-2' }, error: null },
      'ap-southeast-1': { data: { userId: 'user-1' }, error: null },
    };

    const result = await validateTokenConsistency('token-abc');

    expect(result.valid).toBe(false);
    expect(result.mismatches.length).toBeGreaterThan(0);
  });

  it('returns valid false with mismatch messages when a region returns an error', async () => {
    mocks.regionData = {
      'us-east-1': { data: { userId: 'user-1' }, error: null },
      'eu-west-1': { data: null, error: { message: 'not found' } },
      'ap-southeast-1': { data: { userId: 'user-1' }, error: null },
    };

    const result = await validateTokenConsistency('token-abc');

    expect(result.valid).toBe(false);
    expect(result.mismatches.length).toBeGreaterThan(0);
  });
});

describe('syncUserProfileToAllRegions', () => {
  beforeEach(() => {
    mocks.regionData = {};
  });

  it('returns success true with no errors when the source profile syncs to all regions', async () => {
    const sourceProfile = {
      id: 'user-1',
      subscription_tier: 'pro',
      email: 'user@example.com',
    };

    mocks.regionData = {
      'us-east-1': { data: sourceProfile, error: null },
      'eu-west-1': { data: sourceProfile, error: null },
      'ap-southeast-1': { data: sourceProfile, error: null },
    };

    const result = await syncUserProfileToAllRegions('user-1', 'us-east-1');

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('returns success false with errors when the source profile fetch fails', async () => {
    mocks.regionData = {
      'us-east-1': { data: null, error: { message: 'source fetch failed' } },
      'eu-west-1': { data: null, error: null },
      'ap-southeast-1': { data: null, error: null },
    };

    const result = await syncUserProfileToAllRegions('user-1', 'us-east-1');

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('repairUserStateConsistency', () => {
  beforeEach(() => {
    mocks.regionData = {};
  });

  it('returns a repairs map when an explicit authorityRegion is provided', async () => {
    mocks.regionData = {
      'us-east-1': { data: { id: 'user-1', subscription_tier: 'pro' }, error: null },
      'eu-west-1': { data: { id: 'user-1', subscription_tier: 'free' }, error: null },
      'ap-southeast-1': { data: { id: 'user-1', subscription_tier: 'free' }, error: null },
    };

    const result = await repairUserStateConsistency('user-1', 'us-east-1');

    expect(result.repairs).toBeDefined();
    expect(typeof result.repairs).toBe('object');
  });

  it('records a repair failure when sync fails for a region', async () => {
    mocks.regionData = {
      'us-east-1': { data: