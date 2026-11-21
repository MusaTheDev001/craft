import { Networks } from 'stellar-sdk';
import type { StellarNetworkConfig } from '@craft/types';
import { NetworkMismatchError } from './errors';

export const NETWORK_PASSPHRASES = {
  mainnet: Networks.PUBLIC,
  testnet: Networks.TESTNET,
} as const;

export const HORIZON_URLS = {
  mainnet: 'https://horizon.stellar.org',
  testnet: 'https://horizon-testnet.stellar.org',
} as const;

export const SOROBAN_RPC_URLS = {
  mainnet: 'https://mainnet.stellar.validationcloud.io/v1/soroban/rpc',
  testnet: 'https://soroban-testnet.stellar.org',
} as const;

type Network = 'mainnet' | 'testnet';

/**
 * Parses a raw network identifier into a canonical `Network`.
 *
 * Shared by `resolveNetwork` and `resolveStellarNetworkConfig` so both
 * resolvers behave identically:
 * - Trims surrounding whitespace (e.g. `" mainnet "` → `mainnet`).
 * - Normalises case (e.g. `"MAINNET"` → `mainnet`).
 * - Logs a warning and defaults to `testnet` for unknown or missing values.
 *
 * @param raw - The raw network value (may be undefined).
 * @returns The canonical network identifier.
 */
export function parseNetwork(raw: string | undefined): Network {
  if (raw === undefined) {
    return 'testnet';
  }
  const normalised = raw.trim().toLowerCase();
  if (normalised === 'mainnet') {
    return 'mainnet';
  }
  if (normalised === 'testnet') {
    return 'testnet';
  }
  console.warn(`Unrecognized STELLAR_NETWORK value: "${raw}". Expected 'mainnet' or 'testnet'. Defaulting to 'testnet'.`);
  return 'testnet';
}

function resolveNetwork(): Network {
  return parseNetwork(process.env.STELLAR_NETWORK ?? process.env.NEXT_PUBLIC_STELLAR_NETWORK);
}

/**
 * Returns a validated override URL, or `undefined` when the override is unset
 * or rejected. Overrides must use `https://` to avoid downgrading transport
 * security; non-https values are ignored with a warning so callers fall back
 * to the hard-coded default.
 */
function resolveHttpsOverride(raw: string | undefined, name: string): string | undefined {
  if (!raw) {
    return undefined;
  }
  if (!raw.startsWith('https://')) {
    console.warn(`Ignoring ${name} override: "${raw}" must use https://. Falling back to default.`);
    return undefined;
  }
  return raw;
}

/**
 * Resolves the effective network passphrase for a network.
 *
 * Honours the `NEXT_PUBLIC_NETWORK_PASSPHRASE` override when set, otherwise
 * falls back to the hard-coded public/testnet constants. Shared by
 * `getNetworkPassphrase` and `validateNetworkPassphrase` so both agree on the
 * configured value.
 */
function resolveNetworkPassphrase(net: Network): string {
  return process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || NETWORK_PASSPHRASES[net];
}

/**
 * Returns the Stellar network configuration for the given (or resolved)
 * network.
 *
 * Precedence: `NEXT_PUBLIC_HORIZON_URL` and `NEXT_PUBLIC_SOROBAN_RPC_URL`
 * overrides take precedence over the hard-coded defaults when set to a valid
 * `https://` URL. Unset or non-https overrides fall back to the defaults.
 */
export function getNetworkConfig(network?: Network): StellarNetworkConfig {
  const net = network ?? resolveNetwork();
  return {
    network: net,
    horizonUrl:
      resolveHttpsOverride(process.env.NEXT_PUBLIC_HORIZON_URL, 'NEXT_PUBLIC_HORIZON_URL') ??
      HORIZON_URLS[net],
    networkPassphrase: resolveNetworkPassphrase(net),
    sorobanRpcUrl:
      resolveHttpsOverride(process.env.NEXT_PUBLIC_SOROBAN_RPC_URL, 'NEXT_PUBLIC_SOROBAN_RPC_URL') ??
      SOROBAN_RPC_URLS[net],
  };
}

/**
 * Resolves Stellar network configuration from environment variables, with support for overrides.
 * Allows templates to customize network endpoints via NEXT_PUBLIC_* vars.
 *
 * Environment variables (in priority order):
 * - NEXT_PUBLIC_STELLAR_NETWORK: 'mainnet' or 'testnet' (default: 'testnet')
 * - NEXT_PUBLIC_HORIZON_URL: custom Horizon endpoint (overrides default)
 * - NEXT_PUBLIC_NETWORK_PASSPHRASE: custom network passphrase (overrides default)
 * - NEXT_PUBLIC_SOROBAN_RPC_URL: custom Soroban RPC endpoint (overrides default)
 *
 * @param env - Object of environment variables (typically process.env)
 * @returns Resolved Stellar network configuration
 *
 * @example
 * ```typescript
 * const config = resolveStellarNetworkConfig(process.env);
 * // Uses defaults: testnet Horizon/Soroban RPC with Test SDF Network passphrase
 *
 * const config = resolveStellarNetworkConfig({
 *   NEXT_PUBLIC_STELLAR_NETWORK: 'mainnet',
 *   NEXT_PUBLIC_HORIZON_URL: 'https://custom-horizon.example.com',
 * });
 * // Uses mainnet with custom Horizon URL but default mainnet passphrase/Soroban RPC
 * ```
 */
