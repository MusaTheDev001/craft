# API Middleware Guide

This guide describes the middleware helpers that wrap API route handlers in
`apps/backend`. Each helper is a higher-order function that takes a handler and
returns a new handler with the cross-cutting concern applied.

## `withIdempotency`

`withIdempotency` makes mutating endpoints safe to retry. Clients send an
`Idempotency-Key` header; the middleware records the first response for that key
and replays it for any subsequent request that reuses the key.

### Key scoping (security)

Idempotency keys are **scoped per user**. Two different users may send the same
`Idempotency-Key` value without colliding — each user's keys live in their own
namespace. A key issued by one user can never be used to read or replay another
user's cached response.

### Caching policy

Not every response is cached. The middleware only stores responses that are safe
to replay:

| Status class | Cached? | Notes |
| --- | --- | --- |
| `2xx` (success) | Yes | The successful response is stored and replayed. |
| Permanent `4xx` (e.g. `400`, `404`, `409`, `422`) | Yes | Deterministic client errors are replayed so retries see the same result. |
| `5xx` (server errors) | No | Transient failures are **not** cached, so a retry can succeed. |

Because `5xx` responses are never cached, a client that receives a server error
can safely retry with the same key and get a fresh attempt.

### The `Idempotent-Replayed` header

When a request is served from the cache instead of executing the handler again,
the response includes:

```
Idempotent-Replayed: true
```

A fresh (non-replayed) response omits this header. Clients can use its presence
to distinguish a first execution from a replay.

### Example

First request — the handler runs and the response is cached:

```bash
curl -X POST https://craft.app/api/deployments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 6f1c2a9e-4b7d-4c1e-9a2f-1d3e5b7c9a0f" \
  -d '{"projectId":"prj_123"}'
```

```
HTTP/1.1 201 Created
Content-Type: application/json

{ "id": "dep_456", "status": "queued" }
```

Retrying with the same key — the cached response is replayed and the
`Idempotent-Replayed` header is set:

```bash
curl -i -X POST https://craft.app/api/deployments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 6f1c2a9e-4b7d-4c1e-9a2f-1d3e5b7c9a0f" \
  -d '{"projectId":"prj_123"}'
```

```
HTTP/1.1 201 Created
Content-Type: application/json
Idempotent-Replayed: true

{ "id": "dep_456", "status": "queued" }
```

### Configuration

Cache TTL and maximum cache size are controlled by environment variables. See
[`.env.example`](../.env.example) for the full list of variables and their
defaults.
