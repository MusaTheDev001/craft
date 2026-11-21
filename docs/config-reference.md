# Configuration Reference

This document describes the environment variables used to configure the Craft platform.

## Stellar Network

| Variable | Description | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_STELLAR_NETWORK` | Selects the Stellar network (`public` or `testnet`). | `testnet` |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | Overrides the network passphrase used for signing and validating transactions. When set, this value takes precedence over the built-in public/testnet passphrases. | _(network default)_ |
| `NEXT_PUBLIC_HORIZON_URL` | Horizon endpoint used for network requests. | _(network default)_ |

### Network passphrase override

By default the passphrase is derived from `NEXT_PUBLIC_STELLAR_NETWORK`:

- `public` → `Public Global Stellar Network ; September 2015`
- `testnet` → `Test SDF Network ; September 2015`

For custom or private network deployments, set `NEXT_PUBLIC_NETWORK_PASSPHRASE` to the exact passphrase of your network. This value is honoured consistently by `resolveStellarNetworkConfig`, `getNetworkPassphrase`, and `validateNetworkPassphrase`.

Validation remains strict: only the configured passphrase is accepted. Any transaction signed with a different passphrase will fail validation, so ensure every service in the deployment uses the same value.

```bash
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_NETWORK_PASSPHRASE="My Custom Network ; 2024"
```