export function resolveStellarNetworkConfig(env: Record<string, string | undefined>): StellarNetworkConfig {
  const network = parseNetwork(env.NEXT_PUBLIC_STELLAR_NETWORK);
  return {
    network,
    horizonUrl: env.NEXT_PUBLIC_HORIZON_URL || HORIZON_URLS[network],
    networkPassphrase: env.NEXT_PUBLIC_NETWORK_PASSPHRASE || NETWORK_PASSPHRASES[network],
    sorobanRpcUrl: env.NEXT_PUBLIC_SOROBAN_RPC_URL || SOROBAN_RPC_URLS[network],
  };
}

/**
 * Validates that a transaction's network passphrase matches the target network.
 * Prevents cross-network transaction replay attacks.
 *
 * Honours the `NEXT_PUBLIC_NETWORK_PASSPHRASE` override: when set, only that
 * configured value is accepted (strict matching).
 *
 * @param transactionPassphrase - The passphrase used to sign the transaction
 * @param targetNetwork - The target network ('mainnet' or 'testnet')
 * @throws Error if passphrase doesn't match the target network
 *
 * @example
 * ```typescript
 * validateNetworkPassphrase(transaction.networkPassphrase, 'mainnet');
 * ```
 */
export function validateNetworkPassphrase(
  transactionPassphrase: string,
  targetNetwork?: Network
): void {
  const net = targetNetwork ?? resolveNetwork();
  const expectedPassphrase = resolveNetworkPassphrase(net);

  if (transactionPassphrase !== expectedPassphrase) {
    throw new NetworkMismatchError(transactionPassphrase, expectedPassphrase, net);
  }
}

/**
 * Get the Soroban RPC URL for the current or specified network.
 * Respects NEXT_PUBLIC_SOROBAN_RPC_URL env var override.
 */
export function getSorobanRpcUrl(network?: Network): string {
  return (
    process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ||
    SOROBAN_RPC_URLS[network ?? resolveNetwork()]
  );
}

/**
 * Get the network passphrase for the current or specified network.
 * Respects the NEXT_PUBLIC_NETWORK_PASSPHRASE env var override.
 */
export function getNetworkPassphrase(network?: Network): string {
  const net = network ?? resolveNetwork();
  return resolveNetworkPassphrase(net);
}

/**
 * Default config object whose `stellar` property is resolved fresh on every
 * access via a getter, so that changes to `STELLAR_NETWORK` /
 * `NEXT_PUBLIC_STELLAR_NETWORK` after module load are always reflected.
 *
 * Callers that need a one-time snapshot can still call `getNetworkConfig()`
 * directly; that remains the recommended approach for most use-cases.
 *
 * @example
 * ```ts
 * // Live read — always picks up the current env var:
 * const { network } = config.stellar;
 *
 * // Snapshot — freeze the value at call-time:
 * const snapshot = getNetworkConfig();
 * ```
 */
export const config: { readonly stellar: ReturnType<typeof getNetworkConfig> } = Object.defineProperties(
  {} as { readonly stellar: ReturnType<typeof getNetworkConfig> },
  {
    stellar: {
      get(): ReturnType<typeof getNetworkConfig> {
        return getNetworkConfig();
      },
      enumerable: true,
      configurable: false,
    },
  },
);

export default config;

// ---------------------------------------------------------------------------
// Multi-endpoint Horizon failover (#615)
// ---------------------------------------------------------------------------

/**
 * Configuration for multi-endpoint Horizon failover.
 *
 * ## Failover algorithm
 * 1. The first entry in `endpoints` is the primary.
 * 2. On every request, `selectEndpoint()` returns the first healthy endpoint.
 * 3. An endpoint is marked unhealthy when a request against it throws; it is
 *    re-checked after `recoveryMs` milliseconds (default 30 s).
 * 4. If all endpoints are unhealthy the primary is returned as a last resort
 *    so callers always receive a usable URL.
 *
 * ## Configuration
 * ```ts
 * const failover = createHorizonFailover({
 *   endpoints: ['https://horizon.stellar.org', 'https://horizon.example.com'],
 * });
 * const url = failover.selectEndpoint();
 * // … after a failed request:
 * failover.markUnhealthy(url);
 * ```
 */
export interface HorizonFailoverConfig {
  /** Ordered list of Horizon URLs. First entry is the prim

/* … truncated 1658 chars — edit only what you need near the top … */
