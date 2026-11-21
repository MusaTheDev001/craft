# Cron Authentication Flow and `CRON_SECRET` Rotation

This document describes how the backend's cron routes are authenticated, how the
`withCronAuth` wrapper enforces that authentication, and how to rotate the
`CRON_SECRET` used by Vercel Cron.

## Overview

All scheduled jobs are exposed as HTTP routes under
`apps/backend/src/app/api/cron`. Because these routes trigger privileged work
(sending notifications, processing queues, cleaning up data, etc.), they must
not be callable by arbitrary clients. Each route is wrapped with `withCronAuth`,
which validates a shared secret before the handler runs.

## Cron routes

The cron routes live under `apps/backend/src/app/api/cron`:

- `apps/backend/src/app/api/cron/route.ts` — the default cron entrypoint.
- Any additional subdirectories under `apps/backend/src/app/api/cron/*/route.ts`
  follow the same authentication contract.

Every one of these handlers must be wrapped with `withCronAuth`; a cron route
that is not wrapped is unauthenticated and must be treated as a bug.

## How `withCronAuth` works

`withCronAuth` is a higher-order function that wraps a route handler:

1. It reads the expected secret from the `CRON_SECRET` environment variable.
2. It reads the incoming `Authorization` header from the request.
3. It compares the presented token against the expected secret using a
   constant-time comparison.
4. On success it invokes the wrapped handler; on failure it returns `401`.

### Bearer token format

Requests must present the secret as a Bearer token:

```
Authorization: Bearer <CRON_SECRET>
```

Vercel Cron automatically sends this header when `CRON_SECRET` is configured in
the project's environment variables, so no extra configuration is required on
the Vercel side beyond setting the variable.

### Constant-time comparison

The token comparison is performed in constant time (for example with
`crypto.timingSafeEqual`) so that response timing does not leak information
about how many characters of the secret matched. Length mismatches are rejected
before the constant-time comparison, since `timingSafeEqual` requires equal-length
buffers.

## Fail-closed behaviour

Authentication is **fail-closed**: if anything is missing or misconfigured, the
request is rejected rather than allowed.

- If `CRON_SECRET` is unset or empty, every request is rejected with `401`.
- If the `Authorization` header is missing or malformed, the request is rejected
  with `401`.
- If the presented token does not match the secret, the request is rejected with
  `401`.

This means a misconfigured deployment will stop running cron jobs (visible as
failing cron invocations in Vercel) instead of exposing them publicly. When cron
jobs start failing with `401`, check that `CRON_SECRET` is set in the target
environment and that it matches the value Vercel Cron is sending.

## Rotating `CRON_SECRET`

Rotate the secret periodically, and immediately if it may have leaked. Because
Vercel Cron reads the secret from the project's environment variables, rotation
is a coordinated update of the environment variable and a redeploy.

### Rotation checklist

1. Generate a new secret, e.g. `openssl rand -hex 32`.
2. In the Vercel project settings, update the `CRON_SECRET` environment variable
   for the affected environment(s) (Preview and Production as needed).
3. Redeploy the project so the new value is picked up by the running functions.
4. Confirm Vercel Cron invocations succeed after the redeploy (no `401`s in the
   cron logs).
5. Revoke/remove the old secret from any other systems that referenced it
   (local `.env` files, CI secrets, password managers).
6. Record the rotation date and the operator in your team's secret-management
   log.

> Note: Vercel Cron and the deployed functions read the same `CRON_SECRET`, so
> updating the variable and redeploying keeps them in sync. Avoid running two
> different secrets at once; if a zero-downtime rotation is required, coordinate
> the environment update and redeploy together.

## Local testing

To exercise cron routes locally, set `CRON_SECRET` in your local environment and
call the route with the matching header:

```
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron
```

Without the header (or with a wrong secret) the route returns `401`.
